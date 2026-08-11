/**
 * strategySignals — ONE shared signal function for every strategy in the
 * STRATEGIES catalog, used by BOTH backtestEngine.ts and
 * tradingAgentEngine.ts. Previously each had its own copy (backtest had a
 * signalAt() with only mean-reversion/trend-follow distinct; live trading
 * didn't use strategy at all) — a live cycle could never be compared
 * against its own backtest because they weren't running the same logic.
 * Now they are, for every strategy that has real logic.
 *
 * 5 of 9 are genuinely distinct: mean-reversion, trend-follow (existing),
 * plus three new ones added here — pdh (previous day high/low breakout),
 * golden-pocket (0.618-0.65 fib retracement zone), fib-retracement
 * (broader 0.382/0.5/0.618 levels). The remaining 4 (smc-structure,
 * volumetric-ob, ifvg, crew-hybrid) need real pattern-detection logic
 * that currently only exists as canvas-coordinate rendering in
 * ChartIndicatorLayer.tsx, not as a replayable pure function — extracting
 * that is real, separate work, not something to rush. They share one
 * generic trend+RSI proxy, same as before, still clearly labeled as such
 * wherever results are shown (STRATEGIES.backtestable, backtest result
 * notes).
 */

export type StrategyId =
  | 'mean-reversion' | 'trend-follow' | 'pdh' | 'golden-pocket' | 'fib-retracement'
  | 'smc-structure' | 'volumetric-ob' | 'ifvg' | 'crew-hybrid';

export const DISTINCT_STRATEGIES: ReadonlySet<StrategyId> = new Set([
  'mean-reversion', 'trend-follow', 'pdh', 'golden-pocket', 'fib-retracement',
]);

export type StrategySignal = 'buy' | 'sell' | 'hold';

export interface StrategySeries {
  closes: number[];
  highs: number[];
  lows: number[];
  /** ISO timestamps, same index alignment as closes/highs/lows — needed
   *  for pdh's calendar-day grouping. */
  times: string[];
  sma20: Array<number | null>;
  sma50: Array<number | null>;
  rsi14: Array<number | null>;
}

function findSwing(s: StrategySeries, i: number, lookback = 30): { hi: number; hiIdx: number; lo: number; loIdx: number } | null {
  const start = Math.max(0, i - lookback);
  if (i - start < 10) return null;
  let hi = -Infinity, hiIdx = start, lo = Infinity, loIdx = start;
  for (let j = start; j <= i; j++) {
    if (s.highs[j] > hi) { hi = s.highs[j]; hiIdx = j; }
    if (s.lows[j] < lo) { lo = s.lows[j]; loIdx = j; }
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return null;
  return { hi, hiIdx, lo, loIdx };
}

/** Fib retracement price for `ratio` back from the move's endpoint.
 *  direction 'up' = retracing down from a hi that came after the lo;
 *  direction 'down' = retracing up from a lo that came after the hi. */
function fibLevel(hi: number, lo: number, ratio: number, direction: 'up' | 'down'): number {
  const range = hi - lo;
  return direction === 'up' ? hi - range * ratio : lo + range * ratio;
}

function goldenPocketSignal(s: StrategySeries, i: number): StrategySignal {
  const swing = findSwing(s, i);
  if (!swing) return 'hold';
  const { hi, hiIdx, lo, loIdx } = swing;
  const c = s.closes[i];
  if (loIdx < hiIdx) {
    // Up-move (low first, then high) retracing down — golden pocket = buy the dip.
    const top = fibLevel(hi, lo, 0.618, 'up');
    const bottom = fibLevel(hi, lo, 0.65, 'up');
    if (c <= top && c >= bottom) return 'buy';
  } else if (hiIdx < loIdx) {
    // Down-move (high first, then low) retracing up — golden pocket = sell the rip.
    const bottom = fibLevel(hi, lo, 0.618, 'down');
    const top = fibLevel(hi, lo, 0.65, 'down');
    if (c >= bottom && c <= top) return 'sell';
  }
  return 'hold';
}

function fibRetracementSignal(s: StrategySeries, i: number): StrategySignal {
  const swing = findSwing(s, i);
  if (!swing) return 'hold';
  const { hi, hiIdx, lo, loIdx } = swing;
  const c = s.closes[i];
  const band = (hi - lo) * 0.03; // ±3% of the move's range around each level
  const levels = [0.382, 0.5, 0.618];
  if (loIdx < hiIdx) {
    for (const r of levels) {
      const level = fibLevel(hi, lo, r, 'up');
      if (Math.abs(c - level) <= band) return 'buy';
    }
  } else if (hiIdx < loIdx) {
    for (const r of levels) {
      const level = fibLevel(hi, lo, r, 'down');
      if (Math.abs(c - level) <= band) return 'sell';
    }
  }
  return 'hold';
}

function pdhSignal(s: StrategySeries, i: number): StrategySignal {
  if (i < 2 || !s.times[i]) return 'hold';
  const day = s.times[i].slice(0, 10);
  let prevDay: string | null = null;
  for (let j = i - 1; j >= 0; j--) {
    const d = s.times[j]?.slice(0, 10);
    if (d && d !== day) { prevDay = d; break; }
  }
  if (!prevDay) return 'hold';
  let pdh = -Infinity, pdl = Infinity;
  for (let j = 0; j < i; j++) {
    if (s.times[j]?.slice(0, 10) === prevDay) {
      pdh = Math.max(pdh, s.highs[j]);
      pdl = Math.min(pdl, s.lows[j]);
    }
  }
  if (!Number.isFinite(pdh) || !Number.isFinite(pdl)) return 'hold';
  const prevClose = s.closes[i - 1];
  const c = s.closes[i];
  if (prevClose <= pdh && c > pdh) return 'buy';
  if (prevClose >= pdl && c < pdl) return 'sell';
  return 'hold';
}

function meanReversionSignal(s: StrategySeries, i: number): StrategySignal {
  const r = s.rsi14[i];
  if (r == null) return 'hold';
  if (r < 30) return 'buy';
  if (r > 70) return 'sell';
  return 'hold';
}

function trendFollowSignal(s: StrategySeries, i: number): StrategySignal {
  const s20 = s.sma20[i];
  const s50 = s.sma50[i];
  const prevS20 = s.sma20[i - 1];
  const prevS50 = s.sma50[i - 1];
  if (s20 == null || s50 == null || prevS20 == null || prevS50 == null) return 'hold';
  if (prevS20 <= prevS50 && s20 > s50) return 'buy';
  if (prevS20 >= prevS50 && s20 < s50) return 'sell';
  return 'hold';
}

/** Shared fallback for strategies without real pattern-detection logic yet. */
function proxySignal(s: StrategySeries, i: number): StrategySignal {
  const s20 = s.sma20[i];
  const s50 = s.sma50[i];
  const r = s.rsi14[i];
  if (s20 == null || s50 == null || r == null) return 'hold';
  const trendUp = s20 > s50;
  if (trendUp && r < 45) return 'buy';
  if (!trendUp && r > 55) return 'sell';
  return 'hold';
}

export function computeStrategySignal(strategy: StrategyId, s: StrategySeries, i: number): StrategySignal {
  switch (strategy) {
    case 'mean-reversion': return meanReversionSignal(s, i);
    case 'trend-follow': return trendFollowSignal(s, i);
    case 'pdh': return pdhSignal(s, i);
    case 'golden-pocket': return goldenPocketSignal(s, i);
    case 'fib-retracement': return fibRetracementSignal(s, i);
    default: return proxySignal(s, i);
  }
}
