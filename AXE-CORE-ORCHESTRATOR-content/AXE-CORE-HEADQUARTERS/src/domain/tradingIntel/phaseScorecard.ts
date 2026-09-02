/**
 * Was each funnel phase right to drop what it dropped?
 *
 * ## Why this has to exist
 *
 * The funnel drops most of the board every cycle. Measured over 96 stored
 * cycles: strength dropped 156 pairs, correlation 63, reward-to-risk 11, the
 * vote 4. Those thresholds — the ±0.35% sideways band, r ≥ 0.85, 2:1 — were
 * set by judgement and have never been checked against an outcome. A phase that
 * filters out the good trades is worse than no phase at all, and nothing in the
 * desk could tell the difference.
 *
 * ## What counts as "right"
 *
 * There is no counterfactual trade for a pair that was dropped, so this does
 * not pretend to know what the trade would have returned. It asks the narrower
 * question the data can actually answer: after the drop, did the pair move
 * enough to have been worth taking?
 *
 * A drop is scored against the forward move over the horizon, as a fraction of
 * the price at the moment of the drop:
 *
 *   |forward move| >= MATERIAL_MOVE_PCT  ->  a miss (there was a trade there)
 *   otherwise                            ->  a good drop (nothing to miss)
 *
 * That is deliberately direction-agnostic. The funnel's job at these phases is
 * to decide whether a pair is worth the desk's attention, not which way it
 * goes; a pair that then moved 2% was worth attention whichever way it went.
 *
 * ## Why a miss rate is not a verdict
 *
 * A phase that drops 156 pairs and misses 20 of them is not thereby bad: it
 * also spared the desk 136 trades it did not want, and the desk cannot take
 * every pair anyway. So this reports the rate and the counts and stops there.
 * The number that changes a threshold is a phase whose miss rate is far out of
 * line with its peers — that is a comparison a person makes, and it needs both
 * numbers on screen rather than a single score that hides one of them.
 *
 * A phase with too few drops to judge says so instead of reporting a
 * percentage. Three drops and one miss is 33%, and it means nothing.
 */

/** A pair the funnel dropped, and what happened next. */
export interface ScoredDrop {
  pairId: string;
  /** Which phase dropped it. */
  phase: string;
  /** When, ISO. */
  at: string;
  /** Price at the drop, and after the horizon. Null when unknown. */
  priceAtDrop: number | null;
  priceAfter: number | null;
}

export interface PhaseScore {
  phase: string;
  /** Drops with enough price data to judge. */
  judged: number;
  /** Of those, how many moved enough to have been worth taking. */
  misses: number;
  /** misses / judged, or null when the sample is too small to mean anything. */
  missRate: number | null;
  /** Drops that could not be scored, so the reader knows the coverage. */
  unscored: number;
  /** Plain words, for the row. */
  reading: string;
}

/**
 * How far a pair must move after being dropped before the drop counts as a
 * miss: 0.8%.
 *
 * Below this a trade would mostly have been spread and noise, so calling it a
 * missed opportunity would punish the funnel for filtering exactly what it is
 * there to filter.
 */
export const MATERIAL_MOVE_PCT = 0.008;

/**
 * Drops needed before a rate is reported at all.
 *
 * Twenty is where one unlucky pair stops swinging the number by more than a
 * few points. Under it, the count is shown and the rate is withheld — a
 * percentage over five drops invites exactly the overreaction this is meant to
 * prevent.
 */
export const MIN_DROPS_TO_JUDGE = 20;

function movedMaterially(d: ScoredDrop): boolean | null {
  if (d.priceAtDrop == null || d.priceAfter == null) return null;
  if (!Number.isFinite(d.priceAtDrop) || !Number.isFinite(d.priceAfter)) return null;
  if (d.priceAtDrop === 0) return null;
  return Math.abs((d.priceAfter - d.priceAtDrop) / d.priceAtDrop) >= MATERIAL_MOVE_PCT;
}

export function scorePhases(drops: ScoredDrop[]): PhaseScore[] {
  const byPhase = new Map<string, ScoredDrop[]>();
  for (const d of drops) {
    const list = byPhase.get(d.phase) ?? [];
    list.push(d);
    byPhase.set(d.phase, list);
  }

  const scores: PhaseScore[] = [];
  for (const [phase, list] of byPhase) {
    let judged = 0;
    let misses = 0;
    let unscored = 0;
    for (const d of list) {
      const moved = movedMaterially(d);
      if (moved === null) { unscored++; continue; }
      judged++;
      if (moved) misses++;
    }
    const enough = judged >= MIN_DROPS_TO_JUDGE;
    const missRate = enough ? misses / judged : null;
    scores.push({
      phase,
      judged,
      misses,
      missRate,
      unscored,
      reading: !enough
        ? `${judged} drop${judged === 1 ? '' : 's'} scored — too few to read a rate`
        : `${misses} of ${judged} drops moved ${(MATERIAL_MOVE_PCT * 100).toFixed(1)}%+ afterwards (${(missRate! * 100).toFixed(0)}%)`,
    });
  }

  // Worst first: the phase most likely to need its threshold revisited is the
  // one throwing away the most that mattered.
  return scores.sort((a, b) => (b.missRate ?? -1) - (a.missRate ?? -1));
}

/**
 * The phase most out of line with the others, if there is one.
 *
 * Returns null unless at least two phases have a readable rate — a single
 * number has nothing to be out of line with, and this exists to stop a lone
 * percentage from being treated as a verdict.
 */
export function outlierPhase(scores: PhaseScore[]): PhaseScore | null {
  const readable = scores.filter(s => s.missRate != null);
  if (readable.length < 2) return null;
  const rates = readable.map(s => s.missRate!);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const worst = readable[0];
  // Half again as bad as the average across phases. A phase can be the worst of
  // several good ones without that meaning anything.
  return worst.missRate! > mean * 1.5 ? worst : null;
}
