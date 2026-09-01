/**
 * memoryStatsService.ts
 * ------------------------------------------------------------------
 * Live memory library size for Home growth badge + Memory tab.
 * Also records a lightweight growth history so the UI can show the brain growing over time.
 */

import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { getDurableMemorySnapshot } from '@/infrastructure/persistence/buildDurableMemoryContext';
import { getLastMemoryManagerReport } from '@/infrastructure/persistence/memoryManagerService';
import { loadHubCounts } from '@/infrastructure/persistence/memoryHubCountsService';

const LS_HISTORY = 'axe_memory_growth_history';
const MAX_HISTORY = 48; // ~ last 48 samples (poll every 30–45s while open)

export interface MemoryGrowthStats {
  total: number;
  globalCount: number;
  ragCount: number;
  noteCount: number;
  lastManagerMessage?: string;
  lastManagerAt?: string;
  factsLastRun?: number;
  /** Recent total samples for sparkline (oldest → newest) */
  history: number[];
  /** Delta vs previous sample (can be 0) */
  delta: number;
}

export interface GrowthHistoryPoint {
  t: number;
  total: number;
  notes: number;
  rag: number;
  global: number;
}

function loadHistory(): GrowthHistoryPoint[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
    return Array.isArray(raw) ? raw.slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function pushHistory(point: GrowthHistoryPoint): GrowthHistoryPoint[] {
  const prev = loadHistory();
  const last = prev[prev.length - 1];
  // Only append when total changed or > 2 min since last sample
  if (
    last &&
    last.total === point.total &&
    point.t - last.t < 120_000
  ) {
    return prev;
  }
  const next = [...prev, point].slice(-MAX_HISTORY);
  try {
    localStorage.setItem(LS_HISTORY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function getMemoryGrowthHistory(): GrowthHistoryPoint[] {
  return loadHistory();
}

export async function loadMemoryGrowthStats(): Promise<MemoryGrowthStats> {
  const snap = await getDurableMemorySnapshot(AXE_USER_ID);
  const report = getLastMemoryManagerReport();

  // Also surface localStorage caches so offline still shows growth
  let localGlobal = 0;
  let localRag = 0;
  let localNotes = 0;
  try {
    localGlobal = JSON.parse(localStorage.getItem('axe_global_memory_cache') || '[]').length;
  } catch { /* */ }
  try {
    localRag = JSON.parse(localStorage.getItem('axe_rag_memory') || '[]').length;
  } catch { /* */ }
  try {
    localNotes = JSON.parse(localStorage.getItem('axe_obsidian_local_cache') || '[]').length;
  } catch { /* */ }

  // The durable snapshot and the local caches are both capped page fetches --
  // 500 rows, 80 rows -- so "nodes in the library" reported the sample size as
  // the library: 1,057 against a real 15,560 + 7,889 + 57. The database knows
  // the answer, so ask it, and keep the capped numbers only as the floor for
  // when the count cannot be reached.
  const counted = await loadHubCounts().catch(() => null);
  const globalCount = Math.max(snap.globalCount, localGlobal, counted?.globalTotal ?? 0);
  const ragCount = Math.max(snap.ragCount, localRag, counted?.ragTotal ?? 0);
  const noteCount = Math.max(snap.noteCount, localNotes);
  const total = globalCount + ragCount + noteCount;

  const historyPoints = pushHistory({
    t: Date.now(),
    total,
    notes: noteCount,
    rag: ragCount,
    global: globalCount,
  });
  const history = historyPoints.map((p) => p.total);
  const prevTotal =
    historyPoints.length >= 2
      ? historyPoints[historyPoints.length - 2].total
      : total;
  const delta = total - prevTotal;

  return {
    total,
    globalCount,
    ragCount,
    noteCount,
    lastManagerMessage: report?.message,
    lastManagerAt: report?.ranAt,
    factsLastRun: report?.factsExtracted,
    history,
    delta,
  };
}
