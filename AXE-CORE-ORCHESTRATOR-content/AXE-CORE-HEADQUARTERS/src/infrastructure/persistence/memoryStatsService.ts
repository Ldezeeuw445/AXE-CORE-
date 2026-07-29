/**
 * memoryStatsService.ts
 * ------------------------------------------------------------------
 * Live memory library size for Home growth badge + Memory tab.
 */

import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { getDurableMemorySnapshot } from '@/infrastructure/persistence/buildDurableMemoryContext';
import { getLastMemoryManagerReport } from '@/infrastructure/persistence/memoryManagerService';

export interface MemoryGrowthStats {
  total: number;
  globalCount: number;
  ragCount: number;
  noteCount: number;
  lastManagerMessage?: string;
  lastManagerAt?: string;
  factsLastRun?: number;
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

  const globalCount = Math.max(snap.globalCount, localGlobal);
  const ragCount = Math.max(snap.ragCount, localRag);
  const noteCount = Math.max(snap.noteCount, localNotes);

  return {
    total: globalCount + ragCount + noteCount,
    globalCount,
    ragCount,
    noteCount,
    lastManagerMessage: report?.message,
    lastManagerAt: report?.ranAt,
    factsLastRun: report?.factsExtracted,
  };
}
