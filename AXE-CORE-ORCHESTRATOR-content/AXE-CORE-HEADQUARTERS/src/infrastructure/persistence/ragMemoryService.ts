/**
 * ragMemoryService.ts
 * ------------------------------------------------------------------
 * AXE CORE's persistent RAG (Retrieval-Augmented Generation) memory.
 *
 * Long-term memory independent of which model/provider is active.
 * Search is **semantic** (vector cosine) with keyword boost — not only keywords.
 * Obsidian notes are indexed into this same store via globalBrainService.
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isAxeApiConfigured, sbInsertRow } from '@/infrastructure/gateways/axeCoreApiService';
import { APP_SOURCE, AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import {
  cosineSimilarity,
  embedText,
  embedTextSync,
  type EmbeddingVector,
} from '@/infrastructure/persistence/embeddingService';

export interface RagMemory {
  id?: string;
  category: 'user' | 'system' | 'conversation' | 'tool' | 'agent';
  content: string;
  importance: number; // 1-10
  metadata?: Record<string, unknown>;
  /** Optional stored embedding (local or remote). */
  embedding?: EmbeddingVector;
  created_at?: string;
}

const LS_RAG_KEY = 'axe_rag_memory';

const CORE_KNOWLEDGE: Omit<RagMemory, 'id' | 'created_at'>[] = [
  {
    category: 'user',
    content:
      'Luka de Zeeuw is a 31-year-old Dutch full-stack developer and infrastructure engineer from Amsterdam. He is building the AXE ecosystem.',
    importance: 10,
  },
  {
    category: 'user',
    content:
      'Luka codes in TypeScript/Python and deploys on Railway/Vercel. He prefers direct, concise communication.',
    importance: 9,
  },
  {
    category: 'system',
    content:
      'AXE CORE is the master intelligence and God Mode OS. It controls the entire AXE ecosystem including Companion, Intel, and Trading OS.',
    importance: 10,
  },
  {
    category: 'system',
    content:
      'AXE Architecture: Core → Applications → Agents → Models → Capabilities → Tools → Services → Event Bus → Memory → Runtime → Health',
    importance: 9,
  },
  {
    category: 'system',
    content:
      'AXE principles: One AI identity, Architecture before features, One source of truth (Supabase), Everything is discoverable, Event driven, Three memory layers, Architecture is alive, AXE builds AXE, Simplicity wins, One conversation.',
    importance: 9,
  },
];

async function withEmbedding(
  memory: Omit<RagMemory, 'id' | 'created_at'>
): Promise<Omit<RagMemory, 'id' | 'created_at'>> {
  if (memory.embedding && memory.embedding.length > 0) return memory;
  const embedding = await embedText(memory.content);
  return { ...memory, embedding, metadata: { ...(memory.metadata || {}), embed_dim: embedding.length } };
}

// ── Save ──────────────────────────────────────────────────────────────────

export async function saveRagMemory(
  memory: Omit<RagMemory, 'id' | 'created_at'>
): Promise<void> {
  const enriched = await withEmbedding(memory);
  const record = {
    app_source: APP_SOURCE,
    user_id: AXE_USER_ID,
    category: enriched.category,
    content: enriched.content,
    importance: enriched.importance,
    metadata: {
      ...(enriched.metadata || {}),
      has_embedding: true,
    },
  };

  try {
    if (isAxeApiConfigured) {
      await sbInsertRow('rag_memories', record);
      fallbackSaveRagMemory(enriched);
      return;
    }

    const sb = getSupabase();
    if (!sb) {
      fallbackSaveRagMemory(enriched);
      return;
    }

    const { error } = await sb.from('rag_memories').insert(record);
    if (error) {
      console.error('[ragMemory] Supabase insert error:', error);
      fallbackSaveRagMemory(enriched);
    } else {
      fallbackSaveRagMemory(enriched);
    }
  } catch (err) {
    console.error('[ragMemory] saveRagMemory failed:', err);
    fallbackSaveRagMemory(enriched);
  }
}

// ── Load ──────────────────────────────────────────────────────────────────

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

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) {
      console.error('[ragMemory] loadRagMemories error:', error);
      return fallbackLoadRagMemories(category, minImportance, limit);
    }

    const remote = (data || []) as RagMemory[];
    const local = fallbackLoadRagMemories(undefined, 1, 200);
    const byContent = new Map(local.map((m) => [m.content, m]));
    return remote.map((m) => {
      const loc = byContent.get(m.content);
      return loc?.embedding ? { ...m, embedding: loc.embedding } : m;
    });
  } catch (err) {
    console.error('[ragMemory] loadRagMemories failed:', err);
    return fallbackLoadRagMemories(category, minImportance, limit);
  }
}

// ── Semantic search ───────────────────────────────────────────────────────

export async function searchRagMemories(
  query: string,
  limit: number = 5
): Promise<RagMemory[]> {
  const all = await loadRagMemories(undefined, 1, 200);
  if (all.length === 0) return [];

  const qVec = await embedText(query);
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 2);

  const scored = all.map((mem) => {
    const memVec =
      mem.embedding && mem.embedding.length
        ? mem.embedding
        : embedTextSync(mem.content);
    let score = cosineSimilarity(qVec, memVec);

    const content = mem.content.toLowerCase();
    for (const kw of keywords) {
      if (content.includes(kw)) score += 0.04;
    }
    if (mem.importance >= 8) score += 0.03;
    if (mem.importance >= 10) score += 0.02;

    return { mem, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const minScore = 0.12;
  const hits = scored.filter((s) => s.score >= minScore).slice(0, limit);
  if (hits.length === 0) {
    return [...all].sort((a, b) => b.importance - a.importance).slice(0, limit);
  }
  return hits.map((s) => s.mem);
}

// ── Context for prompts ───────────────────────────────────────────────────

export async function buildRagContext(
  userQuery: string,
  maxTokens: number = 1000
): Promise<string> {
  try {
    const { buildGlobalBrainContext } = await import(
      '@/infrastructure/persistence/globalBrainService'
    );
    const ctx = await buildGlobalBrainContext(userQuery, maxTokens * 4);
    if (ctx) return ctx;
  } catch {
    /* fall through */
  }

  const coreMemories = await loadRagMemories(undefined, 8, 50);
  const relevantMemories = await searchRagMemories(userQuery, 10);

  const seen = new Set<string>();
  const combined: RagMemory[] = [];
  for (const mem of [...relevantMemories, ...coreMemories]) {
    if (!seen.has(mem.content)) {
      seen.add(mem.content);
      combined.push(mem);
    }
  }

  const maxChars = maxTokens * 4;
  let context = '## AXE Global Brain\n\n';
  for (const mem of combined) {
    const line = `[${mem.category.toUpperCase()}] ${mem.content}\n`;
    if (context.length + line.length > maxChars) break;
    context += line;
  }
  return context;
}

// ── Extract from messages ─────────────────────────────────────────────────

export async function extractMemoryFromMessage(
  role: 'user' | 'axe',
  content: string
): Promise<void> {
  if (role === 'axe' && content.length < 100) return;
  const lower = content.toLowerCase();

  if (lower.includes('ik hou van') || lower.includes('i love') || lower.includes('i prefer')) {
    await saveRagMemory({
      category: 'user',
      content: `Luka preference: ${content.slice(0, 200)}`,
      importance: 7,
    });
  }
  if (
    lower.includes('verander') ||
    lower.includes('change') ||
    lower.includes('update') ||
    lower.includes('fix')
  ) {
    if (content.includes('code') || content.includes('config') || content.includes('setting')) {
      await saveRagMemory({
        category: 'system',
        content: `System change: ${content.slice(0, 200)}`,
        importance: 6,
      });
    }
  }
  if (lower.includes('app') || lower.includes('project') || lower.includes('website')) {
    await saveRagMemory({
      category: 'system',
      content: `Project mention: ${content.slice(0, 200)}`,
      importance: 5,
    });
  }
}

export async function initializeRagMemory(): Promise<void> {
  const existing = await loadRagMemories(undefined, 1, 10);
  if (existing.length === 0) {
    for (const mem of CORE_KNOWLEDGE) {
      await saveRagMemory(mem);
    }
  }
  try {
    const { ensureObsidianBrainSync } = await import(
      '@/infrastructure/persistence/globalBrainService'
    );
    await ensureObsidianBrainSync(false);
  } catch (err) {
    console.warn('[ragMemory] obsidian→brain sync skipped', err);
  }
}

// ── localStorage ──────────────────────────────────────────────────────────

function fallbackSaveRagMemory(memory: Omit<RagMemory, 'id' | 'created_at'>): void {
  try {
    const existing: RagMemory[] = JSON.parse(localStorage.getItem(LS_RAG_KEY) || '[]');
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filtered = existing.filter((m) => m.content !== memory.content);
    filtered.push({
      ...memory,
      id,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(LS_RAG_KEY, JSON.stringify(filtered.slice(-250)));
  } catch {
    /* */
  }
}

function fallbackLoadRagMemories(
  category?: RagMemory['category'],
  minImportance: number = 1,
  limit: number = 100
): RagMemory[] {
  try {
    const all: RagMemory[] = JSON.parse(localStorage.getItem(LS_RAG_KEY) || '[]');
    let filtered = all.filter((m) => m.importance >= minImportance);
    if (category) filtered = filtered.filter((m) => m.category === category);
    filtered.sort((a, b) => b.importance - a.importance);
    return filtered.slice(0, limit);
  } catch {
    return [];
  }
}
