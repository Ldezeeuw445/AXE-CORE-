/**
 * Float-safe reward:risk maths for the Trading Team.
 *
 * Charts sets TP = entry ± 2.2 × risk, then measures reward / risk back out of the
 * prices. That is 2.1999999999999984 for real EURUSD levels, and `>= 2.2` is false for it.
 * Decision therefore never added its +0.10 for "R:R ≥ 2.2", confidence topped out at 0.67
 * and stayed under the 0.70 GO line: all 15 WAIT rows in core_trading_team_runs (10–12 nov
 * 2026) say confidence 0.67 with rr 2.199999999999984 / …992. Compare R:R through
 * `rrAtLeast`, and round it once at the source with `roundRiskReward`.
 */

/** Far above float noise (~1e-15), far below any real difference between two setups. */
export const RR_EPSILON = 1e-6;

/** Four decimals: 2.1999999999999984 → 2.2. Non-finite stays NaN so nothing passes by accident. */
export function roundRiskReward(rr: number): number {
  return Number.isFinite(rr) ? Math.round(rr * 1e4) / 1e4 : NaN;
}

/** `rr >= min`, tolerant of float noise. Missing or non-finite R:R never passes. */
export function rrAtLeast(rr: number | null | undefined, min: number): boolean {
  return typeof rr === 'number' && Number.isFinite(rr) && rr >= min - RR_EPSILON;
}
