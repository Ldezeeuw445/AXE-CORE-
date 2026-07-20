/**
 * ragMemoryService.ts
 * ------------------------------------------------------------------
 * AXE CORE's persistent RAG (Retrieval-Augmented Generation) memory.
 * 
 * This is AXE's "long-term memory" — it persists regardless of which
 * model or provider is currently active. It stores:
 * - Facts about Luka (preferences, projects, habits)
 * - System knowledge (architecture, deployments, configurations)
 * - Conversation summaries (key decisions, action items)
 * - Tool/agent usage patterns
 * 
 * Every chat message gets enriched with relevant RAG context before
 * being sent to any AI provider.
 */

import { getSupabase } from '@/core/supabase/client';
import { isAxeApiConfigured, sbGetRows, sbInsertRow } from '@/services/integrations/axeCoreApiService';
import { APP_SOURCE, AXE_USER_ID } from '@/services/memory/chatPersistence';

export interface RagMemory {
  id?: string;
  category: 'user' | 'system' | 'conversation' | 'tool' | 'agent';
  content: string;
  importance: number; // 1-10, higher = more important
  metadata?: Record<string, unknown>;
  created_at?: string;
}

const LS_RAG_KEY = 'axe_rag_memory';
const LS_RAG_CONTEXT = 'axe_rag_context';

// ── Core Knowledge (seeded if empty) ────────────────────────────────────

const CORE_KNOWLEDGE: Omit<RagMemory, 'id' | 'created_at'>[] = [
  {
    category: 'user',
    content: 'Luka de Zeeuw is a 31-year-old Dutch full-stack developer and infrastructure engineer from Amsterdam. He is building the AXE ecosystem.',
    importance: 10,
  },
  {
    category: 'user',
    content: 'Luka codes in TypeScript/Python and deploys on Railway/Vercel. He prefers direct, concise communication.',
    importance: 9,
  },
  {
    category: 'system',
    content: 'AXE CORE is the master intelligence and God Mode OS. It controls the entire AXE ecosystem including Companion, Intel, and Trading OS.',
    importance: 10,
  },
  {
    category: 'system',
    content: 'AXE Architecture: Core → Applications → Agents → Models → Capabilities → Tools → Services → Event Bus → Memory → Runtime → Health',
    importance: 9,
  },
  {
    category: 'system',
    content: 'AXE principles: One AI identity, Architecture before features, One source of truth (Supabase), Everything is discoverable, Event driven, Three memory layers, Architecture is alive, AXE builds AXE, Simplicity wins, One conversation.',
    importance: 9,
  },
];

// ── Save memory ─────────────────────────────────────────────────────────

export async function saveRagMemory(
  memory: Omit<RagMemory, 'id' | 'created_at'>
): Promise<void> {
  const record = {
    app_source: APP_SOURCE,
    user_id: AXE_USER_ID,
    category: memory.category,
    content: memory.content,
    importance: memory.importance,
    metadata: memory.metadata || {},
  };

  try {
    if (isAxeApiConfigured) {
      await sbInsertRow('rag_memories', record);
      return;
    }

    const sb = getSupabase();
    if (!sb) {
      // Fallback to localStorage
      fallbackSaveRagMemory(memory);
      return;
    }

    const { error } = await sb.from('rag_memories').insert(record);
    if (error) {
      console.error('[ragMemory] Supabase insert error:', error);
      fallbackSaveRagMemory(memory);
    }
  } catch (err) {
    console.error('[ragMemory] saveRagMemory failed:', err);
    fallbackSaveRagMemory(memory);
  }
}

// ── Load memories ─────────────────────────────────────────────────────────

export async function loadRagMemories(
  category?: RagMemory['category'],
  minImportance: number = 1,
  limit: number = 100
): Promise<RagMemory[]> {
  try {
    const sb = getSupabase();
    if (!sb) return fallbackLoadRagMemories(category, minImportance, limit);

    let query = sb
      .from('rag_memories')
      .select('*')
      .eq('user_id', AXE_USER_ID)
      .eq('app_source', APP_SOURCE)
      .gte('importance', minImportance)
      .order('importance', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[ragMemory] loadRagMemories error:', error);
      return fallbackLoadRagMemories(category, minImportance, limit);
    }

    return (data || []) as RagMemory[];
  } catch (err) {
    console.error('[ragMemory] loadRagMemories failed:', err);
    return fallbackLoadRagMemories(category, minImportance, limit);
  }
}

// ── Search memories by relevance (simple keyword matching) ──────────────────

export async function searchRagMemories(
  query: string,
  limit: number = 5
): Promise<RagMemory[]> {
  const all = await loadRagMemories(undefined, 1, 200);
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 3);
  
  if (keywords.length === 0) return all.slice(0, limit);

  const scored = all.map(mem => {
    const content = mem.content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (content.includes(kw)) score += 1;
      // Bonus for exact matches in important memories
      if (mem.importance >= 8) score += 0.5;
    }
    return { mem, score };
  });

  scored.sort((a, b) => b.score - a.score || b.mem.importance - a.mem.importance);
  return scored.filter(s => s.score > 0).slice(0, limit).map(s => s.mem);
}

// ── Build context string for prompts ──────────────────────────────────────

export async function buildRagContext(
  userQuery: string,
  maxTokens: number = 1000
): Promise<string> {
  // Load core knowledge + relevant memories
  const coreMemories = await loadRagMemories(undefined, 8, 50);
  const relevantMemories = await searchRagMemories(userQuery, 10);
  
  // Combine and deduplicate
  const seen = new Set<string>();
  const combined: RagMemory[] = [];
  
  for (const mem of [...coreMemories, ...relevantMemories]) {
    if (!seen.has(mem.content)) {
      seen.add(mem.content);
      combined.push(mem);
    }
  }

  // Sort by importance
  combined.sort((a, b) => b.importance - a.importance);

  // Build context string (roughly 4 chars per token)
  const maxChars = maxTokens * 4;
  let context = '## AXE Memory Context\n\n';
  
  for (const mem of combined) {
    const line = `[${mem.category.toUpperCase()}] ${mem.content}\n`;
    if (context.length + line.length > maxChars) break;
    context += line;
  }

  return context;
}

// ── Extract and save memories from conversations ────────────────────────────

export async function extractMemoryFromMessage(
  role: 'user' | 'axe',
  content: string
): Promise<void> {
  // Only extract from user messages or significant AXE responses
  if (role === 'axe' && content.length < 100) return;

  // Simple extraction rules
  const lower = content.toLowerCase();

  // User preferences
  if (lower.includes('ik hou van') || lower.includes('i love') || lower.includes('i prefer')) {
    await saveRagMemory({
      category: 'user',
      content: `Luka preference: ${content.slice(0, 200)}`,
      importance: 7,
    });
  }

  // System changes
  if (lower.includes('verander') || lower.includes('change') || lower.includes('update') || lower.includes('fix')) {
    if (content.includes('code') || content.includes('config') || content.includes('setting')) {
      await saveRagMemory({
        category: 'system',
        content: `System change: ${content.slice(0, 200)}`,
        importance: 6,
      });
    }
  }

  // Projects/Apps
  if (lower.includes('app') || lower.includes('project') || lower.includes('website')) {
    await saveRagMemory({
      category: 'system',
      content: `Project mention: ${content.slice(0, 200)}`,
      importance: 5,
    });
  }
}

// ── Initialize core knowledge ────────────────────────────────────────────

export async function initializeRagMemory(): Promise<void> {
  const existing = await loadRagMemories(undefined, 1, 10);
  if (existing.length > 0) return; // Already seeded

  for (const mem of CORE_KNOWLEDGE) {
    await saveRagMemory(mem);
  }
}

// ── Fallback localStorage ─────────────────────────────────────────────────

function fallbackSaveRagMemory(memory: Omit<RagMemory, 'id' | 'created_at'>): void {
  try {
    const existing: RagMemory[] = JSON.parse(localStorage.getItem(LS_RAG_KEY) || '[]');
    existing.push({
      ...memory,
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(LS_RAG_KEY, JSON.stringify(existing.slice(-200)));
  } catch {}
}

function fallbackLoadRagMemories(
  category?: RagMemory['category'],
  minImportance: number = 1,
  limit: number = 100
): RagMemory[] {
  try {
    const all: RagMemory[] = JSON.parse(localStorage.getItem(LS_RAG_KEY) || '[]');
    let filtered = all.filter(m => m.importance >= minImportance);
    if (category) filtered = filtered.filter(m => m.category === category);
    filtered.sort((a, b) => b.importance - a.importance);
    return filtered.slice(0, limit);
  } catch { return []; }
}
