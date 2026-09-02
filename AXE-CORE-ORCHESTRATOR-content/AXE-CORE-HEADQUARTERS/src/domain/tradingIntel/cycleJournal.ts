/**
 * One record per cycle, from the whole board down to what each account did.
 *
 * ## The gap this closes
 *
 * Every stage of the desk already produced something and threw most of it
 * away. Research wrote a thesis into its own table. The funnel ranked thirty
 * pairs and stored only its latest run. Intel and Companion wrote handoffs
 * into a shared memory of ~8 900 rows. The ledger recorded fills. Nothing
 * joined them, so the one question that makes an agent improve —
 *
 *     of everything we concluded that cycle, which parts were right?
 *
 * — could not be asked at all. You could see that a trade lost, and never
 * which stage had been wrong about it: the thesis, the ranking, the second
 * opinion, or the sizing.
 *
 * A cycle record is that join. It is written as the cycle runs, keyed by the
 * cycle's own start, and it keeps the REASONS, not just the outcomes — the
 * phase a pair died at, the handoff each lane wrote, the strategy the ledger
 * picked and why, and then, later, what the trade actually did.
 *
 * ## Written forward, judged backward
 *
 * Stages are appended while the cycle is still running, so a cycle that dies
 * halfway leaves a record that says where it stopped. That is deliberate: the
 * cycles worth studying are usually the ones that failed, and a journal that
 * only records complete runs is blind to exactly those.
 *
 * Pure: shapes and helpers only. Persistence lives in application/.
 */
import type { PhaseId } from './decisionFunnel';

export type CycleStageId =
  | 'research'
  | 'funnel'
  | 'intel'
  | 'companion'
  | 'strategy'
  | 'execution';

export const CYCLE_STAGE_ORDER: CycleStageId[] = [
  'research', 'funnel', 'intel', 'companion', 'strategy', 'execution',
];

export const CYCLE_STAGE_LABELS: Record<CycleStageId, string> = {
  research: 'Research',
  funnel: 'Decision funnel',
  intel: 'AXE Intel',
  companion: 'AXE Companion',
  strategy: 'Strategy & framework',
  execution: 'Execution',
};

/** What one stage concluded, and whether it managed to conclude anything. */
export interface CycleStage {
  id: CycleStageId;
  at: string;
  /** 'ok' ran and produced something; 'empty' ran and had nothing to say;
   *  'failed' could not run. Three states, because "no signal" and "no
   *  provider" are different problems and only one is worth chasing. */
  status: 'ok' | 'empty' | 'failed';
  /** One line, for the row. */
  headline: string;
  /** The reasoning, for when the row is not enough. */
  detail?: string;
  /** How long the stage took, in ms. */
  ms?: number;
}

/** What happened to one pair in the funnel, kept so a drop can be argued with. */
export interface CyclePairVerdict {
  pairId: string;
  passed: boolean;
  droppedAt: PhaseId | null;
  reason: string;
}

/** What one account did with the decision. */
export interface CycleAccountResult {
  accountId: string;
  label: string;
  action: string;
  confidence: number | null;
  /** Broker order id when it filled; null when it did not. */
  orderId: string | null;
  /** Why nothing happened, in the broker's or the risk layer's own words. */
  refusedBecause: string | null;
}

export interface CycleRecord {
  /** Cycle start, and the record's identity. */
  startedAt: string;
  endedAt: string | null;
  symbol: string;
  stages: CycleStage[];
  /**
   * Every pair the funnel judged this cycle.
   *
   * The funnel judges the whole board ONCE per cycle, and a cycle produces one
   * record per symbol — so the identical thirty-entry list was being stored
   * once per symbol. Measured 2026-08-27: six records held six copies of one
   * list, 19.1 kB of which 15.9 kB was duplication, in a journal capped at
   * 40 kB. That is why it only reached back six cycles.
   *
   * Now only the NEWEST record of a run keeps the list; older records in the
   * same run carry `verdictsFrom` instead. Newest rather than oldest on
   * purpose: the oldest is what the byte cap drops first, and the surviving
   * record has to be the one holding the evidence.
   */
  verdicts: CyclePairVerdict[];
  /** Set when this record's verdicts live on a newer record of the same run. */
  verdictsFrom?: string;
  /** What the funnel let through. */
  finalists: string[];
  strategy: string | null;
  timeframe: string | null;
  accounts: CycleAccountResult[];
}

export function emptyCycle(symbol: string, startedAt = new Date().toISOString()): CycleRecord {
  return {
    startedAt, endedAt: null, symbol,
    stages: [], verdicts: [], finalists: [],
    strategy: null, timeframe: null, accounts: [],
  };
}

/** Append a stage, replacing any earlier entry for the same id. */
export function withStage(record: CycleRecord, stage: CycleStage): CycleRecord {
  return {
    ...record,
    stages: [...record.stages.filter(s => s.id !== stage.id), stage]
      .sort((a, b) => CYCLE_STAGE_ORDER.indexOf(a.id) - CYCLE_STAGE_ORDER.indexOf(b.id)),
  };
}

/**
 * How far the cycle actually got.
 *
 * Counts stages that produced something, not stages that were attempted — a
 * cycle where every lane failed reached nothing, however many of them ran.
 */
export function cycleReach(record: CycleRecord): { reached: number; total: number } {
  return {
    reached: record.stages.filter(s => s.status === 'ok').length,
    total: CYCLE_STAGE_ORDER.length,
  };
}

/** Where the cycle stopped, or null when it ran the whole way. */
export function stoppedAt(record: CycleRecord): CycleStageId | null {
  for (const id of CYCLE_STAGE_ORDER) {
    const s = record.stages.find(st => st.id === id);
    if (!s) return id;              // never reached
    if (s.status === 'failed') return id;
  }
  return null;
}

export interface CycleOutcome {
  filled: number;
  refused: number;
  /** Accounts that were asked at all. */
  asked: number;
}

export function cycleOutcome(record: CycleRecord): CycleOutcome {
  return {
    filled: record.accounts.filter(a => a.orderId).length,
    refused: record.accounts.filter(a => !a.orderId).length,
    asked: record.accounts.length,
  };
}

/**
 * A one-line summary that keeps the shape of the cycle.
 *
 * Deliberately says how many pairs were considered, not just what was traded:
 * "30 → 3 → 1 fill" and "30 → 0 → no trade" are both healthy cycles and both
 * unreadable from a fill count alone.
 */
export function summarise(record: CycleRecord): string {
  const judged = record.verdicts.length;
  const out = cycleOutcome(record);
  const stop = stoppedAt(record);
  const head = `${judged} judged → ${record.finalists.length} finalist(s) → ${out.filled} fill(s)`;
  return stop ? `${head} · stopped at ${CYCLE_STAGE_LABELS[stop]}` : head;
}

/**
 * The verdicts for a record, following the reference when it has one.
 *
 * A reader must never have to know that the storage deduplicates. This is the
 * only supported way to read them.
 */
export function verdictsOf(
  record: CycleRecord,
  journal: readonly CycleRecord[],
): CyclePairVerdict[] {
  if (record.verdicts.length > 0) return record.verdicts;
  if (!record.verdictsFrom) return [];
  const holder = journal.find(r => r.startedAt === record.verdictsFrom);
  return holder?.verdicts ?? [];
}

/**
 * Move one run's verdicts onto `next`, leaving references behind.
 *
 * Compares the serialised list rather than the funnel's timestamp, because the
 * record does not carry one — and two records with an identical judgement of
 * the same board ARE the same run for this purpose.
 */
export function dedupeVerdicts(
  next: CycleRecord,
  existing: readonly CycleRecord[],
): { next: CycleRecord; existing: CycleRecord[] } {
  if (next.verdicts.length === 0) return { next, existing: [...existing] };
  const key = JSON.stringify(next.verdicts);

  // Whose list is about to move. Their existing references have to move with
  // it: without this the third record of a run strips the second, and the
  // first is left pointing at a record that no longer holds anything.
  const stripped = new Set(
    existing.filter(r => r.verdicts.length > 0 && JSON.stringify(r.verdicts) === key)
      .map(r => r.startedAt),
  );

  const trimmed = existing.map(r => {
    if (stripped.has(r.startedAt)) return { ...r, verdicts: [], verdictsFrom: next.startedAt };
    if (r.verdictsFrom && stripped.has(r.verdictsFrom)) return { ...r, verdictsFrom: next.startedAt };
    return r;
  });
  return { next, existing: trimmed };
}
