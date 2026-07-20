/* ══════════════════════════════════════════════════════════════════════════
   CHAT ACTION SERVICE — lets a chat message trigger real app actions.
   Supports: navigating to a known tab (or a specific record inside it, e.g.
   "open task X"), opening an external URL. Deliberately narrow (viewing
   only, no writes/destructive actions) per the "AXE Core chat can act on
   the app" scope.
   ══════════════════════════════════════════════════════════════════════════ */

import { NAV_ITEMS, type NavItem } from '@/domain/navRegistry';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { n8nListWorkflows, isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';

export type ChatAction =
  | { kind: 'navigate'; path: string; label: string }
  | { kind: 'open_url'; url: string }
  | { kind: 'clarify'; message: string }
  | null;

// Words that can trail a keyword before the actual record name starts,
// e.g. "open task called fix the login bug" or "show me agent named Eve".
const RECORD_FILLER_RE = /^(called|named|titled|title|about|for|on|:|-|—|,)\s+/i;

// Verbs/phrases that signal "the user wants to be taken somewhere" — required
// so ordinary chat about a topic ("what's happening in trading?") isn't
// mistaken for a navigation command.
const OPEN_VERB_RE = /\b(open|show( me)?|go to|goto|navigate to|take me to|switch to|pull up|bring up|laat.*zien|ga naar|open.*voor mij)\b/i;

const URL_RE = /(https?:\/\/[^\s]+|(?:www\.)[^\s]+\.[a-z]{2,}[^\s]*)/i;

function normalizeUrl(raw: string): string {
  const trimmed = raw.replace(/[.,;!?)]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** A NavItem match plus where its keyword ended in the original text, so we
 *  can pull out whatever record name (if any) trails it. */
interface NavMatch { item: NavItem; matchEnd: number }

function matchNavItems(lowerText: string): NavMatch[] {
  const byItem = new Map<NavItem, number>();
  for (const item of NAV_ITEMS) {
    for (const kw of item.keywords) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const m = re.exec(lowerText);
      if (m) {
        const end = m.index + m[0].length;
        // Prefer the longest/latest keyword match for this item, since it
        // most precisely marks where a trailing record name would start.
        const prevEnd = byItem.get(item);
        if (prevEnd === undefined || end > prevEnd) byItem.set(item, end);
      }
    }
  }
  return Array.from(byItem.entries()).map(([item, matchEnd]) => ({ item, matchEnd }));
}

/** Pulls out whatever text trails a matched tab keyword, e.g. "open task
 *  called fix the login bug" -> "fix the login bug". Returns '' when there's
 *  nothing meaningful left (i.e. the message was just "open <tab>"). */
function extractRecordQuery(originalText: string, matchEnd: number): string {
  let rest = originalText.slice(matchEnd).trim();
  // Strip one leading filler word/punctuation ("called", "named", ":", etc.)
  rest = rest.replace(RECORD_FILLER_RE, '').trim();
  // Strip wrapping quotes.
  rest = rest.replace(/^["'“‘](.+)["'”’]$/, '$1').trim();
  // Trailing punctuation from the sentence.
  rest = rest.replace(/[.,;!?]+$/, '').trim();
  return rest;
}

type RecordMatch = { id: string; label: string } | 'not_found' | 'ambiguous';

/**
 * Looks up a specific record (task, agent, memory entry, KB document, cron
 * workflow) by fuzzy name/title match, so chat can deep-link into it instead
 * of just opening the tab. Tasks/agents/memories/documents are matched
 * against Supabase; cron workflows against the live n8n workflow list.
 * Returns 'not_found' when nothing matches (caller should fall back to
 * opening the plain tab) and 'ambiguous' when multiple records match
 * (caller should ask for clarification).
 */
async function resolveRecordDeepLink(recordType: NonNullable<NavItem['recordType']>, query: string): Promise<RecordMatch> {
  if (recordType === 'document') {
    // KB documents live in their own core_kb_documents table (see
    // KnowledgeBase.tsx), so lookups query it directly instead of a blob —
    // this scales past a handful of docs and works from any device.
    const sb = getSupabase();
    if (!sb) return 'not_found';
    const { data } = await sb.from('core_kb_documents').select('id,title').ilike('title', `%${query}%`).limit(5);
    const rows = data ?? [];
    if (rows.length === 0) return 'not_found';
    if (rows.length > 1) return 'ambiguous';
    return { id: rows[0].id, label: `document "${rows[0].title}"` };
  }

  if (recordType === 'cron') {
    if (!isAxeApiConfigured) return 'not_found';
    let workflows;
    try {
      workflows = await n8nListWorkflows();
    } catch {
      return 'not_found';
    }
    const q = query.toLowerCase();
    const rows = (workflows ?? []).filter(w => w.name?.toLowerCase().includes(q));
    if (rows.length === 0) return 'not_found';
    if (rows.length > 1) return 'ambiguous';
    return { id: rows[0].id, label: `cron workflow "${rows[0].name}"` };
  }

  const sb = getSupabase();
  if (!sb) return 'not_found';

  if (recordType === 'task') {
    const { data } = await sb.from('core_tasks').select('id,title').ilike('title', `%${query}%`).limit(5);
    const rows = data ?? [];
    if (rows.length === 0) return 'not_found';
    if (rows.length > 1) return 'ambiguous';
    return { id: rows[0].id, label: `task "${rows[0].title}"` };
  }

  if (recordType === 'agent') {
    const { data } = await sb.from('core_agents').select('id,name,display_name').or(`name.ilike.%${query}%,display_name.ilike.%${query}%`).limit(5);
    const rows = data ?? [];
    if (rows.length === 0) return 'not_found';
    if (rows.length > 1) return 'ambiguous';
    return { id: rows[0].id, label: `agent "${rows[0].display_name ?? rows[0].name}"` };
  }

  if (recordType === 'memory') {
    const { data } = await sb.from('core_memory').select('id,content,tags').or(`content.ilike.%${query}%,tags.cs.{${query}}`).limit(5);
    const rows = data ?? [];
    if (rows.length === 0) return 'not_found';
    if (rows.length > 1) return 'ambiguous';
    const content = String(rows[0].content ?? '');
    return { id: rows[0].id, label: `memory "${content.length > 40 ? `${content.slice(0, 40)}…` : content}"` };
  }

  return 'not_found';
}

/**
 * Inspects a raw chat message and decides whether it is asking AXE Core to
 * *do* something (navigate to a tab or a specific record inside it, open a
 * URL) rather than just chat. Returns null when the message isn't an action
 * request at all, so normal LLM handling continues unaffected.
 */
export async function detectChatAction(text: string): Promise<ChatAction> {
  const lower = text.toLowerCase();

  const urlMatch = text.match(URL_RE);
  if (urlMatch && OPEN_VERB_RE.test(lower)) {
    return { kind: 'open_url', url: normalizeUrl(urlMatch[0]) };
  }

  if (!OPEN_VERB_RE.test(lower)) return null;

  const matches = matchNavItems(lower);
  if (matches.length === 1) {
    const { item, matchEnd } = matches[0];

    if (item.recordType) {
      const query = extractRecordQuery(text, matchEnd);
      if (query.length >= 2) {
        const result = await resolveRecordDeepLink(item.recordType, query);
        if (result === 'ambiguous') {
          return { kind: 'clarify', message: `I found a few ${item.label.toLowerCase()} matches for "${query}" — can you be more specific?` };
        }
        if (result !== 'not_found') {
          return { kind: 'navigate', path: `${item.path}?open=${encodeURIComponent(result.id)}`, label: result.label };
        }
        // No deep link found for that record — fall back to just opening the tab.
      }
    }

    return { kind: 'navigate', path: item.path, label: item.label };
  }
  if (matches.length > 1) {
    const options = matches.map(m => m.item.label).join(', ');
    return { kind: 'clarify', message: `I found a few matches — which one did you mean: ${options}?` };
  }

  // Had an "open/show/go to" verb but nothing recognizable followed it.
  if (urlMatch) return null; // already handled above if it had a verb; otherwise let LLM try
  return { kind: 'clarify', message: "I'm not sure what you want me to open. Try naming a tab (e.g. \"open trading\") or give me a full URL." };
}
