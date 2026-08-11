/**
 * strategySignals — ONE shared signal function for every strategy in the
 * STRATEGIES catalog, used by BOTH backtestEngine.ts and
 * tradingAgentEngine.ts. Previously each had its own copy (backtest had a
 * signalAt() with only mean-reversion/trend-follow distinct; live trading
 * didn't use strategy at all) — a live cycle could never be compared
 * against its own backtest because they weren't running the same logic.
 * Now they are, for every strategy that has real logic.
 *
 * 8 of 9 are genuinely distinct: mean-reversion, trend-follow, pdh
 * (previous day high/low breakout), golden-pocket (0.618-0.65 fib
 * retracement zone), fib-retracement (broader 0.382/0.5/0.618 levels),
 * plus three ported from the canvas-only detection logic in
 * ChartIndicatorLayer.tsx (structurePivots/buildStructureOverlay,
 * buildVolumetricBreakdown, buildInverseFvgs) as pure, replayable
 * functions — smc-structure (fractal-pivot break of structure),
 * volumetric-ob (order block validated by real tick volume, degrades to
 * 'hold' rather than a fake signal when the broker doesn't supply volume
 * for a symbol), ifvg (3-candle fair value gap that's since inverted
 * polarity). Only crew-hybrid stays a proxy — it's meant to weight live
 * CrewAI intel, which by definition has no historical archive to replay
 * (see backtestEngine.ts's own note on this), so a backtest genuinely
 * cannot be more real for it.
 */

export type StrategyId =
  | 'mean-reversion' | 'trend-follow' | 'pdh' | 'golden-pocket' | 'fib-retracement'
  | 'smc-structure' | 'volumetric-ob' | 'ifvg' | 'crew-hybrid';

export const DISTINCT_STRATEGIES: ReadonlySet<StrategyId> = new Set([
  'mean-reversion', 'trend-follow', 'pdh', 'golden-pocket', 'fib-retracement',
  'smc-structure', 'volumetric-ob', 'ifvg',
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
  /** Tick/real volume, same index alignment. Optional — FX symbols from
   *  some sources have none. volumetric-ob degrades to 'hold' without it
   *  rather than inventing a number. */
  volumes?: number[];
  /** Real candle opens, same index alignment. Optional — when absent,
   *  volumetric-ob substitutes the previous close as the direction
   *  reference (still real data, just less precise than a true open). */
  opens?: number[];
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

/** Shared fallback — only crew-hybrid still uses this. It's meant to weight
 *  live CrewAI intel, which has no historical archive to replay, so a
 *  backtest genuinely cannot be more real for it than this technical blend
 *  (see backtestEngine.ts's own note). */
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

/** Trailing average true range ending at index i — same formula as
 *  ChartIndicatorLayer.tsx's atr() / marketDataService.ts's atr(), just
 *  evaluable at any historical index instead of only the latest bar. */
function atrAt(s: StrategySeries, i: number, period = 14): number | null {
  const start = Math.max(1, i - period + 1);
  if (i - start < period - 1) return null;
  let sum = 0;
  for (let j = start; j <= i; j++) {
    sum += Math.max(
      s.highs[j] - s.lows[j],
      Math.abs(s.highs[j] - s.closes[j - 1]),
      Math.abs(s.lows[j] - s.closes[j - 1]),
    );
  }
  return sum / (i - start + 1);
}

/** Fractal pivot detection — same rule ChartIndicatorLayer.tsx's
 *  structurePivots() uses for the chart overlay (a candle is a confirmed
 *  swing once `strength` bars have printed on both sides), as a pure
 *  lookback scan instead of a canvas-coordinate rendering pass. */
function isSwingHigh(s: StrategySeries, j: number, strength: number): boolean {
  for (let k = j - strength; k < j; k++) if (s.highs[k] >= s.highs[j]) return false;
  for (let k = j + 1; k <= j + strength; k++) if (s.highs[k] > s.highs[j]) return false;
  return true;
}
function isSwingLow(s: StrategySeries, j: number, strength: number): boolean {
  for (let k = j - strength; k < j; k++) if (s.lows[k] <= s.lows[j]) return false;
  for (let k = j + 1; k <= j + strength; k++) if (s.lows[k] < s.lows[j]) return false;
  return true;
}

/** smc-structure: break of structure off the most recent confirmed swing
 *  point — buy when close breaks above the last confirmed swing high,
 *  sell when it breaks below the last confirmed swing low. Only pivots
 *  confirmed by index i (j + strength <= i) are visible, so this never
 *  looks ahead of what a live cycle would actually have seen. */
function smcStructureSignal(s: StrategySeries, i: number): StrategySignal {
  const strength = 3;
  const lookback = 80;
  const start = Math.max(strength, i - lookback);
  let lastSwingHigh: number | null = null;
  let lastSwingLow: number | null = null;
  for (let j = i - strength; j >= start; j--) {
    if (lastSwingHigh == null && isSwingHigh(s, j, strength)) lastSwingHigh = s.highs[j];
    if (lastSwingLow == null && isSwingLow(s, j, strength)) lastSwingLow = s.lows[j];
    if (lastSwingHigh != null && lastSwingLow != null) break;
  }
  const c = s.closes[i];
  const prevC = s.closes[i - 1];
  if (lastSwingHigh != null && prevC <= lastSwingHigh && c > lastSwingHigh) return 'buy';
  if (lastSwingLow != null && prevC >= lastSwingLow && c < lastSwingLow) return 'sell';
  return 'hold';
}

/** ifvg: 3-candle fair value gap whose polarity has since inverted (price
 *  closed back through it) — the same pattern ChartIndicatorLayer.tsx's
 *  buildInverseFvgs() renders, including its 0.25x-ATR minimum gap filter.
 *  Signals when price is trading back inside an inverted, not-yet-fully-
 *  reclaimed zone, in the zone's new direction. Scans newest-first so the
 *  most recent applicable zone wins. */
function ifvgSignal(s: StrategySeries, i: number): StrategySignal {
  const ATR_MULT = 0.25;
  const lookback = 80;
  const start = Math.max(2, i - lookback);
  const c = s.closes[i];

  for (let k = i - 1; k >= start; k--) {
    const a2 = k - 2;
    const a1 = k - 1;
    if (a2 < 0) break;
    const gapThreshold = (atrAt(s, k, 14) ?? 0) * ATR_MULT;

    // Bullish FVG at k: low[k] > high[k-2] and close[k-1] > high[k-2].
    // Inverted once a later close breaks back below the gap's bottom;
    // cancelled ("second mitigation") if an even later close reclaims
    // back above the gap's top.
    if (s.lows[k] > s.highs[a2] && s.closes[a1] > s.highs[a2]) {
      const gapTop = s.lows[k];
      const gapBot = s.highs[a2];
      if (Math.abs(gapTop - gapBot) > gapThreshold) {
        let invertedIdx = -1;
        for (let m = k + 1; m <= i; m++) {
          if (s.closes[m] < gapBot) { invertedIdx = m; break; }
        }
        if (invertedIdx >= 0 && invertedIdx < i) {
          let reclaimed = false;
          for (let m = invertedIdx + 1; m <= i; m++) {
            if (s.closes[m] > gapTop) { reclaimed = true; break; }
          }
          if (!reclaimed && c <= gapTop && c >= gapBot) return 'sell';
        }
      }
    }

    // Bearish FVG at k: high[k] < low[k-2] and close[k-1] < low[k-2].
    if (s.highs[k] < s.lows[a2] && s.closes[a1] < s.lows[a2]) {
      const gapTop = s.lows[a2];
      const gapBot = s.highs[k];
      if (Math.abs(gapTop - gapBot) > gapThreshold) {
        let invertedIdx = -1;
        for (let m = k + 1; m <= i; m++) {
          if (s.closes[m] > gapTop) { invertedIdx = m; break; }
        }
        if (invertedIdx >= 0 && invertedIdx < i) {
          let reclaimed = false;
          for (let m = invertedIdx + 1; m <= i; m++) {
            if (s.closes[m] < gapBot) { reclaimed = true; break; }
          }
          if (!reclaimed && c <= gapTop && c >= gapBot) return 'buy';
        }
      }
    }
  }
  return 'hold';
}

/** volumetric-ob: order block validated by real tick volume — the last
 *  opposite-colored candle before a strong, volume-confirmed impulsive
 *  move (same validation buildVolumetricBreakdown() applies: real
 *  tickVolume/volume only, never synthesised). Buy when price returns
 *  into an unmitigated bullish OB, sell into a bearish one. Returns 'hold'
 *  with no volume data at all rather than inventing a number. */
function volumetricObSignal(s: StrategySeries, i: number): StrategySignal {
  const volumes = s.volumes;
  if (!volumes || volumes.length !== s.closes.length) return 'hold';
  const opens = s.opens;
  const openAt = (j: number) => opens?.[j] ?? (j > 0 ? s.closes[j - 1] : s.closes[j]);

  const lookback = 60;
  const start = Math.max(21, i - lookback);
  const c = s.closes[i];

  for (let j = i - 1; j >= start; j--) {
    const body = Math.abs(s.closes[j] - openAt(j));
    let avgBody = 0, avgVol = 0, n = 0;
    for (let k = Math.max(1, j - 20); k < j; k++) {
      avgBody += Math.abs(s.closes[k] - openAt(k));
      avgVol += volumes[k];
      n++;
    }
    if (n === 0) continue;
    avgBody /= n;
    avgVol /= n;
    if (avgBody <= 0 || avgVol <= 0) continue;
    if (!(body > avgBody * 1.8 && volumes[j] > avgVol * 1.3)) continue;

    const bullishImpulse = s.closes[j] > openAt(j);
    let obIdx = -1;
    for (let m = j - 1; m >= Math.max(0, j - 5); m--) {
      const mUp = s.closes[m] > openAt(m);
      if (bullishImpulse ? !mUp : mUp) { obIdx = m; break; }
    }
    if (obIdx < 0) continue;

    const obHigh = s.highs[obIdx];
    const obLow = s.lows[obIdx];
    let mitigated = false;
    for (let m = j + 1; m < i; m++) {
      if (bullishImpulse ? s.closes[m] < obLow : s.closes[m] > obHigh) { mitigated = true; break; }
    }
    if (mitigated) continue;

    if (c <= obHigh && c >= obLow) return bullishImpulse ? 'buy' : 'sell';
  }
  return 'hold';
}

export function computeStrategySignal(strategy: StrategyId, s: StrategySeries, i: number): StrategySignal {
  switch (strategy) {
    case 'mean-reversion': return meanReversionSignal(s, i);
    case 'trend-follow': return trendFollowSignal(s, i);
    case 'pdh': return pdhSignal(s, i);
    case 'golden-pocket': return goldenPocketSignal(s, i);
    case 'fib-retracement': return fibRetracementSignal(s, i);
    case 'smc-structure': return smcStructureSignal(s, i);
    case 'ifvg': return ifvgSignal(s, i);
    case 'volumetric-ob': return volumetricObSignal(s, i);
    default: return proxySignal(s, i);
  }
}
