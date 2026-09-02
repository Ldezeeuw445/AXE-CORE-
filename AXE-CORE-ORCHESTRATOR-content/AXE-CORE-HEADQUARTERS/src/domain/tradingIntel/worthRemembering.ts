/**
 * What, out of everything the desk does, is worth putting in AXON Memory.
 *
 * ## Why this is a decision and not a pipe
 *
 * AXON stores only what an assistant deliberately saves — there is no
 * conversation capture — and what lands there is read later by every other AI
 * Luka uses. That makes the store's value entirely a function of what is kept
 * OUT of it. The autopilot runs a cycle every fifteen minutes; piping cycles
 * into AXON would put roughly a hundred rows a day into a memory whose whole
 * purpose is that a future reader can find the thing that mattered.
 *
 * So the rule is: a cycle earns a memory when it changed something, or when it
 * failed in a way not already recorded.
 *
 *   · A fill is always worth keeping. Money moved; that is a fact about the
 *     business, not a log line.
 *   · A refusal is worth keeping the FIRST time that reason appears. "Not
 *     enough margin" is worth knowing once; it is worth nothing the ninetieth
 *     time, and the ninetieth copy is what makes the first one unfindable.
 *   · A cycle that judged the board and opened nothing is the normal, healthy
 *     case. It is worth nothing at all. Most cycles are this one.
 *
 * The seen-set is the caller's, deliberately: dedup that only lasts as long as
 * one process is not dedup. Passing it in also means the tests can state the
 * history exactly instead of arranging for it.
 */
import {
  cycleOutcome, stoppedAt, summarise,
  CYCLE_STAGE_LABELS, type CycleRecord,
} from './cycleJournal';

export interface AxonNote {
  title: string;
  content: string;
  tags: string[];
  /**
   * What makes this note distinct.
   *
   * A caller keeps these to avoid saying the same thing twice. Fills are keyed
   * on the order id, so the same fill is never written twice however often the
   * record is re-saved as the cycle progresses; problems are keyed on the
   * reason, so a recurring one is recorded once.
   */
  dedupeKey: string;
}

function accountLine(a: CycleRecord['accounts'][number]): string {
  const conf = a.confidence == null ? '' : ` (${Math.round(a.confidence * 100)}% confidence)`;
  return a.orderId
    ? `${a.label}: ${a.action}${conf} — filled, order ${a.orderId}`
    : `${a.label}: ${a.action}${conf} — no trade${a.refusedBecause ? `, ${a.refusedBecause}` : ''}`;
}

/**
 * The notes this cycle earns, given what has already been written.
 *
 * Returns a list because one cycle can genuinely be two things: a fill on one
 * account and a first-time refusal on another are separate facts, and folding
 * them into one note would make the refusal unfindable behind the fill.
 */
export function notesWorthRemembering(
  record: CycleRecord,
  alreadyWritten: ReadonlySet<string>,
): AxonNote[] {
  const notes: AxonNote[] = [];
  const when = record.endedAt ?? record.startedAt;
  // Two accounts refused for the same reason is ONE fact, and this loop can
  // reach the same key twice inside a single cycle -- so what is written here
  // counts against the dedupe just as much as what was written before it.
  const written = new Set(alreadyWritten);
  const claim = (key: string): boolean => {
    if (written.has(key)) return false;
    written.add(key);
    return true;
  };

  for (const a of record.accounts) {
    if (!a.orderId) continue;
    const dedupeKey = `fill:${a.orderId}`;
    if (!claim(dedupeKey)) continue;
    notes.push({
      dedupeKey,
      title: `AXE Core: ${a.action} ${record.symbol} on ${a.label}`,
      tags: ['axe-core', 'trade', record.symbol],
      content: [
        `AXE Core opened a position on ${record.symbol}.`,
        accountLine(a),
        record.strategy ? `Strategy: ${record.strategy}${record.timeframe ? ` on ${record.timeframe}` : ''}.` : null,
        record.finalists.length ? `The funnel let through: ${record.finalists.join(', ')}.` : null,
        `Cycle: ${summarise(record)}.`,
        `At ${when}.`,
      ].filter(Boolean).join('\n'),
    });
  }

  // A stage that could not run at all. Worth one memory per reason, because
  // the second occurrence teaches a reader nothing the first did not.
  const stop = stoppedAt(record);
  const failed = stop ? record.stages.find(s => s.id === stop && s.status === 'failed') : undefined;
  if (failed) {
    const dedupeKey = `stage:${failed.id}:${failed.headline}`;
    if (claim(dedupeKey)) {
      notes.push({
        dedupeKey,
        title: `AXE Core: ${CYCLE_STAGE_LABELS[failed.id]} failed`,
        tags: ['axe-core', 'problem', failed.id],
        content: [
          `AXE Core's ${CYCLE_STAGE_LABELS[failed.id]} stage could not run.`,
          failed.headline,
          failed.detail ?? null,
          `First seen on ${record.symbol} at ${when}.`,
        ].filter(Boolean).join('\n'),
      });
    }
  }

  // A refusal the risk layer or the broker gave in its own words. Same rule:
  // the reason is the fact, not the occurrence.
  const out = cycleOutcome(record);
  if (out.filled === 0 && record.finalists.length > 0) {
    for (const a of record.accounts) {
      if (a.orderId || !a.refusedBecause?.trim()) continue;
      const dedupeKey = `refused:${a.refusedBecause.trim()}`;
      if (!claim(dedupeKey)) continue;
      notes.push({
        dedupeKey,
        title: `AXE Core: trade refused — ${a.refusedBecause.trim()}`,
        tags: ['axe-core', 'problem', 'refused'],
        content: [
          `AXE Core wanted to trade ${record.symbol} and did not.`,
          accountLine(a),
          `First seen at ${when}.`,
        ].join('\n'),
      });
    }
  }

  return notes;
}
