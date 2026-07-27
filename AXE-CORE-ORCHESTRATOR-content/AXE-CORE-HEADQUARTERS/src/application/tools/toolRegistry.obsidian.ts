/**
 * Obsidian + reflection tool runtimes — side module to keep toolRegistry.ts readable.
 * Does NOT import from toolRegistry.ts (avoids circular dependency).
 */
import { TOOL_CATALOG, type ToolCatalogEntry } from '@/domain/tools/toolCatalog';
import {
  writeObsidianNote,
  searchObsidianNotes,
  formatNotesForContext,
} from '@/infrastructure/persistence/obsidianMemoryService';
import { writeReflection } from '@/infrastructure/persistence/reflectionService';
import { isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';

/** Local mirror of ToolRuntime so we don't import the main registry. */
export interface ObsidianToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: { requestApproval: (kind: string, title: string, detail: string) => Promise<boolean> }) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.obsidian: no catalog entry for '${id}'`);
  return entry;
}

export const OBSIDIAN_TOOL_RUNTIMES: ObsidianToolRuntime[] = [
  {
    ...catalogEntry('obsidian_write'),
    available: () => true,
    run: async (raw) => {
      let title = '';
      let content = '';
      let path: string | undefined;
      let tags: string[] | undefined;
      try {
        const parsed = JSON.parse(raw) as {
          title?: unknown;
          content?: unknown;
          path?: unknown;
          tags?: unknown;
        };
        if (typeof parsed.title === 'string') title = parsed.title.trim();
        if (typeof parsed.content === 'string') content = parsed.content;
        if (typeof parsed.path === 'string' && parsed.path.trim()) path = parsed.path.trim();
        if (Array.isArray(parsed.tags)) tags = parsed.tags.filter((t): t is string => typeof t === 'string');
      } catch {
        return 'OBSIDIAN_WRITE failed: malformed JSON — need {"title","content"} (path/tags optional).';
      }
      if (!title || !content) {
        return 'OBSIDIAN_WRITE failed: both "title" and "content" are required.';
      }
      const result = await writeObsidianNote({ title, content, path, tags, source: 'axe' });
      return `OBSIDIAN_WRITE saved -> ${result.path}${isAxeApiConfigured ? '' : ' (local cache fallback — run migration + axe_api for durable Supabase store)'}`;
    },
    onError: (msg) => `OBSIDIAN_WRITE failed: ${msg}`,
  },
  {
    ...catalogEntry('obsidian_search'),
    available: () => true,
    run: async (raw) => {
      const query = raw.trim();
      if (query.length < 2) return 'OBSIDIAN_SEARCH failed: query too short.';
      const notes = await searchObsidianNotes(query, 12);
      if (!notes.length) return `OBSIDIAN_SEARCH "${query}": no notes found.`;
      return `OBSIDIAN_SEARCH "${query}" (${notes.length}):\n${formatNotesForContext(notes, 3500)}`;
    },
    onError: (msg) => `OBSIDIAN_SEARCH failed: ${msg}`,
  },
  {
    ...catalogEntry('reflect'),
    available: () => true,
    run: async (raw) => {
      let title = '';
      let whatHappened = '';
      let correction: string | undefined;
      let lesson: string | undefined;
      let outcome: 'approved' | 'denied' | 'auto_run' | 'completed' | 'failed' = 'completed';
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.title === 'string') title = parsed.title.trim();
        if (typeof parsed.whatHappened === 'string') whatHappened = parsed.whatHappened.trim();
        if (typeof parsed.correction === 'string') correction = parsed.correction.trim();
        if (typeof parsed.lesson === 'string') lesson = parsed.lesson.trim();
        if (
          typeof parsed.outcome === 'string' &&
          ['approved', 'denied', 'auto_run', 'completed', 'failed'].includes(parsed.outcome)
        ) {
          outcome = parsed.outcome as typeof outcome;
        }
      } catch {
        return 'REFLECT failed: malformed JSON — need {"title","whatHappened"}.';
      }
      if (!title || !whatHappened) return 'REFLECT failed: "title" and "whatHappened" required.';
      await writeReflection({ title, whatHappened, correction, lesson, outcome });
      return `REFLECT stored -> "${title}" (${outcome}) in Obsidian + global memory.`;
    },
    onError: (msg) => `REFLECT failed: ${msg}`,
  },
];
