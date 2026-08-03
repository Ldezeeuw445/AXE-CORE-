/**
 * buildDurableMemoryContext.ts
 * ------------------------------------------------------------------
 * AXE CORE durable brain context builder — ONE global brain.
 *
 * Combines global memory + unified vector layer (RAG facts + Obsidian
 * notes indexed into the same store) + optional GraphRAG neighbors.
 */

import {
  loadGlobalMemories,
  type GlobalMemoryEntry,
} from '@/infrastructure/persistence/globalMemoryService';
import {
  loadRagMemories,
  type RagMemory,
} from '@/infrastructure/persistence/ragMemoryService';
import {
  listRecentObsidianNotes,
  getObsidianNoteByPath,
  searchObsidianNotes,
  type ObsidianNote,
} from '@/infrastructure/persistence/obsidianMemoryService';
import {
  ensureObsidianBrainSync,
  searchGlobalBrain,
  type BrainHit,
} from '@/infrastructure/persistence/globalBrainService';

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
  return `### Structured keys\n${lines.join('\n')}`.slice(0, budget);
}

function formatBrainHits(hits: BrainHit[], budget: number): string {
  if (!hits.length) return '';
  const lines = hits.map((h) => {
    const tag =
      h.kind === 'obsidian'
        ? `NOTE${h.path ? ` · ${h.path}` : ''}`
        : `FACT · ${(h.category || 'rag').toUpperCase()}`;
    const body = h.content.replace(/^\[obsidian:[^\]]+\]\s*/, '').slice(0, 240);
    return `- [${tag}] ${body}`;
  });
  return `### Semantic memory (RAG + notes)\n${lines.join('\n')}`.slice(0, budget);
}

function formatNeighbors(neighbors: ObsidianNote[], budget: number): string {
  if (!neighbors.length) return '';
  const blocks = neighbors.map(
    (n) => `🔗 ${n.title} (${n.path})\n${(n.content || '').slice(0, 220)}`,
  );
  return `### Graph neighbors\n${blocks.join('\n\n')}`.slice(0, budget);
}

/**
 * Primary entry: build rich durable context for any chat / agent turn.
 * Single global brain — notes are in the same semantic layer as facts.
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
    maxRag = 12,
    maxGlobal = 16,
  } = options;

  const globalBudget = Math.floor(maxChars * 0.25);
  const brainBudget = Math.floor(maxChars * 0.55);
  const graphBudget = maxChars - globalBudget - brainBudget;

  const tokens = tokenize(query);

  // Ensure notes are present in vector layer (throttled)
  await ensureObsidianBrainSync(false).catch(() => 0);

  const [globals, brainHits, seedNotes] = await Promise.all([
    loadGlobalMemories(userId, undefined, 120).catch(() => [] as GlobalMemoryEntry[]),
    searchGlobalBrain(query, maxRag + maxNotes).catch(() => [] as BrainHit[]),
    (query.trim().length >= 2
      ? searchObsidianNotes(query.trim(), Math.min(maxNotes, 6))
      : listRecentObsidianNotes(Math.min(maxNotes, 4))
    ).catch(() => [] as ObsidianNote[]),
  ]);

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

  let neighbors: ObsidianNote[] = [];
  if (includeGraphNeighbors && seedNotes.length > 0) {
    neighbors = await expandGraphNeighbors(seedNotes, 6);
  }

  const parts = [
    formatGlobal(rankedGlobal, globalBudget),
    formatBrainHits(brainHits, brainBudget),
    formatNeighbors(neighbors, graphBudget),
  ].filter(Boolean);

  if (!parts.length) return '';

  const noteHits = brainHits.filter((h) => h.kind === 'obsidian').length;
  const factHits = brainHits.length - noteHits;

  const header =
    `## AXE Global Brain\n` +
    `(keys=${rankedGlobal.length}, semantic=${brainHits.length} [facts=${factHits} notes=${noteHits}], graph=${neighbors.length})\n\n`;

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
