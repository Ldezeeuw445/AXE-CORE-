/**
 * Whether a pair is allowed to OPEN a position this cycle.
 *
 * ## Why the funnel has to bind, and why only here
 *
 * The six-phase funnel ranks the whole board down to two or three pairs worth
 * the risk, and until now its answer only reordered the queue. Order is a weak
 * form of selection: with a scan budget that reaches part of the universe each
 * cycle it usually works, and when the budget is generous it does nothing at
 * all — the desk still opened positions on pairs the funnel had explicitly
 * dropped for a failed correlation or a reward-to-risk under 2:1. A judgement
 * nothing enforces is a suggestion.
 *
 * ## Closing is never gated
 *
 * This says nothing about exits. A pair that is no longer a finalist is
 * precisely the pair most likely to need closing, and a rule that could trap an
 * open position would be far more dangerous than the one it replaces. Only the
 * two opening actions are in scope: buying, and selling into no position.
 *
 * ## The failure mode it must not have
 *
 * A funnel that never ran, ran badly, or ran hours ago must not be able to halt
 * the desk. Every uncertain case therefore resolves to "may open" — the same
 * behaviour as before this existed. Binding is the exception that requires a
 * fresh, usable ranking; it is never the default.
 */

export interface OpeningMandate {
  /** May this symbol open a NEW position this cycle? */
  mayOpen: boolean;
  /** Whether the funnel was actually consulted, for the decision trace. */
  binding: boolean;
  /** Why, in words that belong on screen. */
  reason: string;
}

/** Just enough of a FunnelRun to decide. Kept structural so domain/ stays clean. */
export interface RankingSnapshot {
  finalists: string[];
  ranAt: string;
}

/**
 * How old a ranking may be and still bind.
 *
 * Two hours is four cycles at the current 30-minute interval. Long enough that
 * one skipped or slow funnel run does not silently unbind the desk, short
 * enough that a ranking from before an overnight gap cannot still be dictating
 * which pairs may trade.
 */
export const MAX_RANKING_AGE_MS = 2 * 60 * 60 * 1000;

const FREE = (reason: string): OpeningMandate => ({ mayOpen: true, binding: false, reason });

export function openingMandate(input: {
  symbol: string;
  ranking: RankingSnapshot | null | undefined;
  now?: number;
  maxAgeMs?: number;
}): OpeningMandate {
  const { symbol, ranking } = input;
  const now = input.now ?? Date.now();
  const maxAge = input.maxAgeMs ?? MAX_RANKING_AGE_MS;

  if (!ranking) return FREE('no ranking yet — funnel not binding');
  if (!Array.isArray(ranking.finalists) || ranking.finalists.length === 0) {
    // A funnel that finished with nobody left is a funnel that could not judge,
    // not a verdict that nothing may trade. Treating it as the latter would let
    // one bad data day close the desk.
    return FREE('ranking has no finalists — funnel not binding');
  }

  const ranAt = Date.parse(ranking.ranAt);
  if (!Number.isFinite(ranAt)) return FREE('ranking has no usable timestamp — funnel not binding');

  const ageMs = now - ranAt;
  if (ageMs < 0) return FREE('ranking is timestamped in the future — funnel not binding');
  if (ageMs > maxAge) {
    const hours = (ageMs / 3_600_000).toFixed(1);
    return FREE(`ranking is ${hours}h old — funnel not binding`);
  }

  const wanted = symbol.trim().toUpperCase();
  const isFinalist = ranking.finalists.some(f => f.trim().toUpperCase() === wanted);

  return isFinalist
    ? { mayOpen: true, binding: true, reason: 'finalist this cycle' }
    : {
      mayOpen: false,
      binding: true,
      reason: `not a finalist this cycle (${ranking.finalists.join(', ')}) — no new position`,
    };
}
