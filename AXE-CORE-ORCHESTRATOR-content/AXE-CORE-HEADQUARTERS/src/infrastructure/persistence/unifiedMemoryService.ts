/**
 * unifiedMemoryService — one truth for every Memory surface
 * (Memory tab, Neural terrain, brain hubs, panels).
 *
 * Reads the single `memory` table. It used to fan out to core_memory,
 * global_memory and RAG and merge them here, which made this file the only
 * place the six-table split was hidden rather than felt: the tab looked
 * coherent while every agent underneath read one table each.
 *
 * `layer` is kept, because the Memory tab and the terrain colour by it. It is
 * now derived from each row's recorded origin instead of from which query the
 * row arrived in — same distinction, one read.
 */

import { recallAll } from '@/infrastructure/persistence/agentMemoryService';
import { sbRunSql } from '@/infrastructure/gateways/axeCoreApiService';
import { loadHubCounts } from '@/infrastructure/persistence/memoryHubCountsService';

export type UnifiedLayer = 'core' | 'global' | 'rag' | 'obsidian';

export interface UnifiedMemoryItem {
  id: string;
  content: string;
  layer: UnifiedLayer;
  tags: string[];
  importance: number;
  source: string;
  created_at: string;
  rawKey?: string;
}

function dedupeKey(item: UnifiedMemoryItem): string {
  return `${item.layer}:${item.content.slice(0, 100).toLowerCase().replace(/\s+/g, ' ')}`;
}

/**
 * Load the same memory stream every UI should show.
 * Newest first. Deduped across layers when content matches.
 */
/**
 * Which visual layer a row belongs to, from where it came from.
 *
 * Exported so the mapping is testable: getting it wrong does not throw, it
 * just quietly recolours the terrain and moves counts between badges.
 */
export function layerOf(source: string | null, kind: string | null): UnifiedLayer {
  if (kind === 'doc') return 'rag';
  const s = (source ?? '').toLowerCase();
  if (s.includes('rag') || s.includes('axe-core')) return 'rag';
  if (s.includes('global')) return 'global';
  if (s.includes('obsidian')) return 'obsidian';
  return 'core';
}

/**
 * Every store, newest first -- with the trading agent's telemetry left out.
 *
 * This file's header said it reads "the single `memory` table", and it did.
 * The terrain and the brain read global_memory, rag_memories and the notes.
 * So the Memory tab and the Home views were showing different memories, which
 * is exactly what "is it all the same memory now" was asking about.
 *
 * One union across all four stores instead. What is deliberately NOT in it:
 * `ta:` cycle and decision rows, and the bare `HOLD score=` lessons. That is
 * ~11,000 rows of the trading agent's per-cycle telemetry, and including it
 * makes this list a wall of `HOLD score=0.000` with everything else buried --
 * the agent writes several rows a minute. Its wins, losses, mistakes and real
 * lessons stay, because those are memory; the tick-by-tick is telemetry and
 * has its own page at /memory/trading.
 */
const UNIFIED_SQL = (limit: number) => `
  SELECT * FROM (
    SELECT id::text AS id, left(content, 400) AS content, 'core' AS layer,
           coalesce(agent, source, 'memory') AS source,
           coalesce(importance, confidence, 0.5)::float8 AS importance,
           key, created_at
    FROM memory
    UNION ALL
    SELECT id::text, left(value, 400), 'global', coalesce(category, 'global'),
           coalesce(confidence, 0.5)::float8, key, created_at
    FROM global_memory
    WHERE NOT (
      key LIKE 'ta:%' AND (
        split_part(key, ':', 3) IN ('cycle', 'decision')
        OR value ~ '^(HOLD|BUY|SELL) score='
      )
    )
    UNION ALL
    SELECT id::text, left(content, 400), 'rag', coalesce(app_source, category, 'rag'),
           (coalesce(importance, 5) / 10.0)::float8, NULL, created_at
    FROM rag_memories
    UNION ALL
    SELECT path, left(coalesce(content, title), 400), 'obsidian', 'obsidian',
           0.6::float8, path, updated_at
    FROM core_obsidian_notes
  ) u ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(500, limit))}`;

interface UnifiedRow {
  id: string; content: string; layer: string; source: string;
  importance: number; key: string | null; created_at: string;
}

export async function loadUnifiedMemory(limit = 120): Promise<UnifiedMemoryItem[]> {
  try {
    const rows = (await sbRunSql(UNIFIED_SQL(limit))) as unknown as UnifiedRow[];
    if (Array.isArray(rows) && rows.length) {
      const items = rows.map<UnifiedMemoryItem>(r => ({
        id: r.id,
        content: r.content ?? '',
        layer: (r.layer as UnifiedLayer) ?? 'core',
        tags: [r.source].filter(Boolean),
        importance: Math.round((Number(r.importance) || 0.5) * 10),
        source: r.source ?? 'memory',
        created_at: r.created_at,
        rawKey: r.key ?? undefined,
      }));
      const seen = new Set<string>();
      const out: UnifiedMemoryItem[] = [];
      for (const it of items) {
        const k = dedupeKey(it);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(it);
      }
      return out;
    }
  } catch (err) {
    // Loudly. An unreachable database must not look like an empty memory.
    console.error('[unifiedMemory] union read failed, falling back to `memory` only:', err);
  }

  // Fallback: the single-table read this file used to do. Wrong-but-visible
  // beats empty-and-silent.
  const rows = await recallAll(limit).catch(() => []);

  const items: UnifiedMemoryItem[] = rows.map(r => ({
    id: r.id,
    content: r.content,
    layer: layerOf(r.source, r.kind),
    tags: r.tags ?? [r.category].filter(Boolean) as string[],
    // The table stores 0–1; this surface has always spoken 1–10.
    importance: Math.round(((r.importance ?? r.confidence ?? 0.5) as number) * 10),
    source: r.source ?? r.category ?? 'memory',
    created_at: r.created_at,
    rawKey: r.key ?? undefined,
  }));

  const seen = new Set<string>();
  const out: UnifiedMemoryItem[] = [];
  for (const it of items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    const k = dedupeKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out.slice(0, limit);
}

/**
 * Counts per layer — for brain/terrain integrity badges.
 *
 * Was `loadUnifiedMemory(300)` and then filtering the result, so every badge
 * reported a slice of 300 as though it were the store: the same "the sample is
 * the answer" mistake the terrain had, one level further in. Counted in the
 * database now, through the shared count service.
 */
export async function loadUnifiedMemoryCounts(): Promise<{
  core: number;
  global: number;
  rag: number;
  total: number;
}> {
  const counted = await loadHubCounts().catch(() => null);
  if (counted?.ok) {
    return {
      core: counted.agentStoreTotal,
      global: counted.globalTotal,
      rag: counted.ragTotal,
      total: counted.total,
    };
  }
  const all = await loadUnifiedMemory(300);
  return {
    core: all.filter(x => x.layer === 'core').length,
    global: all.filter(x => x.layer === 'global').length,
    rag: all.filter(x => x.layer === 'rag').length,
    total: all.length,
  };
}
