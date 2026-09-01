/**
 * globalBrainService — ONE structured memory layer for AXE.
 *
 * Obsidian notes, RAG facts, and (via callers) agent memory all land in
 * the same semantic index. The Obsidian tab stays a markdown editor;
 * search / agents / Neural brain all query this unified layer.
 */

import { noteRetrieval } from '@/infrastructure/persistence/memoryFeedbackService';
import {
  saveRagMemory,
  searchRagMemories,
  loadRagMemories,
  type RagMemory,
} from '@/infrastructure/persistence/ragMemoryService';
import {
  listRecentObsidianNotes,
  type ObsidianNote,
} from '@/infrastructure/persistence/obsidianMemoryService';
import { embedText, cosineSimilarity, embedTextSync } from '@/infrastructure/persistence/embeddingService';

const LS_SYNC_AT = 'axe_global_brain_obsidian_sync_at';

/** Index a single Obsidian note into the shared vector RAG store. */
export async function indexNoteIntoBrain(note: ObsidianNote): Promise<void> {
  const path = note.path;
  const title = note.title || path;
  const body = (note.content || '').replace(/\s+/g, ' ').trim().slice(0, 1800);
  const tags = (note.tags || []).join(', ');
  const content =
    `[obsidian:${path}] ${title}` +
    (tags ? ` · ${tags}` : '') +
    `\n${body}`;

  // Remove previous local mirror for this path (avoid duplicates)
  purgeLocalRagByObsidianPath(path);

  await saveRagMemory({
    category: 'system',
    content,
    importance: 6,
    metadata: {
      source: 'obsidian',
      path,
      title,
      tags: note.tags || [],
      wikilinks: note.wikilinks || [],
      note_source: note.source,
    },
  });
}

/** Bulk-sync recent Obsidian notes into the global brain (idempotent-ish). */
export async function syncObsidianIntoGlobalBrain(limit = 80): Promise<number> {
  const notes = await listRecentObsidianNotes(limit);
  let n = 0;
  for (const note of notes) {
    try {
      await indexNoteIntoBrain(note);
      n += 1;
    } catch (err) {
      console.warn('[globalBrain] index note failed', note.path, err);
    }
  }
  try {
    localStorage.setItem(LS_SYNC_AT, new Date().toISOString());
  } catch {
    /* */
  }
  return n;
}

/** Run sync at most once per hour unless force. */
export async function ensureObsidianBrainSync(force = false): Promise<number> {
  if (!force) {
    try {
      const at = localStorage.getItem(LS_SYNC_AT);
      if (at) {
        const age = Date.now() - new Date(at).getTime();
        if (age < 60 * 60 * 1000) return 0;
      }
    } catch {
      /* */
    }
  }
  return syncObsidianIntoGlobalBrain(80);
}

export interface BrainHit {
  kind: 'rag' | 'obsidian' | 'fact';
  /** rag_memories id, so a hit can later be reinforced. */
  id?: string;
  content: string;
  score: number;
  path?: string;
  title?: string;
  importance?: number;
  category?: string;
}

/**
 * Unified semantic search across the global brain (RAG + indexed notes).
 * Prefer this over calling searchRag / searchObsidian separately.
 */
export async function searchGlobalBrain(
  query: string,
  limit = 12,
): Promise<BrainHit[]> {
  const rag = await searchRagMemories(query, Math.max(limit, 16));
  // Which memories answered which question. This is the observation the
  // decay pass has always wanted -- see memoryFeedbackService for why it did
  // not exist and what it is allowed to conclude from it.
  noteRetrieval(query, rag.map(m => m.id));
  const hits: BrainHit[] = rag.map((m) => {
    const meta = (m.metadata || {}) as Record<string, unknown>;
    const isObsidian = meta.source === 'obsidian' || String(m.content).startsWith('[obsidian:');
    const path = typeof meta.path === 'string' ? meta.path : undefined;
    const title = typeof meta.title === 'string' ? meta.title : undefined;
    return {
      kind: isObsidian ? 'obsidian' : 'rag',
      id: m.id,
      content: m.content,
      score: 1,
      path,
      title,
      importance: m.importance,
      category: m.category,
    };
  });

  // Re-rank with fresh query embed for stable ordering
  const qVec = await embedText(query);
  const ranked = hits.map((h) => {
    const vec = embedTextSync(h.content);
    return { ...h, score: cosineSimilarity(qVec, vec) + (h.importance || 0) * 0.01 };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

/** Context block for agents / chat — single brain, structured. */
export async function buildGlobalBrainContext(
  query: string,
  maxChars = 2800,
): Promise<string> {
  await ensureObsidianBrainSync(false);
  const hits = await searchGlobalBrain(query, 14);
  if (!hits.length) {
    // still surface high-importance facts
    const core = await loadRagMemories(undefined, 7, 12);
    if (!core.length) return '';
    const lines = core.map((m) => `- [${m.category}] ${m.content.slice(0, 220)}`);
    return `## AXE Global Brain\n${lines.join('\n')}`.slice(0, maxChars);
  }

  const lines: string[] = ['## AXE Global Brain', ''];
  for (const h of hits) {
    const tag =
      h.kind === 'obsidian'
        ? `NOTE${h.path ? ` · ${h.path}` : ''}`
        : `FACT · ${(h.category || 'rag').toUpperCase()}`;
    const body = h.content.replace(/^\[obsidian:[^\]]+\]\s*/, '').slice(0, 280);
    lines.push(`- [${tag}] ${body}`);
  }
  return lines.join('\n').slice(0, maxChars);
}

function purgeLocalRagByObsidianPath(path: string): void {
  try {
    const key = 'axe_rag_memory';
    const all: RagMemory[] = JSON.parse(localStorage.getItem(key) || '[]');
    const next = all.filter((m) => {
      const meta = (m.metadata || {}) as Record<string, unknown>;
      if (meta.source === 'obsidian' && meta.path === path) return false;
      if (String(m.content).startsWith(`[obsidian:${path}]`)) return false;
      return true;
    });
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* */
  }
}
