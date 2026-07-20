/**
 * globalMemoryService.ts
 * ------------------------------------------------------------------
 * Global memory layer for AXE CORE.
 * 
 * This is the "brain's notebook" that LangGraph and EVE use to quickly
 * choose the right agent, provider, or specialist.
 * 
 * All memories are stored in Supabase for persistence across sessions.
 * ------------------------------------------------------------------ */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

export interface GlobalMemoryEntry {
  id?: string;
  user_id: string;
  category: 'agent_performance' | 'provider_performance' | 'specialist_match' | 'conversation_context' | 'user_preference' | 'system_event';
  key: string;           // e.g. "agent:openhands:code:success"
  value: string;         // JSON string of the memory
  metadata?: Record<string, unknown>;
  confidence: number;    // 0-1, how sure we are about this memory
  created_at?: string;
  updated_at?: string;
}

const LS_GLOBAL_MEMORY = 'axe_global_memory_cache';
const LS_GLOBAL_TIMESTAMP = 'axe_global_memory_last_sync';

// --- LocalStorage cache (fallback + speed) ---
function cacheGlobalMemories(memories: GlobalMemoryEntry[]) {
  try { localStorage.setItem(LS_GLOBAL_MEMORY, JSON.stringify(memories.slice(-200))); } catch {}
  try { localStorage.setItem(LS_GLOBAL_TIMESTAMP, Date.now().toString()); } catch {}
}

function loadCachedGlobalMemories(): GlobalMemoryEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_GLOBAL_MEMORY) || '[]'); } catch { return []; }
}

// --- Supabase Operations ---

/**
 * Save a global memory entry to Supabase.
 */
export async function saveGlobalMemory(entry: Omit<GlobalMemoryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const sb = getSupabase();
  if (!sb) { 
    // Fallback: cache in localStorage
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
    // Fallback: cache in localStorage
    const cached = loadCachedGlobalMemories();
    cached.push({ ...entry, id: crypto.randomUUID(), created_at: new Date().toISOString() } as GlobalMemoryEntry);
    cacheGlobalMemories(cached);
  }
}

/**
 * Load global memories from Supabase (with localStorage fallback).
 */
export async function loadGlobalMemories(userId: string, category?: string, limit = 100): Promise<GlobalMemoryEntry[]> {
  // Try Supabase first
  try {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase not available');
    
    let query = sb
      .from('global_memory')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    
    if (category) {
      query = query.eq('category', category);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    if (data && data.length > 0) {
      cacheGlobalMemories(data as GlobalMemoryEntry[]);
      return data as GlobalMemoryEntry[];
    }
  } catch (err) {
    console.warn('[GlobalMemory] Supabase failed, using cache:', err);
  }
  
  // Fallback to localStorage
  return loadCachedGlobalMemories();
}

/**
 * Load memories by category for quick agent/provider selection.
 */
export async function loadMemoriesByCategory(userId: string, category: string): Promise<GlobalMemoryEntry[]> {
  return loadGlobalMemories(userId, category, 50);
}

/**
 * Build a context string for LangGraph/EVE from global memories.
 * This is the "quick brain access" for choosing the right specialist.
 */
export async function buildGlobalMemoryContext(userId: string, query: string, maxChars = 1000): Promise<string> {
  const memories = await loadGlobalMemories(userId, undefined, 200);
  
  // Filter by relevance (simple keyword matching for now, can be upgraded to vector search)
  const queryWords = query.toLowerCase().split(/\s+/);
  const relevant = memories
    .filter(m => {
      const text = `${m.key} ${m.value}`.toLowerCase();
      return queryWords.some(w => text.includes(w));
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20);
  
  if (relevant.length === 0) return '';
  
  const context = relevant.map(m => {
    const val = typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
    return `- ${m.category}: ${m.key} → ${val.slice(0, 200)}`;
  }).join('\n');
  
  return `## Global Memory Context\n${context}`.slice(0, maxChars);
}

/**
 * Record an agent's performance for future selection.
 */
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

/**
 * Record a provider's performance for future selection.
 */
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
  
  let confidence = 0.5;
  if (existingEntry) {
    const data = JSON.parse(existingEntry.value || '{}');
    const total = (data.total || 0) + 1;
    const successes = (data.successes || 0) + (success ? 1 : 0);
    confidence = successes / total;
    
    await saveGlobalMemory({
      user_id: userId,
      category: 'provider_performance',
      key,
      value: JSON.stringify({ total, successes, latency: latencyMs, ...data }),
      confidence,
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

/**
 * Record a specialist match for future use.
 * E.g. "code task → forge agent is best"
 */
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

/**
 * Get the best specialist for a given query type.
 */
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

/**
 * Initialize global memory for a user.
 */
export async function initializeGlobalMemory(userId: string): Promise<void> {
  // Pre-populate with some defaults
  const defaults = [
    { category: 'user_preference', key: 'language', value: 'Dutch/English', confidence: 0.9 },
    { category: 'user_preference', key: 'response_style', value: 'fast, concise, friendly', confidence: 0.9 },
  ];
  
  for (const d of defaults) {
    await saveGlobalMemory({
      user_id: userId,
      category: d.category as any,
      key: d.key,
      value: d.value,
      confidence: d.confidence,
    });
  }
}

/**
 * Log a system event to global memory.
 * This tracks what happened, when, and why.
 */
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
