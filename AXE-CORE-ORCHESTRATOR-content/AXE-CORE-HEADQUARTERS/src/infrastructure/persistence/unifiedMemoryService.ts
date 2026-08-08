/**
 * unifiedMemoryService — one truth for every Memory surface
 * (Memory tab, Neural terrain, brain hubs, panels).
 *
 * Pulls core_memory + global_memory + RAG (+ optional Obsidian count)
 * into one sorted list so every view can show the same story.
 */

import { loadMemories, type CoreMemoryEntry } from '@/infrastructure/persistence/coreDB';
import { loadGlobalMemories, type GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { loadRagMemories, type RagMemory } from '@/infrastructure/persistence/ragMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';

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
export async function loadUnifiedMemory(limit = 120): Promise<UnifiedMemoryItem[]> {
  const [core, global, rag] = await Promise.all([
    loadMemories(limit).catch(() => [] as CoreMemoryEntry[]),
    loadGlobalMemories(AXE_USER_ID, undefined, limit).catch(() => [] as GlobalMemoryEntry[]),
    loadRagMemories(undefined, 1, limit).catch(() => [] as RagMemory[]),
  ]);

  const items: UnifiedMemoryItem[] = [];

  for (const m of core) {
    items.push({
      id: `core:${m.id}`,
      content: m.content,
      layer: 'core',
      tags: m.tags || [],
      importance: m.importance ?? 5,
      source: m.source || 'core',
      created_at: m.created_at,
    });
  }

  for (const g of global) {
    let content = String(g.value ?? '');
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        if (typeof (parsed as { summary?: string }).summary === 'string') {
          content = (parsed as { summary: string }).summary;
        } else if (typeof (parsed as { q?: string }).q === 'string') {
          const q = (parsed as { q: string }).q;
          const a = (parsed as { a?: string }).a;
          content = a ? `Chat: ${q.slice(0, 120)} → ${(a || '').slice(0, 120)}` : q.slice(0, 200);
        } else {
          content = JSON.stringify(parsed).slice(0, 240);
        }
      }
    } catch {
      /* keep string */
    }
    items.push({
      id: `global:${g.id || g.key}`,
      content: content || g.key,
      layer: 'global',
      tags: [g.category, g.key].filter(Boolean) as string[],
      importance: Math.round((g.confidence ?? 0.5) * 10),
      source: g.category,
      created_at: g.updated_at || g.created_at || new Date().toISOString(),
      rawKey: g.key,
    });
  }

  for (const r of rag) {
    items.push({
      id: `rag:${r.id || hash(r.content)}`,
      content: r.content,
      layer: 'rag',
      tags: [r.category, 'rag'],
      importance: r.importance ?? 5,
      source: r.category,
      created_at: r.created_at || new Date().toISOString(),
    });
  }

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

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
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
