/**
 * candleCache — de regels van de historische candle-opslag, zonder opslag.
 *
 * Elke backtest haalde zijn geschiedenis opnieuw op: MetaAPI in pagina's van
 * 1000 tot een plafond van 20 000, of één TwelveData-aanroep van hooguit 5000.
 * Dezelfde uren goud werden tientallen keren gedownload, en niemand kon zeggen
 * hoe ver de geschiedenis van een paar werkelijk teruggaat — dus beloofde de UI
 * "20 000 bars" terwijl TwelveData er stil 5000 gaf.
 *
 * Een serie is (symbool × timeframe × provider). Hij groeit aan twee kanten:
 * nieuwer (vanaf de laatste bar tot nu) en ouder (terug tot de gevraagde
 * From-datum, of tot de provider niets meer heeft — dan staat `exhausted` aan en
 * wordt er niet opnieuw gevraagd). Wat er is, is wat er gerapporteerd wordt.
 */
import { canonicalTimeframe, type Timeframe } from '@/domain/tradingIntel/timeframes';

export type CandleProvider = 'metaapi' | 'twelvedata';

export interface CachedCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CachedSeries {
  symbol: string;
  timeframe: Timeframe;
  provider: CandleProvider;
  /** Oplopend in tijd, zonder dubbelen. */
  candles: CachedCandle[];
  /** De provider gaf niets ouders meer: verder terug bestaat er voor hem niet. */
  exhaustedBefore: boolean;
  updatedAt: string;
}

export interface SeriesCoverage {
  symbol: string;
  timeframe: Timeframe;
  provider: CandleProvider;
  from: string | null;
  to: string | null;
  count: number;
  /** Echte diepte in dagen (van eerste tot laatste bar). */
  days: number;
  exhaustedBefore: boolean;
  updatedAt: string;
}

const BAR_MS: Record<Timeframe, number> = {
  m5: 5 * 60_000,
  m15: 15 * 60_000,
  m30: 30 * 60_000,
  h1: 60 * 60_000,
  h4: 4 * 60 * 60_000,
  d1: 24 * 60 * 60_000,
};

export function seriesKey(symbol: string, timeframe: string, provider: CandleProvider): string {
  const tf = canonicalTimeframe(timeframe) ?? 'h1';
  return `${provider}:${symbol.trim().toUpperCase()}:${tf}`;
}

export function barMs(timeframe: string): number {
  return BAR_MS[canonicalTimeframe(timeframe) ?? 'h1'];
}

/** Samenvoegen op tijd; bij dezelfde tijd wint de nieuwste (een bar die nog liep). */
export function mergeCandles(existing: readonly CachedCandle[], incoming: readonly CachedCandle[]): CachedCandle[] {
  const byTime = new Map<string, CachedCandle>();
  for (const c of existing) byTime.set(c.time, c);
  for (const c of incoming) {
    if (!c || !Number.isFinite(c.open) || !Number.isFinite(c.close) || !c.time) continue;
    byTime.set(c.time, c);
  }
  return [...byTime.values()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export function coverageOf(s: CachedSeries): SeriesCoverage {
  const from = s.candles[0]?.time ?? null;
  const to = s.candles[s.candles.length - 1]?.time ?? null;
  const days = from && to ? (Date.parse(to) - Date.parse(from)) / 86_400_000 : 0;
  return {
    symbol: s.symbol, timeframe: s.timeframe, provider: s.provider,
    from, to, count: s.candles.length, days: Math.round(days * 10) / 10,
    exhaustedBefore: s.exhaustedBefore, updatedAt: s.updatedAt,
  };
}

/**
 * Moet er nieuwer opgehaald worden? Ja als de laatste bar meer dan twee bars
 * oud is — één lopende bar is normaal, en het weekend van FX ook: daarom geeft
 * de aanroeper `now` door en niet deze functie zelf de klok.
 */
export function needsNewer(s: CachedSeries | null, now: number): boolean {
  if (!s || !s.candles.length) return true;
  const last = Date.parse(s.candles[s.candles.length - 1].time);
  return now - last > 2 * BAR_MS[s.timeframe];
}

/** Moet er ouder opgehaald worden om `fromMs` te halen? Nooit als de provider op is. */
export function needsOlder(s: CachedSeries | null, fromMs: number | null, minBars: number): boolean {
  if (!s || !s.candles.length) return true;
  if (s.exhaustedBefore) return false;
  if (s.candles.length < minBars) return true;
  if (fromMs == null) return false;
  return Date.parse(s.candles[0].time) > fromMs;
}

/** Het deel van de serie binnen [from, to]. */
export function sliceRange(candles: readonly CachedCandle[], fromMs: number | null, toMs: number | null): CachedCandle[] {
  return candles.filter(c => {
    const t = Date.parse(c.time);
    return (fromMs == null || t >= fromMs) && (toMs == null || t <= toMs);
  });
}
