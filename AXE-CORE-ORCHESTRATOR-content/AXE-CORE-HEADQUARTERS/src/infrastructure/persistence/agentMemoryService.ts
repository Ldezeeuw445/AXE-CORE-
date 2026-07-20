/**
 * agentMemoryService.ts
 * ------------------------------------------------------------------
 * Per-agent and per-provider conversation memory for AXE CORE.
 * 
 * Each agent (OpenHands, CrewAI, etc.) and each provider (Krater, Gemini, etc.)
 * has its own isolated conversation history. This allows:
 * - Contextual continuity per agent
 * - Provider-specific tuning memory
 * - Easy switching between agents without losing context
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isAxeApiConfigured, sbGetRows, sbInsertRow } from '@/infrastructure/gateways/axeCoreApiService';
import { APP_SOURCE, AXE_USER_ID, type ChatMessageRecord, type ConversationMessage, type ConversationSummary } from './chatPersistence';

export type MemoryScope = 'global' | 'agent' | 'provider';

export interface MemoryIdentity {
  scope: MemoryScope;
  agentId?: string;      // e.g. 'openhands', 'crewai'
  providerId?: string;   // e.g. 'krater', 'gemini'
  displayName: string;
  icon?: string;
}

export interface ScopedMessage extends ChatMessageRecord {
  metadata: {
    app_source: string;
    scope: MemoryScope;
    agent_id?: string;
    provider_id?: string;
    topic?: string;
  } & Record<string, unknown>;
}

const AGENT_IDS = [
  'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'hermes'
] as const;

const PROVIDER_IDS = [
  'krater', 'anthropic', 'openai', 'google', 'groq', 'openrouter', 'ollama'
] as const;

/** Generate a conversation ID scoped to agent or provider */
export function getScopedConversationId(
  scope: MemoryScope,
  agentId?: string,
  providerId?: string
): string {
  const base = scope === 'agent' && agentId 
    ? `agent-${agentId}`
    : scope === 'provider' && providerId
    ? `provider-${providerId}`
    : 'global';
  
  // Use localStorage to persist the same conversation ID across sessions
  const lsKey = `axe_conv_${APP_SOURCE}_${base}`;
  const existing = typeof window !== 'undefined' ? localStorage.getItem(lsKey) : null;
  if (existing) return existing;
  
  const newId = `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (typeof window !== 'undefined') localStorage.setItem(lsKey, newId);
  return newId;
}

/** Get all memory identities (agents + providers + global) */
export function getMemoryIdentities(): MemoryIdentity[] {
  const identities: MemoryIdentity[] = [
    { scope: 'global', displayName: 'AXE Core', icon: 'axe' }
  ];

  // Agents
  const agentNames: Record<string, string> = {
    openhands: 'OpenHands',
    openjarvis: 'OpenJarvis', 
    openclaw: 'OpenClaw',
    kilocode: 'Kilo Code',
    crewai: 'CrewAI',
    hermes: 'Hermes Agent',
  };

  for (const id of AGENT_IDS) {
    identities.push({
      scope: 'agent',
      agentId: id,
      displayName: agentNames[id] || id,
      icon: 'bot',
    });
  }

  // Providers
  const providerNames: Record<string, string> = {
    krater: 'Krater AI',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Gemini',
    groq: 'Groq',
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
  };

  for (const id of PROVIDER_IDS) {
    identities.push({
      scope: 'provider',
      providerId: id,
      displayName: providerNames[id] || id,
      icon: 'brain',
    });
  }

  return identities;
}

/** Save a message with scope metadata */
export async function saveScopedMessage(
  msg: Omit<ChatMessageRecord, 'metadata'> & { metadata?: Record<string, unknown> },
  scope: MemoryScope = 'global',
  agentId?: string,
  providerId?: string
): Promise<void> {
  const metadata = {
    app_source: APP_SOURCE,
    scope,
    ...(agentId && { agent_id: agentId }),
    ...(providerId && { provider_id: providerId }),
    ...(msg.metadata || {}),
  };

  const record = {
    conversation_id: msg.conversation_id,
    user_id: msg.user_id ?? AXE_USER_ID,
    role: msg.role,
    content: msg.content,
    provider: msg.provider ?? null,
    model: msg.model ?? null,
    metadata,
  };

  try {
    if (isAxeApiConfigured) {
      await sbInsertRow('messages', record as Record<string, unknown>);
      return;
    }

    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('messages').insert(record);
    if (error) console.error('[agentMemory] saveScopedMessage error:', error);
  } catch (err) {
    console.error('[agentMemory] saveScopedMessage failed:', err);
    // Fallback to localStorage
    fallbackSaveScoped(record as ChatMessageRecord, scope, agentId, providerId);
  }
}

/** Load messages for a specific scope */
export async function loadScopedMessages(
  scope: MemoryScope = 'global',
  agentId?: string,
  providerId?: string,
  limit: number = 500
): Promise<ConversationMessage[]> {
  try {
    const sb = getSupabase();
    if (!sb) return [];

    let query = sb
      .from('messages')
      .select('*')
      .eq('user_id', AXE_USER_ID)
      .order('created_at', { ascending: true })
      .limit(limit);

    // Filter by metadata
    if (scope === 'agent' && agentId) {
      query = query.contains('metadata', { agent_id: agentId, scope: 'agent' });
    } else if (scope === 'provider' && providerId) {
      query = query.contains('metadata', { provider_id: providerId, scope: 'provider' });
    } else {
      query = query.or('metadata->>scope.eq.global,metadata->>scope.is.null');
    }

    const { data, error } = await query;
    if (error) {
      console.error('[agentMemory] loadScopedMessages error:', error);
      return fallbackLoadScoped(scope, agentId, providerId);
    }

    return (data || [])
      .filter((row: Record<string, unknown>) => {
        const meta = row.metadata as Record<string, unknown> | null;
        if (!meta) return scope === 'global'; // old messages without metadata = global
        const rowApp = meta.app_source;
        if (rowApp && rowApp !== APP_SOURCE) return false;
        return true;
      })
      .map((r: Record<string, unknown>) => ({
        role: (r.role === 'user' ? 'user' : 'axe') as 'user' | 'axe',
        text: String(r.content || ''),
        timestamp: r.created_at ? Date.parse(String(r.created_at)) : Date.now(),
        provider: r.provider ? String(r.provider) : undefined,
        model: r.model ? String(r.model) : undefined,
      }));
  } catch (err) {
    console.error('[agentMemory] loadScopedMessages failed:', err);
    return fallbackLoadScoped(scope, agentId, providerId);
  }
}

/** Get conversation summaries grouped by scope */
export async function loadScopedConversations(): Promise<{
  global: ConversationSummary[];
  agents: Record<string, ConversationSummary[]>;
  providers: Record<string, ConversationSummary[]>;
}> {
  try {
    const sb = getSupabase();
    if (!sb) return { global: [], agents: {}, providers: {} };

    const { data, error } = await sb
      .from('messages')
      .select('conversation_id, content, created_at, metadata, user_id, role')
      .eq('user_id', AXE_USER_ID)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (error) {
      console.error('[agentMemory] loadScopedConversations error:', error);
      return fallbackScopedConversations();
    }

    const rows = (data || []) as Array<{
      conversation_id: string;
      content: string;
      created_at: string;
      metadata: Record<string, unknown> | null;
      user_id: string;
      role: string;
    }>;

    // Group by scope
    const global: ConversationSummary[] = [];
    const agents: Record<string, ConversationSummary[]> = {};
    const providers: Record<string, ConversationSummary[]> = {};

    const convMap = new Map<string, {
      scope: MemoryScope;
      agentId?: string;
      providerId?: string;
      messages: number;
      lastAt: string;
      preview: string;
    }>();

    for (const row of rows) {
      const meta = row.metadata || {};
      const rowApp = meta.app_source;
      if (rowApp && rowApp !== APP_SOURCE) continue;

      const scope = (meta.scope as MemoryScope) || 'global';
      const agentId = meta.agent_id as string | undefined;
      const providerId = meta.provider_id as string | undefined;

      const key = row.conversation_id;
      const existing = convMap.get(key);

      if (!existing) {
        convMap.set(key, {
          scope,
          agentId,
          providerId,
          messages: 1,
          lastAt: row.created_at,
          preview: (row.content || '').slice(0, 60),
        });
      } else {
        existing.messages++;
        if (row.created_at > existing.lastAt) {
          existing.lastAt = row.created_at;
        }
      }
    }

    for (const [id, meta] of convMap) {
      const summary: ConversationSummary = {
        id,
        title: meta.preview.slice(0, 20) || id.slice(0, 8),
        messageCount: meta.messages,
        lastMessageAt: meta.lastAt,
        preview: meta.preview,
      };

      if (meta.scope === 'agent' && meta.agentId) {
        if (!agents[meta.agentId]) agents[meta.agentId] = [];
        agents[meta.agentId].push(summary);
      } else if (meta.scope === 'provider' && meta.providerId) {
        if (!providers[meta.providerId]) providers[meta.providerId] = [];
        providers[meta.providerId].push(summary);
      } else {
        global.push(summary);
      }
    }

    // Sort each group
    global.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    for (const key of Object.keys(agents)) {
      agents[key].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    }
    for (const key of Object.keys(providers)) {
      providers[key].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    }

    return { global, agents, providers };
  } catch (err) {
    console.error('[agentMemory] loadScopedConversations failed:', err);
    return fallbackScopedConversations();
  }
}

// ── Fallback localStorage ────────────────────────────────────────────────

const LS_SCOPED_PREFIX = 'axe_scoped_msgs_';

function fallbackSaveScoped(
  msg: ChatMessageRecord,
  scope: MemoryScope,
  agentId?: string,
  providerId?: string
): void {
  try {
    const key = `${LS_SCOPED_PREFIX}${APP_SOURCE}_${scope}_${agentId || providerId || 'global'}`;
    const existing: Array<Record<string, unknown>> = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({
      role: msg.role,
      content: msg.content,
      timestamp: Date.now(),
      provider: msg.provider,
      model: msg.model,
      conversation_id: msg.conversation_id,
    });
    localStorage.setItem(key, JSON.stringify(existing.slice(-300)));
  } catch {}
}

function fallbackLoadScoped(
  scope: MemoryScope,
  agentId?: string,
  providerId?: string
): ConversationMessage[] {
  try {
    const key = `${LS_SCOPED_PREFIX}${APP_SOURCE}_${scope}_${agentId || providerId || 'global'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((m: Record<string, unknown>) => ({
      role: (m.role === 'user' ? 'user' : 'axe') as 'user' | 'axe',
      text: String(m.content || ''),
      timestamp: Number(m.timestamp || Date.now()),
      provider: m.provider ? String(m.provider) : undefined,
      model: m.model ? String(m.model) : undefined,
    }));
  } catch { return []; }
}

function fallbackScopedConversations(): {
  global: ConversationSummary[];
  agents: Record<string, ConversationSummary[]>;
  providers: Record<string, ConversationSummary[]>;
} {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_SCOPED_PREFIX));
    const global: ConversationSummary[] = [];
    const agents: Record<string, ConversationSummary[]> = {};
    const providers: Record<string, ConversationSummary[]> = {};

    for (const key of keys) {
      const msgs: Array<{ content?: string; timestamp?: number }> = JSON.parse(localStorage.getItem(key) || '[]');
      const lastMsg = msgs[msgs.length - 1];
      const parts = key.replace(LS_SCOPED_PREFIX, '').split('_');
      const scope = parts[1] as MemoryScope;
      const id = parts[2] || 'global';

      const summary: ConversationSummary = {
        id: key,
        title: (lastMsg?.content || '').slice(0, 20) || id,
        messageCount: msgs.length,
        lastMessageAt: lastMsg?.timestamp ? new Date(lastMsg.timestamp).toISOString() : new Date().toISOString(),
        preview: (lastMsg?.content || '').slice(0, 60),
      };

      if (scope === 'agent') {
        if (!agents[id]) agents[id] = [];
        agents[id].push(summary);
      } else if (scope === 'provider') {
        if (!providers[id]) providers[id] = [];
        providers[id].push(summary);
      } else {
        global.push(summary);
      }
    }

    return { global, agents, providers };
  } catch { return { global: [], agents: {}, providers: {} }; }
}
