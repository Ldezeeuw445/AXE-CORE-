/**
 * globalMemoryService.ts — global memory + durable brain context entrypoint.
 *
 * buildGlobalMemoryContext is the shared API used by voiceStore, agents,
 * browser, EVE, and toolRegistry. It now routes through the durable brain
 * (GraphRAG + RAG + global) so every path gets the same memory quality.
 */

import { memUpsert, memList } from '@/infrastructure/gateways/axeCoreApiService';
import {
  listIncomeEntries,
  formatIncomeForContext,
} from '@/infrastructure/persistence/incomeLedgerService';

export interface GlobalMemoryEntry {
  id?: string;
  user_id: string;
  category: 'agent_performance' | 'provider_performance' | 'specialist_match' | 'conversation_context' | 'user_preference' | 'system_event';
  key: string;
  value: string;
  metadata?: Record<string, unknown>;
  confidence: number;
  created_at?: string;
  updated_at?: string;
}

const LS_GLOBAL_MEMORY = 'axe_global_memory_cache';
const LS_GLOBAL_TIMESTAMP = 'axe_global_memory_last_sync';

function cacheGlobalMemories(memories: GlobalMemoryEntry[]) {
  try { localStorage.setItem(LS_GLOBAL_MEMORY, JSON.stringify(memories.slice(-200))); } catch {}
  try { localStorage.setItem(LS_GLOBAL_TIMESTAMP, Date.now().toString()); } catch {}
}

function loadCachedGlobalMemories(): GlobalMemoryEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_GLOBAL_MEMORY) || '[]'); } catch { return []; }
}

/**
 * Persists one memory, server-side.
 *
 * Two earlier versions of this both silently dropped every write. The first
 * went straight to Supabase with the anon key, which RLS rejects (42501). The
 * second routed through the API's /supabase/sql, but the `exec_sql` RPC behind
 * it is read-only — an INSERT comes back as `syntax error at or near "into"`.
 * Both caught the failure and wrote to localStorage, so the app looked like it
 * was remembering while `global_memory` stayed empty.
 *
 * It now uses /memory/upsert (axe_api, backend/axe_api/main.py), which writes
 * through the service_role client held server-side — the browser never sees
 * that key. Confirmed live: entries written this way (reflections, memory
 * manager cycles, chat) are readable back via GET /memory and /memory/stats.
 *
 * Failure is deliberately loud. A memory that silently becomes local is worse
 * than one that fails, because nothing downstream can tell the difference.
 */
export async function saveGlobalMemory(entry: Omit<GlobalMemoryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  try {
    await memUpsert([{
      user_id: entry.user_id,
      category: entry.category,
      key: entry.key,
      value: entry.value,
      confidence: entry.confidence,
      metadata: entry.metadata,
    }]);
  } catch (err) {
    // Keep a local copy so the entry is not lost, but surface the failure —
    // callers and the user need to know the durable write did not happen.
    const cached = loadCachedGlobalMemories();
    cached.push({ ...entry, id: crypto.randomUUID(), created_at: new Date().toISOString() } as GlobalMemoryEntry);
    cacheGlobalMemories(cached);
    console.error('[GlobalMemory] durable write FAILED, cached locally only:', entry.key, err);
    throw err;
  }
}

export async function loadGlobalMemories(userId: string, category?: string, limit = 100): Promise<GlobalMemoryEntry[]> {
  // Reads go through the API as well, so recall sees exactly what was
  // durably written rather than a browser-local view of it.
  try {
    const rows = await memList({ user_id: userId, category, limit }) as unknown as GlobalMemoryEntry[];
    if (Array.isArray(rows)) {
      // An empty result is a real answer, not a failure — caching it keeps the
      // local copy from resurrecting entries that were deleted server-side.
      cacheGlobalMemories(rows);
      return rows;
    }
  } catch (err) {
    console.warn('[GlobalMemory] read failed, falling back to cache:', err);
  }

  return loadCachedGlobalMemories();
}

export async function loadMemoriesByCategory(userId: string, category: string): Promise<GlobalMemoryEntry[]> {
  return loadGlobalMemories(userId, category, 50);
}

/**
 * Shared memory context for chat + every agent path.
 * Routes through the durable brain (GraphRAG / RAG / global) and appends
 * income ledger when relevant — single source of truth for "what AXE knows".
 */
export async function buildGlobalMemoryContext(userId: string, query: string, maxChars = 1000): Promise<string> {
  const incomeQuery = /income|verdiend|earning|prime\s*opinion|enquete|enquête|salaris|trading|inkomen|finance|cashout/i.test(query);
  const incomeBudget = incomeQuery || maxChars >= 1500 ? Math.min(280, Math.floor(maxChars * 0.15)) : 0;
  const brainBudget = Math.max(400, maxChars - incomeBudget);

  // Dynamic import avoids circular dependency with buildDurableMemoryContext
  // (which imports loadGlobalMemories from this module).
  let brainBlock = '';
  try {
    const { buildDurableMemoryContext } = await import(
      '@/infrastructure/persistence/buildDurableMemoryContext'
    );
    brainBlock = await buildDurableMemoryContext(userId, query, brainBudget);
  } catch (err) {
    console.warn('[GlobalMemory] durable brain failed, empty context:', err);
  }

  let incomeBlock = '';
  if (incomeBudget > 0) {
    try {
      const entries = await listIncomeEntries();
      incomeBlock = formatIncomeForContext(entries, 12).slice(0, incomeBudget);
    } catch { /* */ }
  }

  const parts = [brainBlock, incomeBlock].filter(Boolean);
  if (!parts.length) return '';
  return parts.join('\n\n').slice(0, maxChars);
}

export async function recordAgentPerformance(
  userId: string,
  agentId: string,
  capability: string,
  success: boolean,
  latencyMs: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  const key = `agent:${agentId}:${capability}`;
  const existing = await loadGlobalMemories(userId, 'agent_performance', 1);
  const existingEntry = existing.find(m => m.key === key);

  let confidence = 0.5;
  if (existingEntry) {
    const data = JSON.parse(existingEntry.value || '{}');
    const total = (data.total || 0) + 1;
    const successes = (data.successes || 0) + (success ? 1 : 0);
    confidence = successes / total;

    await saveGlobalMemory({
      user_id: userId,
      category: 'agent_performance',
      key,
      value: JSON.stringify({ total, successes, latency: latencyMs, ...data }),
      confidence,
      metadata: { ...metadata, last_updated: new Date().toISOString() },
    });
  } else {
    await saveGlobalMemory({
      user_id: userId,
      category: 'agent_performance',
      key,
      value: JSON.stringify({ total: 1, successes: success ? 1 : 0, latency: latencyMs }),
      confidence: success ? 0.7 : 0.3,
      metadata: { ...metadata, last_updated: new Date().toISOString() },
    });
  }
}

export async function recordProviderPerformance(
  userId: string,
  providerId: string,
  capability: string,
  success: boolean,
  latencyMs: number
): Promise<void> {
  const key = `provider:${providerId}:${capability}`;
  const existing = await loadGlobalMemories(userId, 'provider_performance', 1);
  const existingEntry = existing.find(m => m.key === key);

  if (existingEntry) {
    const data = JSON.parse(existingEntry.value || '{}');
    const total = (data.total || 0) + 1;
    const successes = (data.successes || 0) + (success ? 1 : 0);
    await saveGlobalMemory({
      user_id: userId,
      category: 'provider_performance',
      key,
      value: JSON.stringify({ total, successes, latency: latencyMs, ...data }),
      confidence: successes / total,
    });
  } else {
    await saveGlobalMemory({
      user_id: userId,
      category: 'provider_performance',
      key,
      value: JSON.stringify({ total: 1, successes: success ? 1 : 0, latency: latencyMs }),
      confidence: success ? 0.7 : 0.3,
    });
  }
}

export async function recordSpecialistMatch(
  userId: string,
  queryType: string,
  specialistId: string,
  confidence: number
): Promise<void> {
  await saveGlobalMemory({
    user_id: userId,
    category: 'specialist_match',
    key: `specialist:${queryType}`,
    value: JSON.stringify({ specialist_id: specialistId, query_type: queryType }),
    confidence,
  });
}

export async function getBestSpecialist(userId: string, queryType: string): Promise<string | null> {
  const memories = await loadGlobalMemories(userId, 'specialist_match', 10);
  const match = memories
    .filter(m => m.key === `specialist:${queryType}`)
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!match) return null;
  try {
    const data = JSON.parse(match.value);
    return data.specialist_id || null;
  } catch {
    return null;
  }
}

export async function initializeGlobalMemory(userId: string): Promise<void> {
  const defaults = [
    { category: 'user_preference', key: 'language', value: 'Dutch/English', confidence: 0.9 },
    { category: 'user_preference', key: 'response_style', value: 'fast, concise, friendly', confidence: 0.9 },
  ];

  for (const d of defaults) {
    await saveGlobalMemory({
      user_id: userId,
      category: d.category as GlobalMemoryEntry['category'],
      key: d.key,
      value: d.value,
      confidence: d.confidence,
    });
  }
}

export async function logSystemEvent(
  userId: string,
  event: string,
  details: Record<string, unknown>
): Promise<void> {
  await saveGlobalMemory({
    user_id: userId,
    category: 'system_event',
    key: `event:${Date.now()}`,
    value: JSON.stringify({ event, ...details, timestamp: new Date().toISOString() }),
    confidence: 1.0,
  });
}
