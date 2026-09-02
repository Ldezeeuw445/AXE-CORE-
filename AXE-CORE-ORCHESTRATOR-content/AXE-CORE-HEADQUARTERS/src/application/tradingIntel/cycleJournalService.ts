/**
 * Storage for the cycle journal.
 *
 * Kept small on purpose. A cycle record holds thirty verdicts and half a dozen
 * stage summaries, so a few dozen of them is a real amount of text — and this
 * app has already been bitten once by an unbounded store: the embedding cache
 * grew to 2.6MB, pushed localStorage past its quota, and every settings write
 * started failing with WebKit's "The quota has been exceeded", which was read
 * as a MetaAPI rate limit for two days.
 *
 * So the journal keeps the newest N cycles and drops the rest. What is lost is
 * old detail; what matters — the ledger, the trades, the learning stats — lives
 * in its own tables and is not affected.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { dedupeVerdicts, type CycleRecord } from '@/domain/tradingIntel/cycleJournal';
import { capBySize } from '@/domain/tradingIntel/boundedHistory';
import { pushCycleToAxon } from '@/application/tradingIntel/axonMemoryBridge';

const KEY = 'axe_trading_cycle_journal';

/**
 * How many cycles to keep.
 *
 * At a fifteen-minute interval this is about two days, which is the window in
 * which "why did it do that" is still a question anyone asks.
 */
export const JOURNAL_LIMIT = 200;

/**
 * The journal's real bound: 40 kB.
 *
 * The count above was never the limit that mattered. Measured 2026-08-27 on the
 * live install, 119 records came to 111 kB — and the whole value is rewritten
 * on every save, which is after each of six stages for each symbol in a cycle,
 * roughly eighteen full uploads per cycle. At that size it stopped reaching the
 * server entirely: `axe_trading_autopilot_last_run` (26 bytes) synced at 10:38
 * while this one was last written at 10:09. It was also a large share of what
 * filled the browser store and made every local write fail with WebKit's quota
 * error.
 *
 * 40 kB is roughly forty of the records measured, and small enough to write
 * many times a cycle without either ceiling being in question. Fewer cycles are
 * kept than before; a journal that does not save keeps none.
 */
export const JOURNAL_BYTE_BUDGET = 40 * 1024;

export async function loadCycleJournal(): Promise<CycleRecord[]> {
  const rows = await loadSetting<CycleRecord[] | null>(KEY, null);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Write one cycle, replacing any earlier record with the same start.
 *
 * Replacing rather than appending is what lets the autopilot save the record
 * repeatedly AS the cycle runs — after research, after the funnel, after the
 * trade — so a cycle that dies halfway still leaves everything it had got to.
 * A journal that only records finished cycles cannot see the failures, which
 * are the ones worth reading.
 */
export async function saveCycleRecord(record: CycleRecord): Promise<void> {
  const existing = await loadCycleJournal();
  // One funnel run judges the whole board, and a cycle writes one record per
  // symbol -- so the same thirty-entry list was stored once per symbol.
  // Measured 2026-08-27: six records, six copies of one list, 15.9 kB of pure
  // duplication inside a 40 kB budget. Deduplicating is what buys the history
  // the feedback loop needs; the alternative is a bigger budget, and a bigger
  // budget is what stopped this value syncing in the first place.
  const others = existing.filter(r => r.startedAt !== record.startedAt);
  const deduped = dedupeVerdicts(record, others);
  const { kept } = capBySize(
    [deduped.next, ...deduped.existing],
    JOURNAL_BYTE_BUDGET,
    JOURNAL_LIMIT,
  );
  const next = kept;
  await saveSetting(KEY, next).catch(() => undefined);
  // Deliberately here rather than at the autopilot's three call sites: a cycle
  // that is worth remembering is worth remembering however it was saved, and a
  // fourth call site added later would otherwise silently not reach AXON. The
  // push decides for itself that almost every cycle earns nothing, and it can
  // never throw into the caller -- a memory store being down is not a reason
  // to stop trading.
  void pushCycleToAxon(deduped.next).catch(() => undefined);
}

/** The most recent cycles, newest first. */
export async function recentCycles(limit = 20): Promise<CycleRecord[]> {
  return (await loadCycleJournal()).slice(0, limit);
}
