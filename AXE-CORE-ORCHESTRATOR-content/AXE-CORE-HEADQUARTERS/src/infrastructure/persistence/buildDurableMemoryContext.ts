/**
 * buildDurableMemoryContext.ts
 * ------------------------------------------------------------------
 * AXE CORE durable brain context builder.
 *
 * One call replaces ad-hoc keyword dumps. Combines:
 *  1. Global memory (preferences, performance, reflections)
 *  2. RAG facts (user / system / conversation)
 *  3. Obsidian notes + GraphRAG expansion via [[wikilinks]]
 *
 * Designed for local-first: works with Supabase or localStorage fallbacks.
 * Optional Ollama embeddings can be layered later without changing callers.
 */

import {
  loadGlobalMemories,
  type GlobalMemoryEntry,
} from '@/infrastructure/persistence/globalMemoryService';
import {
  loadRagMemories,
  searchRagMemories,
  type RagMemory,
} from '@/infrastructure/persistence/ragMemoryService';
import {
  searchObsidianNotes,
  listRecentObsidianNotes,
  getObsidianNoteByPath,
  type ObsidianNote,
} from '@/infrastructure/persistence/obsidianMemoryService';

export interface DurableMemoryOptions {
  maxChars?: number;
  includeGraphNeighbors?: boolean;
  maxNotes?: number;
  maxRag?: number;
  maxGlobal?: number;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
}

function scoreText(text: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  const hay = text.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 1;
    // light phrase bonus for multi-word queries handled by caller
  }
  return score;
}

async function expandGraphNeighbors(
  seedNotes: ObsidianNote[],
  limit = 6,
): Promise<ObsidianNote[]> {
  const seen = new Set(seedNotes.map((n) => n.path));
  const out: ObsidianNote[] = [];

  for (const note of seedNotes) {
    const links = note.wikilinks || [];
    for (const link of links) {
      if (out.length >= limit) return out;
      const clean = link.split('|')[0].trim();
      if (!clean) continue;

      // Try path-style and title-style resolution
      const candidates = [
        clean.endsWith('.md') ? clean : `${clean}.md`,
        `AXE/${clean}.md`,
        `AXE/Projects/${clean}.md`,
        `AXE/Reflections/${clean}.md`,
      ];

      for (const path of candidates) {
        if (seen.has(path)) continue;
        try {
          const n = await getObsidianNoteByPath(path);
          if (n) {
            seen.add(n.path);
            out.push(n);
            break;
          }
        } catch {
          /* continue */
        }
      }

      // Fallback: title search
      if (out.length < limit) {
        try {
          const found = await searchObsidianNotes(clean, 2);
          for (const n of found) {
            if (seen.has(n.path)) continue;
            seen.add(n.path);
            out.push(n);
            if (out.length >= limit) break;
          }
        } catch {
          /* */
        }
      }
    }
  }

  return out;
}

function formatGlobal(entries: GlobalMemoryEntry[], budget: number): string {
  if (!entries.length) return '';
  const lines = entries.map((m) => {
    const val = typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
    return `- [${m.category}] ${m.key}: ${val.slice(0, 220)}`;
  });
  return `## Global Memory\n${lines.join('\n')}`.slice(0, budget);
}

function formatRag(mems: RagMemory[], budget: number): string {
  if (!mems.length) return '';
  const lines = mems.map(
    (m) => `- [${m.category.toUpperCase()} · i${m.importance}] ${m.content.slice(0, 240)}`,
  );
  return `## RAG Facts\n${lines.join('\n')}`.slice(0, budget);
}

function formatNotes(
  notes: ObsidianNote[],
  neighbors: ObsidianNote[],
  budget: number,
): string {
  if (!notes.length && !neighbors.length) return '';
  const blocks: string[] = [];

  for (const n of notes) {
    const tags = (n.tags || []).length ? ` #${(n.tags || []).join(' #')}` : '';
    const links = (n.wikilinks || []).length
      ? `\nlinks: ${(n.wikilinks || []).slice(0, 8).join(', ')}`
      : '';
    blocks.push(
      `### ${n.title}${tags}\npath: ${n.path}${links}\n${(n.content || '').slice(0, 420)}`,
    );
  }

  if (neighbors.length) {
    blocks.push('### Graph neighbors (linked notes)');
    for (const n of neighbors) {
      blocks.push(
        `🔗 ${n.title} (${n.path})\n${(n.content || '').slice(0, 280)}`,
      );
    }
  }

  return `## Obsidian GraphRAG\n${blocks.join('\n\n')}`.slice(0, budget);
}

/**
 * Primary entry: build rich durable context for any chat / agent turn.
 */
export async function buildDurableMemoryContext(
  userId: string,
  query: string,
  maxChars = 3200,
  options: DurableMemoryOptions = {},
): Promise<string> {
  const {
    includeGraphNeighbors = true,
    maxNotes = 8,
    maxRag = 10,
    maxGlobal = 16,
  } = options;

  const globalBudget = Math.floor(maxChars * 0.28);
  const ragBudget = Math.floor(maxChars * 0.28);
  const notesBudget = maxChars - globalBudget - ragBudget;

  const tokens = tokenize(query);

  // Parallel fetch
  const [globals, ragRelevant, ragCore, notes] = await Promise.all([
    loadGlobalMemories(userId, undefined, 120).catch(() => [] as GlobalMemoryEntry[]),
    searchRagMemories(query, maxRag).catch(() => [] as RagMemory[]),
    loadRagMemories(undefined, 7, 40).catch(() => [] as RagMemory[]),
    (query.trim().length >= 2
      ? searchObsidianNotes(query.trim(), maxNotes)
      : listRecentObsidianNotes(maxNotes)
    ).catch(() => [] as ObsidianNote[]),
  ]);

  // Score + rank global
  const rankedGlobal = globals
    .map((m) => ({
      m,
      score:
        scoreText(`${m.key} ${m.value}`, tokens) +
        (m.confidence || 0) * 2 +
        (m.category === 'user_preference' ? 1.5 : 0),
    }))
    .filter((x) => x.score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxGlobal)
    .map((x) => x.m);

  // Merge RAG relevant + high-importance core
  const ragSeen = new Set<string>();
  const mergedRag: RagMemory[] = [];
  for (const m of [...ragRelevant, ...ragCore]) {
    const key = m.content.slice(0, 80);
    if (ragSeen.has(key)) continue;
    ragSeen.add(key);
    mergedRag.push(m);
  }
  mergedRag.sort((a, b) => b.importance - a.importance);
  const topRag = mergedRag.slice(0, maxRag);

  // Graph expansion from seed notes
  let neighbors: ObsidianNote[] = [];
  if (includeGraphNeighbors && notes.length > 0) {
    neighbors = await expandGraphNeighbors(notes, 6);
  }

  const parts = [
    formatGlobal(rankedGlobal, globalBudget),
    formatRag(topRag, ragBudget),
    formatNotes(notes, neighbors, notesBudget),
  ].filter(Boolean);

  if (!parts.length) return '';

  const header =
    `## AXE Durable Brain\n` +
    `(global=${rankedGlobal.length}, rag=${topRag.length}, notes=${notes.length}, graph=${neighbors.length})\n\n`;

  return (header + parts.join('\n\n')).slice(0, maxChars);
}

/** Lightweight stats for UI growth indicators */
export async function getDurableMemorySnapshot(userId: string): Promise<{
  globalCount: number;
  ragCount: number;
  noteCount: number;
  total: number;
}> {
  const [globals, rag, notes] = await Promise.all([
    loadGlobalMemories(userId, undefined, 500).catch(() => []),
    loadRagMemories(undefined, 1, 500).catch(() => []),
    listRecentObsidianNotes(200).catch(() => []),
  ]);
  const globalCount = globals.length;
  const ragCount = rag.length;
  const noteCount = notes.length;
  return {
    globalCount,
    ragCount,
    noteCount,
    total: globalCount + ragCount + noteCount,
  };
}
