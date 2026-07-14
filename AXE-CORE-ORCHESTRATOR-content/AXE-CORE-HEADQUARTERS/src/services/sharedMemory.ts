/**
 * sharedMemory.ts
 *
 * AXE CORE Shared Memory Service
 * ------------------------------
 * Provides agents with a shared key-value store backed by Supabase.
 * Supports TTL (time-to-live) for automatic expiration of entries.
 *
 * Used by the agentic engine to share context, intermediate results,
 * and learned patterns across agent runs.
 */

import { getSupabase } from '@/lib/supabaseClient';

export interface SharedMemoryEntry {
  id: string;
  key: string;
  value: unknown;
  agentId?: string;
  ttlSeconds?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryQuery {
  key?: string;
  keyPrefix?: string;
  agentId?: string;
  limit?: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Store a value in shared memory.
 * If the key exists, it updates the value and refreshes the timestamp.
 */
export async function setMemory(
  key: string,
  value: unknown,
  opts: { agentId?: string; ttlSeconds?: number } = {}
): Promise<SharedMemoryEntry | null> {
  const sb = getSupabase();
  if (!sb) {
    console.warn('[sharedMemory] Supabase not configured');
    return null;
  }

  try {
    // Upsert: update if exists, insert if not
    const { data, error } = await sb
      .from('shared_memory')
      .upsert(
        {
          key,
          value: JSON.parse(JSON.stringify(value)), // ensure serializable
          agent_id: opts.agentId ?? null,
          ttl_seconds: opts.ttlSeconds ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      )
      .select()
      .single();

    if (error) {
      console.error('[sharedMemory] setMemory error:', error.message);
      return null;
    }

    return data ? toEntry(data) : null;
  } catch (err) {
    console.error('[sharedMemory] setMemory failed:', err);
    return null;
  }
}

/**
 * Retrieve a value from shared memory by key.
 * Returns null if not found or expired.
 */
export async function getMemory(key: string): Promise<SharedMemoryEntry | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from('shared_memory')
      .select('*')
      .eq('key', key)
      .single();

    if (error || !data) return null;

    const entry = toEntry(data);

    // Check TTL expiration
    if (entry.ttlSeconds) {
      const created = new Date(entry.createdAt).getTime();
      const now = Date.now();
      if (now - created > entry.ttlSeconds * 1000) {
        // Expired — clean up
        await deleteMemory(key);
        return null;
      }
    }

    return entry;
  } catch (err) {
    console.error('[sharedMemory] getMemory failed:', err);
    return null;
  }
}

/**
 * Delete a memory entry by key.
 */
export async function deleteMemory(key: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb.from('shared_memory').delete().eq('key', key);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Query shared memory with filters.
 */
export async function queryMemory(query: MemoryQuery = {}): Promise<SharedMemoryEntry[]> {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    let dbQuery = sb.from('shared_memory').select('*');

    if (query.agentId) {
      dbQuery = dbQuery.eq('agent_id', query.agentId);
    }

    if (query.key) {
      dbQuery = dbQuery.eq('key', query.key);
    }

    if (query.limit) {
      dbQuery = dbQuery.limit(query.limit);
    }

    const { data, error } = await dbQuery.order('updated_at', { ascending: false });

    if (error) {
      console.error('[sharedMemory] queryMemory error:', error.message);
      return [];
    }

    let entries = (data ?? []).map(toEntry);

    // Client-side prefix filter (Supabase doesn't have ILIKE in all configs)
    if (query.keyPrefix) {
      entries = entries.filter(e => e.key.startsWith(query.keyPrefix!));
    }

    // Filter out expired entries
    const now = Date.now();
    entries = entries.filter(e => {
      if (!e.ttlSeconds) return true;
      const created = new Date(e.createdAt).getTime();
      return now - created <= e.ttlSeconds * 1000;
    });

    return entries;
  } catch (err) {
    console.error('[sharedMemory] queryMemory failed:', err);
    return [];
  }
}

/**
 * Get all memory keys (non-expired only).
 */
export async function listMemoryKeys(agentId?: string): Promise<string[]> {
  const entries = await queryMemory({ agentId, limit: 1000 });
  return entries.map(e => e.key);
}

/**
 * Batch set multiple memory entries.
 */
export async function batchSetMemory(
  entries: Array<{ key: string; value: unknown; agentId?: string; ttlSeconds?: number }>
): Promise<number> {
  const sb = getSupabase();
  if (!sb || entries.length === 0) return 0;

  try {
    const rows = entries.map(e => ({
      key: e.key,
      value: JSON.parse(JSON.stringify(e.value)),
      agent_id: e.agentId ?? null,
      ttl_seconds: e.ttlSeconds ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await sb.from('shared_memory').upsert(rows, { onConflict: 'key' });
    if (error) {
      console.error('[sharedMemory] batchSetMemory error:', error.message);
      return 0;
    }
    return entries.length;
  } catch (err) {
    console.error('[sharedMemory] batchSetMemory failed:', err);
    return 0;
  }
}

/**
 * Clean up all expired entries.
 */
export async function cleanupExpiredMemory(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;

  try {
    // Get all entries with TTL
    const { data, error } = await sb
      .from('shared_memory')
      .select('*')
      .not('ttl_seconds', 'is', null);

    if (error || !data) return 0;

    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const row of data) {
      const ttl = row.ttl_seconds as number;
      const created = new Date(row.created_at).getTime();
      if (now - created > ttl * 1000) {
        expiredKeys.push(row.key);
      }
    }

    if (expiredKeys.length === 0) return 0;

    // Delete expired entries
    const { error: delError } = await sb
      .from('shared_memory')
      .delete()
      .in('key', expiredKeys);

    if (delError) {
      console.error('[sharedMemory] cleanup error:', delError.message);
      return 0;
    }

    return expiredKeys.length;
  } catch (err) {
    console.error('[sharedMemory] cleanup failed:', err);
    return 0;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get a typed value from memory.
 */
export async function getMemoryValue<T>(key: string, defaultValue?: T): Promise<T | undefined> {
  const entry = await getMemory(key);
  if (!entry) return defaultValue;
  return entry.value as T;
}

/**
 * Store a conversation context snippet for an agent.
 */
export async function saveAgentContext(
  agentId: string,
  context: Record<string, unknown>,
  ttlSeconds = 3600 // 1 hour default
): Promise<void> {
  await setMemory(`agent:context:${agentId}`, context, { agentId, ttlSeconds });
}

/**
 * Load a conversation context snippet for an agent.
 */
export async function loadAgentContext(agentId: string): Promise<Record<string, unknown> | null> {
  const entry = await getMemory(`agent:context:${agentId}`);
  return entry ? (entry.value as Record<string, unknown>) : null;
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERNALS
// ══════════════════════════════════════════════════════════════════════════════

function toEntry(row: Record<string, unknown>): SharedMemoryEntry {
  return {
    id: String(row.id || ''),
    key: String(row.key || ''),
    value: row.value ?? null,
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    ttlSeconds: row.ttl_seconds ? Number(row.ttl_seconds) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}
