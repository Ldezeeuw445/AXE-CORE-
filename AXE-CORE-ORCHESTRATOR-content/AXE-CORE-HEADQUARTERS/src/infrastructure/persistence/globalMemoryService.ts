/**
 * globalMemoryService.ts — global memory + Obsidian + income ledger context.
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import {
  searchObsidianNotes,
  listRecentObsidianNotes,
  formatNotesForContext,
} from '@/infrastructure/persistence/obsidianMemoryService';
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

export async function saveGlobalMemory(entry: Omit<GlobalMemoryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    const cached = loadCachedGlobalMemories();
    cached.push({ ...entry, id: crypto.randomUUID(), created_at: new Date().toISOString() } as GlobalMemoryEntry);
    cacheGlobalMemories(cached);
    return;
  }
  const { error } = await sb
    .from('global_memory')
    .upsert(
      {
        user_id: entry.user_id,
        category: entry.category,
        key: entry.key,
        value: entry.value,
        confidence: entry.confidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,key' }
    );

  if (error) {
    console.error('[GlobalMemory] save failed:', error);
    const cached = loadCachedGlobalMemories();
    cached.push({ ...entry, id: crypto.randomUUID(), created_at: new Date().toISOString() } as GlobalMemoryEntry);
    cacheGlobalMemories(cached);
  }
}

export async function loadGlobalMemories(userId: string, category?: string, limit = 100): Promise<GlobalMemoryEntry[]> {
  try {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase not available');

    let query = sb
      .from('global_memory')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      cacheGlobalMemories(data as GlobalMemoryEntry[]);
      return data as GlobalMemoryEntry[];
    }
  } catch (err) {
    console.warn('[GlobalMemory] Supabase failed, using cache:', err);
  }

  return loadCachedGlobalMemories();
}

export async function loadMemoriesByCategory(userId: string, category: string): Promise<GlobalMemoryEntry[]> {
  return loadGlobalMemories(userId, category, 50);
}

export async function buildGlobalMemoryContext(userId: string, query: string, maxChars = 1000): Promise<string> {
  const globalBudget = Math.floor(maxChars * 0.45);
  const obsidianBudget = Math.floor(maxChars * 0.35);
  const incomeBudget = Math.max(200, maxChars - globalBudget - obsidianBudget);

  const memories = await loadGlobalMemories(userId, undefined, 200).catch(() => [] as GlobalMemoryEntry[]);

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const incomeQuery = /income|verdiend|earning|prime\s*opinion|enquete|enquête|salaris|trading|inkomen|finance|cashout/i.test(query);

  const relevant = memories
    .filter(m => {
      if (!queryWords.length) return true;
      const text = `${m.key} ${m.value}`.toLowerCase();
      return queryWords.some(w => text.includes(w));
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20);

  let globalBlock = '';
  if (relevant.length > 0) {
    const context = relevant.map(m => {
      const val = typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
      return `- ${m.category}: ${m.key} → ${val.slice(0, 200)}`;
    }).join('\n');
    globalBlock = `## Global Memory Context\n${context}`;
  }

  let obsidianBlock = '';
  try {
    const notes = query.trim().length >= 3
      ? await searchObsidianNotes(query.trim(), 8)
      : await listRecentObsidianNotes(8);
    obsidianBlock = formatNotesForContext(notes, obsidianBudget);
  } catch { /* */ }

  let incomeBlock = '';
  try {
    if (incomeQuery || maxChars >= 1500) {
      const entries = await listIncomeEntries();
      incomeBlock = formatIncomeForContext(entries, 12).slice(0, incomeBudget);
    }
  } catch { /* */ }

  const parts = [globalBlock.slice(0, globalBudget), obsidianBlock, incomeBlock].filter(Boolean);
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
