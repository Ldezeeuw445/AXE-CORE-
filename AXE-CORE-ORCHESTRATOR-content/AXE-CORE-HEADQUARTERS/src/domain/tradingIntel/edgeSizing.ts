/**
 * How big a trade should be, given what the ledger actually proves.
 *
 * ## The problem this fixes
 *
 * Sizing was `equity × riskPerTradePct` — the same notional on every trade,
 * whatever the record said. Measured 2026-08-26, run-1 held both of these at
 * once: volumetric-ob on BTCUSD at 14 wins from 15 trades, and a strategy on
 * the same pair at 15 trades, 15 losses, -15.8%. They were sized identically.
 * Flat sizing is not neutral — it is an active decision to bet the same on the
 * thing that works and the thing that does not.
 *
 * ## Why the multiplier is bounded, and small
 *
 * The honest version of this is Kelly, and Kelly on an estimated edge is how
 * accounts die: it sizes on the assumption that the measured edge is the true
 * edge, and the measured edge is mostly noise until the sample is large. So
 * this deliberately is not Kelly. It is a bounded nudge, MIN_MULT…MAX_MULT,
 * around the flat size that already exists. At worst a wrong reading halves or
 * doubles one position. The risk settings stay the ceiling; this only moves
 * within them.
 *
 * ## Sample size decides how much of the reading is used at all
 *
 * `trades / (trades + SHRINK)` is the fraction of the raw signal that survives.
 * At 5 trades that is 0.2, at 20 it is 0.5, at 60 it is 0.75 — so a strategy
 * at 100% over three trades barely moves off flat, which is the entire point.
 * Three winning trades is the most common way to be fooled, and it is exactly
 * the case where a naive rule would bet biggest.
 *
 * ## The measure is return per trade, not win rate
 *
 * A 90% win rate that gives back everything on the tenth trade is a losing
 * strategy, and win rate cannot see that. Net return per trade can. It is also
 * the number the ledger already ranks on, so sizing and selection cannot
 * disagree about what "good" means.
 *
 * ## Untrusted evidence sizes flat, never small
 *
 * `liveTrusted: false` means the counters are impossible, not bad — the
 * pre-2026-08-20 divisor bug left permanently inflated returns in run-1 that no
 * longer describe anything. Impossible evidence is treated as no evidence, so
 * it returns flat. Shrinking on it would let a known-corrupt number quietly
 * suppress a strategy that may be fine.
 */

/** What the ledger knows about one pair/strategy/timeframe combination. */
export interface EdgeEvidence {
  /** Closed trades behind these numbers. */
  trades: number;
  /** Cumulative net return as a fraction: 0.05 is +5%. */
  netReturnPct: number;
  /** False when the counters are impossible and must not be ranked on. */
  liveTrusted: boolean;
}

export interface SizingDecision {
  /** Multiply the flat risk budget by this. Always finite, always in bounds. */
  multiplier: number;
  /** Why, in words that belong in a decision trace. */
  reason: string;
}

/** Below this, a record is an anecdote and sizing stays flat. */
export const MIN_TRADES = 5;
/** Never smaller than half the flat size, never larger than double. */
export const MIN_MULT = 0.5;
export const MAX_MULT = 2;
/** Trades needed before half the raw reading is trusted. */
export const SHRINK = 20;
/**
 * Return per trade that earns the full upward nudge: 0.2%.
 *
 * Set from run-1's own trusted rows rather than a round number — the best
 * sustained combinations there sit near this, so MAX_MULT stays reachable by
 * something real and is not a ceiling nothing can touch.
 */
export const STRONG_PER_TRADE = 0.002;

const FLAT: SizingDecision = { multiplier: 1, reason: 'no proven edge — flat size' };

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * The size multiplier for one combination.
 *
 * Returns exactly 1 whenever the evidence cannot carry a decision, so the
 * absence of a ledger can never make sizing worse than it is today.
 */
export function sizeMultiplier(ev: EdgeEvidence | null | undefined): SizingDecision {
  if (!ev) return FLAT;
  if (!ev.liveTrusted) return { multiplier: 1, reason: 'ledger counters not trustworthy — flat size' };
  if (!Number.isFinite(ev.trades) || !Number.isFinite(ev.netReturnPct)) return FLAT;
  if (ev.trades < MIN_TRADES) {
    return { multiplier: 1, reason: `only ${ev.trades} trades — too few to size on` };
  }

  const perTrade = ev.netReturnPct / ev.trades;

  // Raw reading: full size-up at STRONG_PER_TRADE, full size-down at or below
  // zero, linear between. Losing money per trade is the one signal that needs
  // no sample-size apology to act on, but it gets the same shrinkage anyway —
  // a short losing streak on a good strategy is not evidence it stopped working.
  const raw = perTrade >= 0
    ? 1 + (MAX_MULT - 1) * clamp(perTrade / STRONG_PER_TRADE, 0, 1)
    : 1 - (1 - MIN_MULT) * clamp(-perTrade / STRONG_PER_TRADE, 0, 1);

  const trust = ev.trades / (ev.trades + SHRINK);
  const multiplier = clamp(1 + (raw - 1) * trust, MIN_MULT, MAX_MULT);

  const pct = (perTrade * 100).toFixed(3);
  const dir = multiplier > 1.005 ? 'up' : multiplier < 0.995 ? 'down' : 'flat';
  return {
    multiplier,
    reason: `${ev.trades} trades at ${pct}%/trade, trust ${(trust * 100).toFixed(0)}% — size ${dir} ×${multiplier.toFixed(2)}`,
  };
}
