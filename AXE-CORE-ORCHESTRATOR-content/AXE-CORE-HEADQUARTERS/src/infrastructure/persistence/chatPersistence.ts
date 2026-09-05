/**
 * chatPersistence.ts
 * ------------------------------------------------------------------
 * Persists AXE CORE chat exchanges to the Supabase `messages` table.
 * ISOLATED per app — AXE Core, AXE Companion, and Trading OS each
 * have their own siloed conversation history via `app_source`.
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isAxeApiConfigured, sbGetRows, sbInsertRow } from '@/infrastructure/gateways/axeCoreApiService';

export type ChatRole = 'user' | 'axe' | 'system';

/** App identifier — CHANGE PER APP:
 *  - AXE Core:       'axe-core'
 *  - AXE Companion:  'axe-companion'
 *  - Trading OS:     'trading-os'
 */
export const APP_SOURCE = 'axe-core';

/**
 * TWO IDS, AND THE COLUMN TYPE DECIDES WHICH.
 *
 * AXE_USER_ID appends the app name to make a per-app namespace. That works
 * against `global_memory`, whose user_id is TEXT. It cannot work against
 * `messages`, `conversations` or `user_settings`, whose user_id is UUID:
 * Postgres rejects it with `invalid input syntax for type uuid`, PostgREST
 * raises, and the API returns a bare 500.
 *
 * Measured 2026-08-20, and it had broken the feature outright:
 *   * every saveMessage() insert failed — the API path threw, and the direct
 *     Supabase fallback threw for the same reason, leaving only a console.error;
 *   * loadAllConversations() 500'd on every app boot and fell back to a scan;
 *   * the messages table holds 340 rows, newest 2026-07-11, and ZERO carry the
 *     app_source key that buildMeta() stamps on every write — proof that not
 *     one message from this path has ever landed.
 *
 * So chat history was unsaveable and unreadable for six weeks, silently, in a
 * feature that looks like it works because the UI keeps the session in memory.
 *
 * App isolation is metadata.app_source, which buildMeta already writes. It
 * never needed to be smuggled into the id.
 */
const AXE_USER_BASE = 'acff7a12-1111-481d-a7a9-cc07583b8069';

/** UUID columns: messages, conversations, user_settings. */
export const AXE_USER_UUID = AXE_USER_BASE;

/** TEXT columns only — global_memory. Keeps the per-app namespace there. */
export const AXE_USER_ID = `${AXE_USER_BASE}-${APP_SOURCE}`;

/**
 * AXE Core's own chat table.
 *
 * NOT public.messages. That one belongs to another product sharing this
 * database and carries constraints written for it: a foreign key to
 * `conversations`, a foreign key to `profiles`, and a role check allowing only
 * user/assistant/system. AXE Core never creates a conversations row and writes
 * role 'axe', so every insert hit a constraint that was never about AXE — and
 * because the failure was caught and only console.error'd, nothing was saved
 * from 27 August onward without anyone noticing.
 *
 * The 280 existing AXE rows were copied across on 31-08-2026; the originals
 * were left in place.
 */
const MESSAGES_TABLE = 'axe_messages';

/**
 * Chat persistence was broken for four days and nobody knew.
 *
 * Every failure here was caught and console.error'd, which in a running app is
 * indistinguishable from silence — the chat kept working, replies kept
 * appearing, and none of it was written down. The memory Luka was asking about
 * simply was not being recorded.
 *
 * So a save failure is now a fact the app holds, not a line in a log nobody
 * reads. `chatSaveHealth()` is what the UI can show; the console line survives
 * for whoever has devtools open.
 */
export interface ChatSaveHealth {
  ok: boolean;
  /** Consecutive failures. One is a hiccup; a run of them is a broken app. */
  failures: number;
  lastError: string | null;
  lastErrorAt: number | null;
  lastSuccessAt: number | null;
}

let saveHealth: ChatSaveHealth = {
  ok: true, failures: 0, lastError: null, lastErrorAt: null, lastSuccessAt: null,
};

/** Current state of chat persistence. Safe to poll from a status panel. */
export function chatSaveHealth(): ChatSaveHealth {
  return { ...saveHealth };
}

function noteSaveOk(): void {
  if (saveHealth.failures > 0) {
    console.info(
      `%c[AXE chat]%c saving works again after ${saveHealth.failures} failed attempt(s)`,
      'color:#10B981;font-weight:600', 'color:inherit',
    );
  }
  saveHealth = { ok: true, failures: 0, lastError: null, lastErrorAt: null, lastSuccessAt: Date.now() };
}

function noteSaveFailed(reason: string): void {
  saveHealth = {
    ok: false,
    failures: saveHealth.failures + 1,
    lastError: reason,
    lastErrorAt: Date.now(),
    lastSuccessAt: saveHealth.lastSuccessAt,
  };
  // Loud on the first failure, then quiet — a per-message error every turn is
  // its own kind of invisible.
  if (saveHealth.failures === 1 || saveHealth.failures % 25 === 0) {
    console.error(
      `%c[AXE chat]%c this conversation is NOT being stored (${saveHealth.failures}x): ${reason}`,
      'color:#EF4444;font-weight:700', 'color:inherit',
    );
  }
}

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
  // This fallback can never fire against `messages`: its user_id is a UUID
  // column, so it cannot contain the app name. Kept only for rows that came
  // from a TEXT-column source, and deliberately NOT loosened to "no app_source
  // means ours" — 278 rows sit under this same uuid from other apps, and
  // claiming them would show Luka someone else's conversations.
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
    .from(MESSAGES_TABLE)
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
        rows = (await sbGetRows(MESSAGES_TABLE, {
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
  // public.messages has NO provider/model columns (only id, conversation_id,
  // user_id, role, content, metadata, created_at) — sending them as top-level
  // insert keys made PostgREST reject the ENTIRE row ("Could not find the
  // 'model' column of 'messages' in the schema cache", PGRST204). That
  // silently broke every single chat save for weeks (caught, only
  // console.error'd) — this is why the messages table stopped growing.
  // metadata already mirrors provider/model, which is the only place they
  // can safely live without a real migration.
  const extraMeta: Record<string, unknown> = { ...(msg.metadata ?? {}) };
  if (msg.provider) extraMeta.provider = msg.provider;
  if (msg.model)    extraMeta.model    = msg.model;

  const record = {
    conversation_id: msg.conversation_id,
    user_id: msg.user_id ?? AXE_USER_UUID,
    role: msg.role,
    content: msg.content,
    metadata: buildMeta(extraMeta),
  };

  try {
    if (isAxeApiConfigured) {
      try {
        await sbInsertRow(MESSAGES_TABLE, record as Record<string, unknown>);
        noteSaveOk();
        return;
      } catch (apiErr) {
        // AXE VPS API unreachable (e.g. 500) — fall through to direct Supabase
        // so messages are never silently lost when the VPS is down.
        console.debug('[chatPersistence] AXE API saveMessage unavailable, using Supabase:', formatErr(apiErr));
      }
    }

    const sb = getSupabase();
    if (!sb) { noteSaveFailed('geen Supabase-client'); return; }
    const { error } = await sb.from(MESSAGES_TABLE).insert(record);
    if (error) noteSaveFailed(formatSbError(error));
    else noteSaveOk();
  } catch (err) {
    noteSaveFailed(formatErr(err));
  }
}

async function loadAllConversationsViaSupabase(): Promise<ChatMessageRecord[]> {
  const sb = getSupabase();
  if (!sb) return [];

  // Load ALL messages for this user_id prefix, then filter by app
  const { data, error } = await sb
    .from(MESSAGES_TABLE)
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
        rows = (await sbGetRows(MESSAGES_TABLE, {
          limit: 1000,
          orderBy: 'created_at',
          orderDir: 'desc',
          filterCol: 'user_id',
          filterVal: AXE_USER_UUID,
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
