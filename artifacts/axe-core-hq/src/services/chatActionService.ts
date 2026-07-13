/* ══════════════════════════════════════════════════════════════════════════
   CHAT ACTION SERVICE — lets a chat message trigger real app actions.
   Currently supports: navigating to a known tab, opening an external URL.
   Deliberately narrow (viewing only, no writes/destructive actions) per
   the "AXE Core chat can act on the app" scope.
   ══════════════════════════════════════════════════════════════════════════ */

import { NAV_ITEMS, type NavItem } from '@/lib/navRegistry';

export type ChatAction =
  | { kind: 'navigate'; path: string; label: string }
  | { kind: 'open_url'; url: string }
  | { kind: 'clarify'; message: string }
  | null;

// Verbs/phrases that signal "the user wants to be taken somewhere" — required
// so ordinary chat about a topic ("what's happening in trading?") isn't
// mistaken for a navigation command.
const OPEN_VERB_RE = /\b(open|show( me)?|go to|goto|navigate to|take me to|switch to|pull up|bring up|laat.*zien|ga naar|open.*voor mij)\b/i;

const URL_RE = /(https?:\/\/[^\s]+|(?:www\.)[^\s]+\.[a-z]{2,}[^\s]*)/i;

function normalizeUrl(raw: string): string {
  const trimmed = raw.replace(/[.,;!?)]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function matchNavItems(lowerText: string): NavItem[] {
  const matched = new Set<NavItem>();
  for (const item of NAV_ITEMS) {
    for (const kw of item.keywords) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(lowerText)) { matched.add(item); break; }
    }
  }
  return Array.from(matched);
}

/**
 * Inspects a raw chat message and decides whether it is asking AXE Core to
 * *do* something (navigate, open a URL) rather than just chat. Returns null
 * when the message isn't an action request at all, so normal LLM handling
 * continues unaffected.
 */
export function detectChatAction(text: string): ChatAction {
  const lower = text.toLowerCase();

  const urlMatch = text.match(URL_RE);
  if (urlMatch && OPEN_VERB_RE.test(lower)) {
    return { kind: 'open_url', url: normalizeUrl(urlMatch[0]) };
  }

  if (!OPEN_VERB_RE.test(lower)) return null;

  const matches = matchNavItems(lower);
  if (matches.length === 1) {
    const item = matches[0];
    return { kind: 'navigate', path: item.path, label: item.label };
  }
  if (matches.length > 1) {
    const options = matches.map(m => m.label).join(', ');
    return { kind: 'clarify', message: `I found a few matches — which one did you mean: ${options}?` };
  }

  // Had an "open/show/go to" verb but nothing recognizable followed it.
  if (urlMatch) return null; // already handled above if it had a verb; otherwise let LLM try
  return { kind: 'clarify', message: "I'm not sure what you want me to open. Try naming a tab (e.g. \"open trading\") or give me a full URL." };
}
