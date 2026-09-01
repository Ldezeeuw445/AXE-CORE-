/**
 * memoryHubCountsService — how big each memory hub REALLY is.
 *
 * The 3D views had a quiet honesty problem. Both of them build their peaks
 * from the rows they happened to fetch: 500 from global_memory, 80 from
 * rag_memories, 50 notes. Peak height then read as "memory volume", and the
 * header said "1,057 nodes in the library".
 *
 * The library holds 15,560 + 7,889 + 57. So 1,057 was the sample size, drawn
 * as if it were the whole, and a mountain's height told you how much of a
 * topic happened to be in the last 500 rows.
 *
 * That mattered more than it looks, because the sample is not neutral: it is
 * the most RECENT 500, and the trading agent writes almost continuously. So
 * the sample skews to whatever wrote last, and the terrain became a picture of
 * the last hour rather than of the memory.
 *
 * These are counted in the database, so height means what it claims to. The
 * row samples are still what fills the leaf lists -- you cannot draw 15,000
 * labels -- but the size of a thing and a sample of its contents are now two
 * separate claims instead of one number pretending to be both.
 */
import { sbRunSql } from '@/infrastructure/gateways/axeCoreApiService';
import type { HubId } from '@/domain/memory/memoryHubs';
import {
  GLOBAL_HUB_CASE, AGENT_HUB_CASE, NOTE_HUB_CASE,
} from '@/domain/memory/hubClassifier';

export interface HubCounts {
  /** Real row count per hub. Missing hub = 0. */
  byHub: Partial<Record<HubId, number>>;
  /** Every memory row counted, across all tables. */
  total: number;
  /** Raw table totals, for callers that report per store rather than per hub. */
  globalTotal: number;
  ragTotal: number;
  noteTotal: number;
  /** The `memory` table -- the three agents' own store. */
  agentStoreTotal: number;
  /** False when the count failed and callers should not present it as truth. */
  ok: boolean;
  error?: string;
}

/**
 * Mirrors the hub mapping in useGlobalMemoryStats and NeuralMemorySystem.
 * All three must agree; if you change one, change all three.
 *
 * `ta:` is tested before category on purpose: the trading agent stores every
 * row as system_event, so category-first put its whole brain (94.6% of the
 * table) on the Events peak.
 */
const GLOBAL_HUB_SQL =
  `SELECT ${GLOBAL_HUB_CASE} AS hub, count(*) AS n FROM global_memory GROUP BY 1`;

/** rag_memories is the Knowledge hub in its entirety. */
const RAG_SQL = `SELECT count(*) AS n FROM rag_memories`;

/**
 * The `memory` table -- 11,680 rows that were in no visualisation at all.
 *
 * The first version of this file counted global_memory, rag_memories and the
 * notes, and stopped there. But the memory is six tables, and this one holds
 * the three agents' own stores: axe_trader (7,173), axe_intel (1,831),
 * axe_companion (1,825) and a shared `global` bucket (851). So the brain
 * reported ~24,900 while the memory held 37,032, and a third of it -- the
 * third that belongs to the agents Luka cares most about -- was nowhere.
 *
 * Mapping: the trader's rows join Trading, which is where its global_memory
 * rows already go, so one agent is not split across two mountains. Intel and
 * Companion are agents, so they join Agents. Anything unattributed goes to
 * Insights, the same bucket global_memory's leftovers use.
 */
const MEMORY_TABLE_SQL =
  `SELECT ${AGENT_HUB_CASE} AS hub, count(*) AS n FROM memory GROUP BY 1`;

/**
 * Obsidian notes, by the folder that carries their meaning.
 *
 * Left out of the first version of this file, which was a regression I
 * introduced: swapping sampled counts for real ones silently dropped the 57
 * notes from every hub tally, so Resources read 0 while the vault was full and
 * Insights stayed at 609 instead of 647.
 *
 * The mapping mirrors folderHubOf in NeuralMemorySystem. The vault is
 * AXE/Reflections (38), AXE/Skills (12), AXE/System (7); the top-level names
 * are kept working for a vault that grows into them.
 */
const NOTES_SQL =
  `SELECT ${NOTE_HUB_CASE} AS hub, count(*) AS n FROM core_obsidian_notes GROUP BY 1`;

let cache: { at: number; value: HubCounts } | null = null;
const TTL_MS = 60_000;

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export async function loadHubCounts(force = false): Promise<HubCounts> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;

  try {
    const [globalRows, ragRows, noteRows, memRows] = await Promise.all([
      sbRunSql(GLOBAL_HUB_SQL), sbRunSql(RAG_SQL), sbRunSql(NOTES_SQL),
      sbRunSql(MEMORY_TABLE_SQL),
    ]);
    const byHub: Partial<Record<HubId, number>> = {};
    for (const r of globalRows as Record<string, unknown>[]) {
      byHub[String(r.hub) as HubId] = num(r.n);
    }
    const ragTotal = num((ragRows as Record<string, unknown>[])[0]?.n);
    byHub.knowledge = ragTotal;

    // Notes and the agent store both ADD to a hub rather than replacing it --
    // a hub is a subject, and more than one table can hold rows about it.
    let noteTotal = 0;
    for (const r of noteRows as Record<string, unknown>[]) {
      const hub = String(r.hub) as HubId;
      const n = num(r.n);
      noteTotal += n;
      byHub[hub] = (byHub[hub] ?? 0) + n;
    }

    let agentStoreTotal = 0;
    for (const r of memRows as Record<string, unknown>[]) {
      const hub = String(r.hub) as HubId;
      const n = num(r.n);
      agentStoreTotal += n;
      byHub[hub] = (byHub[hub] ?? 0) + n;
    }

    const value: HubCounts = {
      byHub,
      total: Object.values(byHub).reduce<number>((a, b) => a + (b ?? 0), 0),
      // Per store, not per hub: the hub tallies now mix global rows and notes,
      // so they cannot be summed back into a table total.
      globalTotal: (globalRows as Record<string, unknown>[])
        .reduce<number>((a, r) => a + num(r.n), 0),
      ragTotal,
      noteTotal,
      agentStoreTotal,
      ok: true,
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // Never a silent zero: a failed count must not render as an empty memory.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[memoryHubCounts] count failed, falling back to sample sizes:', message);
    return {
      byHub: {}, total: 0, globalTotal: 0, ragTotal: 0, noteTotal: 0,
      agentStoreTotal: 0, ok: false, error: message,
    };
  }
}

/**
 * Peak height from a row count.
 *
 * Log, not sqrt-with-a-ceiling. The old curve was
 * `0.55 + min(sqrt(n) * 0.05, 0.85)`, which reaches its cap at n = 289 -- fine
 * while every hub was a slice of a 500-row sample, useless against real
 * totals, where Trading (14,889), Insights (609) and Events (284) would all
 * have drawn the same height.
 *
 * Log keeps the whole range legible: 21 -> 0.82, 284 -> 1.14, 7,889 -> 1.55,
 * 14,889 -> 1.61. Trading is visibly the biggest thing on the terrain, which
 * is true, without flattening everything else into the ground.
 */
export function peakHeightFor(count: number): number {
  return 0.45 + Math.log10(Math.max(count, 1) + 1) * 0.28;
}
