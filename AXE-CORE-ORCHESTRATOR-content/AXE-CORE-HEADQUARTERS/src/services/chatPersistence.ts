/**
 * chatPersistence.ts
 * ------------------------------------------------------------------
 * Persists AXE CORE chat exchanges to the Supabase `messages` table.
 * ISOLATED per app — AXE Core, AXE Companion, and Trading OS each
 * have their own siloed conversation history via `app_source`.
 */

import { getSupabase } from '@/lib/supabaseClient';
import { isAxeApiConfigured, sbGetRows, sbInsertRow } from '@/services/axeCoreApiService';

export type ChatRole = 'user' | 'axe' | 'system';

/** App identifier — CHANGE PER APP:
 *  - AXE Core:       'axe-core'
 *  - AXE Companion:  'axe-companion'
 *  - Trading OS:     'trading-os'
 */
export const APP_SOURCE = 'axe-core';

/** Per-app user ID so each app has its own conversation namespace */
export const AXE_USER_ID = `acff7a12-1111-481d-a7a9-cc07583b8069-${APP_SOURCE}`;

export interface ChatMessageRecord {
  id?: string;
  conversation_id: string;
  user_id?: string;
  role: ChatRole;
  content: string;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface ConversationMessage {
  role: ChatRole;
  text: string;
  timestamp: number;
  provider?: string;
  model?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: string;
  preview: string;
}

/** Extract app_source from metadata object */
function getAppSource(meta: unknown): string | null {
  if (meta && typeof meta === 'object' && 'app_source' in (meta as Record<string, unknown>)) {
    return String((meta as Record<string, unknown>).app_source);
  }
  return null;
}

/** Check if a message belongs to this app */
function isOurApp(row: ChatMessageRecord): boolean {
  // Strict: must match our app_source OR our user_id
  const rowApp = getAppSource(row.metadata);
  if (rowApp !== null) return rowApp === APP_SOURCE;
  // Fallback: check user_id contains our app suffix
  if (row.user_id && row.user_id.includes(APP_SOURCE)) return true;
  // Reject messages without app_source and without matching user_id
  // (these are from other apps stored before isolation)
  return false;
}

/** Build metadata with app_source */
function buildMeta(extra?: Record<string, unknown>): Record<string, unknown> {
  return { app_source: APP_SOURCE, ...(extra || {}) };
}

/** Format a thrown value for logging. Error instances stringify to "{}" via
 *  console's structured logging in some environments because message/stack
 *  are non-enumerable — pull the message out explicitly instead. */
function formatErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/** Format a Supabase PostgrestError-shaped object for logging. */
function formatSbError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    return [e.code, e.message, e.details, e.hint].filter(Boolean).join(' — ') || JSON.stringify(error);
  }
  return formatErr(error);
}

// ─── localStorage mirror ──────────────────────────────────────────────────────
// Primary persistence: instant, offline-capable. Supabase is a background copy.

const LOCAL_CONV_PREFIX = 'axe_conv_v2_';
const LOCAL_MAX_MSGS    = 300; // keep last N messages per conversation

/** Persist a full conversation snapshot to localStorage (newest 300 messages). */
export function saveConversationLocal(conversationId: string, messages: ConversationMessage[]): void {
  try {
    const slice = messages.slice(-LOCAL_MAX_MSGS);
    localStorage.setItem(LOCAL_CONV_PREFIX + conversationId, JSON.stringify(slice));
  } catch { /* storage full or unavailable — silently ignore */ }
}

/** Load a conversation from localStorage. Returns [] if nothing is stored. */
export function loadConversationLocal(conversationId: string): ConversationMessage[] {
  try {
    const raw = localStorage.getItem(LOCAL_CONV_PREFIX + conversationId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConversationMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────

/** Load a conversation's history (oldest → newest). Returns [] on any failure. */
async function loadMessagesViaSupabase(conversationId: string): Promise<ChatMessageRecord[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', AXE_USER_ID)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) { console.error('[chatPersistence] loadMessages error:', formatSbError(error)); return []; }
  return data || [];
}

export async function loadMessages(conversationId: string): Promise<ConversationMessage[]> {
  try {
    let rows: ChatMessageRecord[] = [];

    if (isAxeApiConfigured) {
      try {
        rows = (await sbGetRows('messages', {
          limit: 500,
          orderBy: 'created_at',
          orderDir: 'asc',
          filterCol: 'conversation_id',
          filterVal: conversationId,
        })) as unknown as ChatMessageRecord[];
      } catch (apiErr) {
        // The AXE Core VPS bridge may be unreachable — fall back to talking
        // to Supabase directly rather than failing the whole load.
        console.debug('[chatPersistence] AXE API loadMessages unavailable, using Supabase:', formatErr(apiErr));
        rows = await loadMessagesViaSupabase(conversationId);
      }
    } else {
      rows = await loadMessagesViaSupabase(conversationId);
    }

    // 🔒 FILTER: only show messages belonging to THIS app
    return rows
      .filter(isOurApp)
      .map((r) => {
        // Fall back to metadata if the dedicated columns are absent (schema not yet migrated)
        const meta = r.metadata as Record<string, unknown> | null | undefined;
        const provider = (r.provider ?? meta?.provider ?? undefined) as string | undefined;
        const model    = (r.model    ?? meta?.model    ?? undefined) as string | undefined;
        return {
          role: (r.role === 'user' ? 'user' : 'axe') as 'user' | 'axe',
          text: r.content ?? '',
          timestamp: r.created_at ? Date.parse(r.created_at) : Date.now(),
          provider,
          model,
        };
      });
  } catch (err) {
    console.error('[chatPersistence] loadMessages failed:', formatErr(err));
    return [];
  }
}

/** Save a single message to the `messages` table. */
export async function saveMessage(msg: ChatMessageRecord): Promise<void> {
  // Mirror provider/model into metadata so they survive even if the dedicated
  // columns haven't been added to the Supabase schema yet.
  const extraMeta: Record<string, unknown> = { ...(msg.metadata ?? {}) };
  if (msg.provider) extraMeta.provider = msg.provider;
  if (msg.model)    extraMeta.model    = msg.model;

  const record = {
    conversation_id: msg.conversation_id,
    user_id: msg.user_id ?? AXE_USER_ID,
    role: msg.role,
    content: msg.content,
    provider: msg.provider ?? null,
    model: msg.model ?? null,
    metadata: buildMeta(extraMeta),
  };

  try {
    if (isAxeApiConfigured) {
      try {
        await sbInsertRow('messages', record as Record<string, unknown>);
        return;
      } catch (apiErr) {
        // AXE VPS API unreachable (e.g. 500) — fall through to direct Supabase
        // so messages are never silently lost when the VPS is down.
        console.debug('[chatPersistence] AXE API saveMessage unavailable, using Supabase:', formatErr(apiErr));
      }
    }

    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('messages').insert(record);
    if (error) console.error('[chatPersistence] saveMessage error:', formatSbError(error));
  } catch (err) {
    console.error('[chatPersistence] saveMessage failed:', formatErr(err));
  }
}

async function loadAllConversationsViaSupabase(): Promise<ChatMessageRecord[]> {
  const sb = getSupabase();
  if (!sb) return [];

  // Load ALL messages for this user_id prefix, then filter by app
  const { data, error } = await sb
    .from('messages')
    .select('conversation_id, content, created_at, metadata, user_id, role')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) { console.error('[chatPersistence] loadAllConv error:', formatSbError(error)); return []; }
  return (data ?? []) as unknown as ChatMessageRecord[];
}

/** Groups messages by conversation_id and returns metadata for each.
 *  🔒 FILTERED per app_source so AXE Core only sees AXE Core chats. */
export async function loadAllConversations(): Promise<ConversationSummary[]> {
  try {
    let rows: ChatMessageRecord[] = [];

    if (isAxeApiConfigured) {
      try {
        rows = (await sbGetRows('messages', {
          limit: 1000,
          orderBy: 'created_at',
          orderDir: 'desc',
          filterCol: 'user_id',
          filterVal: AXE_USER_ID,
        })) as unknown as ChatMessageRecord[];
      } catch (apiErr) {
        console.debug('[chatPersistence] AXE API loadAllConversations unavailable, using Supabase:', formatErr(apiErr));
        rows = await loadAllConversationsViaSupabase();
      }
    } else {
      rows = await loadAllConversationsViaSupabase();
    }

    // 🔒 FILTER: only conversations belonging to THIS app
    const ourRows = rows.filter(isOurApp);

    // Group by conversation_id
    const convMap = new Map<string, { messages: number; lastAt: string; preview: string }>();
    for (const row of ourRows) {
      const cid = row.conversation_id;
      const existing = convMap.get(cid);
      if (!existing) {
        convMap.set(cid, {
          messages: 1,
          lastAt: row.created_at ?? new Date().toISOString(),
          preview: (row.content ?? '').slice(0, 60),
        });
      } else {
        existing.messages++;
        if ((row.created_at ?? '') > existing.lastAt) {
          existing.lastAt = row.created_at ?? existing.lastAt;
          if (!existing.preview) existing.preview = (row.content ?? '').slice(0, 60);
        }
      }
    }

    return Array.from(convMap.entries())
      .map(([id, meta]) => ({
        id,
        title: meta.preview.slice(0, 20) || id.slice(0, 8),
        messageCount: meta.messages,
        lastMessageAt: meta.lastAt,
        preview: meta.preview,
      }))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  } catch (err) {
    console.error('[chatPersistence] loadAllConversations failed:', formatErr(err));
    return [];
  }
}

/**
 * Generate a new conversation ID.
 * Must be a real UUID — the `messages.conversation_id` column is typed
 * `uuid` in Supabase, so a custom string id (e.g. "axe-core-<ts>-<rand>")
 * fails every insert/select with "invalid input syntax for type uuid".
 * Per-app isolation is handled separately via `app_source` in metadata
 * and the per-app `user_id`, so the id itself doesn't need an app prefix.
 */
export function createNewConversationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
