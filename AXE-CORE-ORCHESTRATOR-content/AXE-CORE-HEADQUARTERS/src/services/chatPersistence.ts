/**
 * chatPersistence.ts
 * ------------------------------------------------------------------
 * Persists AXE CORE chat exchanges to the Supabase `messages` table so a
 * page refresh never loses context.
 *
 * Primary path:  the VPS axe_api (service_role key → bypasses RLS). This is
 * the same privileged channel the app already uses for GitHub / n8n / Supabase
 * admin writes.
 * Fallback path: the browser anon Supabase client (only if axe_api is not
 * configured). The `messages` table has an `anon_all_messages` RLS policy so
 * this still works for the single-user app.
 */

import { getSupabase } from '@/lib/supabaseClient';
import { isAxeApiConfigured, sbGetRows, sbInsertRow } from '@/services/axeCoreApiService';

export type ChatRole = 'user' | 'axe' | 'system';

// The live `messages` table uses `conversation_id` (+ a fixed single-user
// `user_id`). Kept as a constant to match the existing 338-row dataset.
export const AXE_USER_ID = 'acff7a12-1111-481d-a7a9-cc07583b8069';

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

/** Conversation summary for the sidebar */
export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: string;
  preview: string;
}

/** Load a conversation's history (oldest → newest). Returns [] on any failure. */
export async function loadMessages(conversationId: string): Promise<ConversationMessage[]> {
  try {
    if (isAxeApiConfigured) {
      const rows = (await sbGetRows('messages', {
        limit: 200,
        orderBy: 'created_at',
        orderDir: 'asc',
        filterCol: 'conversation_id',
        filterVal: conversationId,
      })) as unknown as Array<ChatMessageRecord>;
      return rows.map((r) => ({
        role: (r.role === 'user' ? 'user' : 'axe') as 'user' | 'axe',
        text: r.content ?? '',
        timestamp: r.created_at ? Date.parse(r.created_at) : Date.now(),
        provider: r.provider ?? undefined,
        model: r.model ?? undefined,
      }));
    }

    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error || !data) return [];
    return (data as Array<ChatMessageRecord>).map((r) => ({
      role: (r.role as ChatRole) ?? 'axe',
      text: r.content ?? '',
      timestamp: r.created_at ? Date.parse(r.created_at) : Date.now(),
      provider: r.provider ?? undefined,
      model: r.model ?? undefined,
    }));
  } catch {
    return [];
  }
}

/** Persist a single message. Fire-and-forget safe (never throws). */
export async function saveMessage(msg: ChatMessageRecord): Promise<void> {
  const payload = {
    conversation_id: msg.conversation_id,
    user_id: msg.user_id ?? AXE_USER_ID,
    role: msg.role,
    content: msg.content,
    provider: msg.provider ?? null,
    model: msg.model ?? null,
    metadata: msg.metadata ?? {},
  };
  try {
    if (isAxeApiConfigured) {
      await sbInsertRow('messages', payload);
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('messages').insert(payload);
  } catch {
    // Persistence must never break the chat UI.
  }
}

/**
 * Load ALL conversation summaries for the sidebar.
 * Groups messages by conversation_id and returns metadata for each.
 */
export async function loadAllConversations(): Promise<ConversationSummary[]> {
  try {
    // Try axe_api first
    if (isAxeApiConfigured) {
      const rows = (await sbGetRows('messages', {
        limit: 1000,
        orderBy: 'created_at',
        orderDir: 'desc',
        filterCol: 'user_id',
        filterVal: AXE_USER_ID,
      })) as unknown as Array<ChatMessageRecord>;
      return groupMessagesIntoConversations(rows);
    }

    // Fallback to anon client
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from('messages')
      .select('conversation_id, content, created_at')
      .eq('user_id', AXE_USER_ID)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error || !data) return [];
    return groupMessagesIntoConversations(data as Array<ChatMessageRecord>);
  } catch {
    return [];
  }
}

/** Group raw messages into conversation summaries */
function groupMessagesIntoConversations(rows: Array<ChatMessageRecord>): ConversationSummary[] {
  const convMap = new Map<string, { messages: Array<{ content: string; created_at?: string }>; lastAt: string }>();

  for (const row of rows) {
    const cid = row.conversation_id;
    if (!convMap.has(cid)) {
      convMap.set(cid, { messages: [], lastAt: row.created_at ?? new Date().toISOString() });
    }
    const conv = convMap.get(cid)!;
    conv.messages.push({ content: row.content ?? '', created_at: row.created_at });
    if (row.created_at && row.created_at > conv.lastAt) conv.lastAt = row.created_at;
  }

  return Array.from(convMap.entries())
    .map(([id, conv]) => {
      const firstUserMsg = conv.messages.find(m => m.content && m.content.length > 0);
      const preview = firstUserMsg
        ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '')
        : 'Empty conversation';
      const title = generateConversationTitle(conv.messages);
      return {
        id,
        title,
        messageCount: conv.messages.length,
        lastMessageAt: conv.lastAt,
        preview,
      };
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** Generate a human-readable title from conversation messages */
function generateConversationTitle(messages: Array<{ content: string }>): string {
  // Find first user message as title
  const firstMsg = messages.find(m => m.content && m.content.length > 0);
  if (!firstMsg) return 'New Conversation';

  const text = firstMsg.content;
  // Truncate to ~40 chars, break at word boundary
  if (text.length <= 40) return text;
  const truncated = text.slice(0, 40);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

/** Create a new conversation and return its ID */
export function createNewConversationId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
