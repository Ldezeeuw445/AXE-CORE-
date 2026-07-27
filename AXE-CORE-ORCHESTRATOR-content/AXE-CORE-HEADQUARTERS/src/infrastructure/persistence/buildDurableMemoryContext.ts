/**
 * Combines global_memory RAG + Obsidian durable notes into one context block
 * injected into the system prompt on every message.
 */
import { buildGlobalMemoryContext } from '@/infrastructure/persistence/globalMemoryService';
import {
  searchObsidianNotes,
  listRecentObsidianNotes,
  formatNotesForContext,
} from '@/infrastructure/persistence/obsidianMemoryService';

export async function buildDurableMemoryContext(
  userId: string,
  query: string,
  maxChars = 2800,
): Promise<string> {
  const [globalCtx, notes] = await Promise.all([
    buildGlobalMemoryContext(userId, query, Math.floor(maxChars * 0.55)).catch(() => ''),
    (query.trim().length >= 3
      ? searchObsidianNotes(query.trim(), 8)
      : listRecentObsidianNotes(8)
    ).catch(() => []),
  ]);

  const obsidianCtx = formatNotesForContext(notes, Math.floor(maxChars * 0.45));
  const parts = [globalCtx, obsidianCtx].filter(Boolean);
  if (!parts.length) return '';
  return parts.join('\n\n').slice(0, maxChars);
}
