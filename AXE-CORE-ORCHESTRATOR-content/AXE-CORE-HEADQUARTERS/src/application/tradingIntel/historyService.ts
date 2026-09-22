/**
 * historyService — historische candles uit de cache, en alleen het ontbrekende
 * bij de provider.
 *
 * MetaAPI: de serie groeit aan twee kanten. Nieuwer door vanaf nu terug te
 * bladeren tot de pagina's de cache raken; ouder door vanaf de oudste bar terug
 * te bladeren tot de From-datum of tot MetaAPI niets ouders meer heeft (dan
 * wordt de serie `exhausted` en wordt er nooit meer om gevraagd). Elke pagina
 * gaat met achtergrondprioriteit door het MetaAPI-budget, één tegelijk, met een
 * korte pauze — een backfill mag de live motor nooit zijn quotum afnemen.
 *
 * TwelveData heeft op onze VPS geen datumbereik, alleen "de laatste N". Die
 * pagina wordt samengevoegd met wat er al was; hoe diep dat reikt, staat in de
 * dekking. Er wordt niets beloofd wat er niet is.
 */
import {
  barMs, coverageOf, mergeCandles, needsNewer, needsOlder, seriesKey, sliceRange,
  type CachedCandle, type CachedSeries, type CandleProvider, type SeriesCoverage,
} from '@/domain/tradingIntel/candleCache';
import { canonicalTimeframe } from '@/domain/tradingIntel/timeframes';
import { metaApiGetHistoricalCandles } from '@/infrastructure/gateways/metaApiMarketData';
import { fetchHistoricalCandles } from '@/infrastructure/gateways/axeCoreApiService';
import { candleStore } from '@/infrastructure/persistence/candleStore';

/** Hooguit zoveel pagina's per aanvraag: 40 × 1000 bars. Meer is een tweede aanvraag. */
const MAX_PAGES = 40;
const PAGE = 1000;
const PAUSE_MS = 250;

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

type MetaCandle = { time: string; open: number; high: number; low: number; close: number; tickVolume?: number; volume?: number };
const toCached = (c: MetaCandle): CachedCandle => ({
  time: new Date(c.time).toISOString(), open: c.open, high: c.high, low: c.low, close: c.close,
  volume: c.tickVolume ?? c.volume,
});

export interface HistoryRequest {
  symbol: string;
  timeframe: string;
  provider?: CandleProvider;
  from?: string | null;
  to?: string | null;
  /** Minstens zoveel bars in de serie (als er geen From is). */
  minBars?: number;
  onProgress?: (msg: string) => void;
}

export interface HistoryResult {
  ok: true;
  candles: CachedCandle[];
  coverage: SeriesCoverage;
  provider: CandleProvider;
  pagesFetched: number;
  fromCache: boolean;
}

async function extendMetaApi(
  series: CachedSeries,
  fromMs: number | null,
  minBars: number,
  onProgress?: (m: string) => void,
): Promise<{ series: CachedSeries; pages: number; error?: string }> {
  let pages = 0;
  let s = series;

  // Nieuwer: vanaf nu terug tot de pagina's de cache raken.
  if (needsNewer(s, Date.now())) {
    const newestCached = s.candles[s.candles.length - 1]?.time ?? null;
    let startTime: string | undefined;
    for (let p = 0; p < MAX_PAGES; p++) {
      const res = await metaApiGetHistoricalCandles({ symbol: s.symbol, timeframe: s.timeframe, limit: PAGE, startTime, priority: 'background' });
      pages += 1;
      if (!res.ok) return { series: s, pages, error: res.error };
      if (!res.candles.length) break;
      const batch = res.candles.map(toCached);
      s = { ...s, candles: mergeCandles(s.candles, batch) };
      const oldest = batch.reduce((a, c) => (c.time < a ? c.time : a), batch[0].time);
      onProgress?.(`${s.symbol} ${s.timeframe}: newer bars back to ${oldest.slice(0, 10)}`);
      if (!newestCached || oldest <= newestCached || oldest === startTime) break;
      startTime = oldest;
      await pause(PAUSE_MS);
    }
  }

  // Ouder: vanaf de oudste bar terug tot From, of tot er niets ouders meer is.
  let guard = 0;
  while (needsOlder(s, fromMs, minBars) && guard < MAX_PAGES) {
    guard += 1;
    const oldest = s.candles[0]?.time;
    const res = await metaApiGetHistoricalCandles({ symbol: s.symbol, timeframe: s.timeframe, limit: PAGE, startTime: oldest, priority: 'background' });
    pages += 1;
    if (!res.ok) return { series: s, pages, error: res.error };
    const batch = res.candles.map(toCached).filter(c => !oldest || c.time < oldest);
    if (!batch.length) { s = { ...s, exhaustedBefore: true }; break; }
    s = { ...s, candles: mergeCandles(s.candles, batch) };
    onProgress?.(`${s.symbol} ${s.timeframe}: history back to ${s.candles[0].time.slice(0, 10)} (${s.candles.length} bars)`);
    await pause(PAUSE_MS);
  }
  return { series: s, pages };
}

export async function getHistory(input: HistoryRequest): Promise<HistoryResult | { ok: false; error: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  const tf = canonicalTimeframe(input.timeframe);
  if (!tf) return { ok: false, error: `Unknown timeframe ${input.timeframe}` };
  const provider = input.provider ?? 'metaapi';
  const key = seriesKey(symbol, tf, provider);
  const store = candleStore();
  const cached = await store.get(key).catch(() => null);
  const empty: CachedSeries = { symbol, timeframe: tf, provider, candles: [], exhaustedBefore: false, updatedAt: new Date().toISOString() };
  let series = cached ?? empty;
  const fromMs = input.from ? Date.parse(input.from) : null;
  const toMs = input.to ? Date.parse(input.to) : null;
  const minBars = input.minBars ?? 300;
  let pages = 0;
  let error: string | undefined;

  const wantsNewer = (toMs == null || toMs > Date.now() - 2 * barMs(tf)) && needsNewer(series, Date.now());
  const wantsOlder = needsOlder(series, fromMs, minBars);

  if (provider === 'metaapi' && (wantsNewer || wantsOlder)) {
    const r = await extendMetaApi(series, fromMs, minBars, input.onProgress);
    series = r.series; pages = r.pages; error = r.error;
  } else if (provider === 'twelvedata' && (wantsNewer || wantsOlder)) {
    try {
      const r = await fetchHistoricalCandles(symbol, input.timeframe, 5000);
      pages = 1;
      const merged = mergeCandles(series.candles, r.candles.map(c => ({ ...c, time: new Date(c.time).toISOString() })));
      // Wat TwelveData als oudste geeft, is zijn grens voor "de laatste 5000".
      series = { ...series, candles: merged, exhaustedBefore: true };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  if (pages > 0) {
    series = { ...series, updatedAt: new Date().toISOString() };
    await store.put(key, series).catch(() => undefined);
  }
  if (!series.candles.length) return { ok: false, error: error ?? `No ${provider} history for ${symbol} ${tf}` };
  const candles = sliceRange(series.candles, fromMs, toMs);
  return { ok: true, candles, coverage: coverageOf(series), provider, pagesFetched: pages, fromCache: pages === 0 };
}

/** Wat er per (symbool × timeframe × provider) werkelijk bewaard is. */
export async function historyCoverage(): Promise<SeriesCoverage[]> {
  const store = candleStore();
  const keys = await store.keys().catch(() => [] as string[]);
  const out: SeriesCoverage[] = [];
  for (const k of keys) {
    const s = await store.get(k).catch(() => null);
    if (s) out.push(coverageOf(s));
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.timeframe.localeCompare(b.timeframe) || a.provider.localeCompare(b.provider));
}
