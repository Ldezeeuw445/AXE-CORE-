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

export async function loadUnifiedMemory(limit = 120): Promise<UnifiedMemoryItem[]> {
  // One read. The old three-way fan-out is what this file existed to hide.
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

/** Counts per layer — for brain/terrain integrity badges */
export async function loadUnifiedMemoryCounts(): Promise<{
  core: number;
  global: number;
  rag: number;
  total: number;
}> {
  const all = await loadUnifiedMemory(300);
  const core = all.filter((x) => x.layer === 'core').length;
  const global = all.filter((x) => x.layer === 'global').length;
  const rag = all.filter((x) => x.layer === 'rag').length;
  return { core, global, rag, total: all.length };
}
