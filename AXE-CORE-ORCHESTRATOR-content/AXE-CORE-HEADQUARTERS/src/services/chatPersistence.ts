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
