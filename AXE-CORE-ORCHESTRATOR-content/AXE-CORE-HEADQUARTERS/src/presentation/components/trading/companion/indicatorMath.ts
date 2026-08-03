/** Indicator math helpers for Companion IndicatorLayer. */
export type IndicatorMathCandle = {
  time: number; open: number; high: number; low: number; close: number;
  tickVolume?: number | null; volume?: number | null;
};
export type BollingerPoint = { middle: number | null; upper: number | null; lower: number | null };
export function smaSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    if (i + 1 >= period) out[i] = sum / period;
  }
  return out;
}
export function emaSeries(values: Array<number | null>, period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0) return out;
  const m = 2 / (period + 1);
  let ema: number | null = null;
  const seed: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (ema == null) {
      seed.push(v);
      if (seed.length === period) { ema = seed.reduce((a, b) => a + b, 0) / period; out[i] = ema; }
      continue;
    }
    ema = (v - ema) * m + ema;
    out[i] = ema;
  }
  return out;
}
function stddevSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    out[i] = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  }
  return out;
}
export function bollingerBands(values: number[], period = 20, multiplier = 2): BollingerPoint[] {
  const middle = smaSeries(values, period);
  const deviation = stddevSeries(values, period);
  return values.map((_, i) => {
    const mid = middle[i]; const dev = deviation[i];
    if (mid == null || dev == null) return { middle: mid, upper: null, lower: null };
    return { middle: mid, upper: mid + dev * multiplier, lower: mid - dev * multiplier };
  });
}
function utcSessionKey(timeSec: number): string {
  const d = new Date(timeSec * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}
export function sessionVwap(candles: IndicatorMathCandle[]): Array<number | null> {
  const out: Array<number | null> = Array(candles.length).fill(null);
  let sessionKey: string | null = null; let pvSum = 0; let volumeSum = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const nextKey = utcSessionKey(c.time);
    if (nextKey !== sessionKey) { sessionKey = nextKey; pvSum = 0; volumeSum = 0; }
    const vol = c.tickVolume ?? c.volume ?? 0;
    const typical = (c.high + c.low + c.close) / 3;
    pvSum += typical * vol; volumeSum += vol;
    out[i] = volumeSum > 0 ? pvSum / volumeSum : null;
  }
  return out;
}
export function pointOfControl(candles: IndicatorMathCandle[], lookback = 100, bins = 50): { price: number; volume: number } | null {
  const slice = candles.slice(-lookback);
  if (!slice.length) return null;
  const low = Math.min(...slice.map(c => c.low));
  const high = Math.max(...slice.map(c => c.high));
  const range = high - low;
  if (!Number.isFinite(range) || range <= 0) return null;
  const weights = Array(Math.max(2, bins)).fill(0) as number[];
  const step = range / weights.length;
  for (const c of slice) {
    const mid = (c.high + c.low) / 2;
    const idx = Math.min(weights.length - 1, Math.max(0, Math.floor((mid - low) / step)));
    weights[idx] += c.tickVolume ?? c.volume ?? 1;
  }
  let bestIdx = 0; let bestVol = -1;
  for (let i = 0; i < weights.length; i++) if (weights[i] > bestVol) { bestVol = weights[i]; bestIdx = i; }
  return { price: low + (bestIdx + 0.5) * step, volume: bestVol };
}
export function atrSeries(candles: IndicatorMathCandle[], period: number): number[] {
  const out: number[] = Array(candles.length).fill(0);
  if (period <= 0 || !candles.length) return out;
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) tr.push(c.high - c.low);
    else {
      const p = candles[i - 1];
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
  }
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    sum += tr[i];
    if (i >= period) sum -= tr[i - period];
    if (i + 1 >= period) out[i] = sum / period;
  }
  return out;
}
