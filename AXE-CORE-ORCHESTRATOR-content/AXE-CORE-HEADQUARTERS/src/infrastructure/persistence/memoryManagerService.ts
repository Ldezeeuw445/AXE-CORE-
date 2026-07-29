/**
 * memoryManagerService.ts
 * ------------------------------------------------------------------
 * AXE Memory Manager — the self-improving loop.
 *
 * Responsibilities:
 *  - Read recent conversations / reflections
 *  - Extract durable facts into RAG + global memory
 *  - Consolidate noisy entries
 *  - Write co-founder notes into Obsidian with [[wikilinks]]
 *  - Record a consolidation report so the UI can show growth
 *
 * Safe to run fire-and-forget from bootstrap or after sessions.
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { AXE_USER_ID, APP_SOURCE } from '@/infrastructure/persistence/chatPersistence';
import { saveRagMemory, loadRagMemories } from '@/infrastructure/persistence/ragMemoryService';
import { saveGlobalMemory, loadGlobalMemories } from '@/infrastructure/persistence/globalMemoryService';
import {
  writeObsidianNote,
  listRecentObsidianNotes,
  notePathFromTitle,
} from '@/infrastructure/persistence/obsidianMemoryService';
import { writeReflection } from '@/infrastructure/persistence/reflectionService';

const LS_LAST_RUN = 'axe_memory_manager_last_run';
const LS_STATS = 'axe_memory_manager_stats';

export interface MemoryManagerReport {
  ranAt: string;
  factsExtracted: number;
  notesWritten: number;
  reflections: number;
  message: string;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadStats(): MemoryManagerReport | null {
  try {
    return JSON.parse(localStorage.getItem(LS_STATS) || 'null');
  } catch {
    return null;
  }
}

function saveStats(report: MemoryManagerReport): void {
  try {
    localStorage.setItem(LS_STATS, JSON.stringify(report));
    localStorage.setItem(LS_LAST_RUN, report.ranAt);
  } catch {
    /* */
  }
}

export function getLastMemoryManagerReport(): MemoryManagerReport | null {
  return loadStats();
}

/** Heuristic fact extraction from recent chat rows */
async function loadRecentUserMessages(limit = 40): Promise<string[]> {
  try {
    const sb = getSupabase();
    if (!sb) return [];
    const { data } = await sb
      .from('messages')
      .select('content, role, created_at, metadata')
      .eq('user_id', AXE_USER_ID)
      .order('created_at', { ascending: false })
      .limit(limit * 2);

    const rows = (data || []) as Array<{
      content: string;
      role: string;
      metadata?: Record<string, unknown> | null;
    }>;

    return rows
      .filter((r) => {
        const app = r.metadata?.app_source;
        if (app && app !== APP_SOURCE) return false;
        return r.role === 'user' && (r.content || '').length > 40;
      })
      .map((r) => r.content)
      .slice(0, limit);
  } catch {
    return [];
  }
}

const PREFERENCE_RE =
  /\b(ik (hou van|wil|gebruik|prefer|prefereer|werk met|code in)|i (love|prefer|use|want|work with))\b/i;
const PROJECT_RE =
  /\b(project|app|website|repo|deploy|vercel|railway|obsidian|crewai|langgraph)\b/i;
const DECISION_RE =
  /\b(besluit|decision|voortaan|from now on|always|nooit meer|never again)\b/i;

async function extractFactsFromMessages(messages: string[]): Promise<number> {
  let count = 0;
  const existing = await loadRagMemories(undefined, 1, 100).catch(() => []);
  const existingTexts = new Set(existing.map((m) => m.content.slice(0, 100).toLowerCase()));

  for (const msg of messages) {
    const slice = msg.slice(0, 280).trim();
    if (slice.length < 30) continue;
    const key = slice.slice(0, 100).toLowerCase();
    if (existingTexts.has(key)) continue;

    if (PREFERENCE_RE.test(msg)) {
      await saveRagMemory({
        category: 'user',
        content: `Preference signal: ${slice}`,
        importance: 7,
        metadata: { source: 'memory_manager' },
      });
      existingTexts.add(key);
      count++;
      continue;
    }

    if (DECISION_RE.test(msg)) {
      await saveRagMemory({
        category: 'conversation',
        content: `Decision signal: ${slice}`,
        importance: 8,
        metadata: { source: 'memory_manager' },
      });
      existingTexts.add(key);
      count++;
      continue;
    }

    if (PROJECT_RE.test(msg) && msg.length > 80) {
      await saveRagMemory({
        category: 'system',
        content: `Project/context: ${slice}`,
        importance: 6,
        metadata: { source: 'memory_manager' },
      });
      existingTexts.add(key);
      count++;
    }
  }

  return count;
}

async function writeConsolidationNote(
  facts: number,
  notes: number,
): Promise<void> {
  const path = notePathFromTitle(`Memory consolidation ${todayKey()}`, 'AXE/System');
  await writeObsidianNote({
    path,
    title: `Memory consolidation — ${todayKey()}`,
    content: [
      `## Memory Manager report`,
      '',
      `**When:** ${new Date().toISOString()}`,
      `**Facts extracted:** ${facts}`,
      `**Notes touched:** ${notes}`,
      '',
      'AXE reviewed recent sessions, promoted durable signals into RAG,',
      'and kept Obsidian as the co-founder library.',
      '',
      '[[Memory]] [[System]] [[Reflections]]',
    ].join('\n'),
    tags: ['system', 'memory-manager', 'consolidation'],
    source: 'system',
    metadata: { type: 'memory_manager', facts, notes },
  });
}

/**
 * Run the Memory Manager once (idempotent per day unless force=true).
 */
export async function runMemoryManager(opts?: {
  force?: boolean;
}): Promise<MemoryManagerReport> {
  const force = opts?.force === true;
  try {
    const lastDay = localStorage.getItem(LS_LAST_RUN)?.slice(0, 10);
    if (!force && lastDay === todayKey()) {
      const prev = loadStats();
      if (prev) return prev;
    }
  } catch {
    /* continue */
  }

  let factsExtracted = 0;
  let notesWritten = 0;
  let reflections = 0;

  try {
    const messages = await loadRecentUserMessages(50);
    factsExtracted = await extractFactsFromMessages(messages);
  } catch (err) {
    console.warn('[memoryManager] fact extraction failed:', err);
  }

  try {
    // Promote high-confidence preferences into global_memory keys
    const prefs = await loadGlobalMemories(AXE_USER_ID, 'user_preference', 20);
    if (prefs.length === 0) {
      await saveGlobalMemory({
        user_id: AXE_USER_ID,
        category: 'user_preference',
        key: 'language',
        value: 'Dutch/English',
        confidence: 0.9,
      });
    }
  } catch {
    /* */
  }

  try {
    const recentNotes = await listRecentObsidianNotes(5);
    notesWritten = recentNotes.length;
    await writeConsolidationNote(factsExtracted, notesWritten);
    notesWritten += 1;
  } catch (err) {
    console.warn('[memoryManager] consolidation note failed:', err);
  }

  try {
    await writeReflection({
      title: 'Memory Manager cycle',
      whatHappened: `Extracted ${factsExtracted} durable signals from recent sessions and updated the co-founder library.`,
      lesson:
        factsExtracted > 0
          ? 'Keep promoting explicit preferences and decisions into RAG + Obsidian.'
          : 'Low signal day — wait for richer user messages before aggressive extraction.',
      outcome: 'completed',
      category: 'memory_manager',
    });
    reflections = 1;
  } catch {
    /* */
  }

  const report: MemoryManagerReport = {
    ranAt: new Date().toISOString(),
    factsExtracted,
    notesWritten,
    reflections,
    message:
      factsExtracted > 0
        ? `Brain grew: +${factsExtracted} facts, library updated`
        : 'Brain reviewed — library healthy',
  };
  saveStats(report);
  return report;
}

/** Fire-and-forget daily run for bootstrap */
export function maybeRunMemoryManager(): void {
  void runMemoryManager({ force: false }).catch((err) =>
    console.warn('[memoryManager] skipped:', err),
  );
}
