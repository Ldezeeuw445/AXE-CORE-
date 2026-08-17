/**
 * MetaAPI historical candles — same hosts as AXE-COMPANION-OS metaApiClient.
 * Maps tickVolume / realVolume into a single usable volume field for the desk.
 */
import { getMetaApiConfig, type MetaApiRegion } from '@/infrastructure/gateways/metaApiService';
import { resolveBrokerSymbol } from '@/infrastructure/gateways/metaApiSymbolResolver';

export type MetaApiCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
  volume?: number;
};

const MARKET_DATA_HOST: Record<MetaApiRegion, string> = {
  london: 'https://mt-market-data-client-api-v1.london.agiliumtrade.ai',
  'new-york': 'https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai',
  singapore: 'https://mt-market-data-client-api-v1.singapore.agiliumtrade.ai',
  tokyo: 'https://mt-market-data-client-api-v1.tokyo.agiliumtrade.ai',
};


export type MetaApiTimeframe =
  | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'
  | 'h1' | 'h4' | 'd1';

function normalizeTf(tf: string): string {
  const t = tf.toLowerCase();
  if (t === 'h1' || t === '1h') return '1h';
  if (t === 'h4' || t === '4h') return '4h';
  if (t === 'd1' || t === '1d') return '1d';
  return t;
}

/**
 * MetaAPI caps concurrent historical-market-data requests per account
 * (422 internalError "too many concurrent historical market data requests"
 * once exceeded). The chart mounts two independent callers at once — the
 * full-history load and useLiveChartPolling's immediate first poll — so
 * without serializing here they race past that cap and the chart renders
 * empty. Global semaphore covers every caller of this module, not just chart.
 */
const MAX_CONCURRENT_CANDLE_REQUESTS = 2;
let inFlightCandleRequests = 0;
const candleRequestWaiters: Array<() => void> = [];

function acquireCandleSlot(): Promise<() => void> {
  const release = () => {
    inFlightCandleRequests--;
    const next = candleRequestWaiters.shift();
    if (next) next();
  };
  if (inFlightCandleRequests < MAX_CONCURRENT_CANDLE_REQUESTS) {
    inFlightCandleRequests++;
    return Promise.resolve(release);
  }
  return new Promise((resolve) => {
    candleRequestWaiters.push(() => {
      inFlightCandleRequests++;
      resolve(release);
    });
  });
}

export async function metaApiGetHistoricalCandles(input: {
  symbol: string;
  timeframe?: string;
  limit?: number;
  /** ISO time — return candles ending at/before this (MetaAPI pagination). */
  startTime?: string;
}): Promise<{ ok: true; candles: MetaApiCandle[] } | { ok: false; error: string }> {
  const release = await acquireCandleSlot();
  try {
    return await metaApiGetHistoricalCandlesInner(input);
  } finally {
    release();
  }
}

/**
 * Paginated history: MetaAPI caps each call at 1000 candles, so a longer
 * backtest window is assembled by walking backwards in ≤1000 batches
 * (each next batch's startTime = the oldest candle seen so far). Stops when
 * `total` is reached, a batch comes back empty, or it stops making progress.
 */
export async function metaApiGetHistoricalCandlesPaged(input: {
  symbol: string;
  timeframe?: string;
  total: number;
}): Promise<{ ok: true; candles: MetaApiCandle[] } | { ok: false; error: string }> {
  const target = Math.min(Math.max(60, input.total), 20_000);
  const seen = new Map<string, MetaApiCandle>();
  let startTime: string | undefined;
  let lastOldest: string | undefined;

  for (let page = 0; page < 30 && seen.size < target; page++) {
    const batchLimit = Math.min(1000, target - seen.size + 1); // +1: startTime candle overlaps
    const res = await metaApiGetHistoricalCandles({ symbol: input.symbol, timeframe: input.timeframe, limit: batchLimit, startTime });
    if (!res.ok) return page === 0 ? res : { ok: true, candles: sortDedup(seen) };
    if (res.candles.length === 0) break;
    for (const c of res.candles) seen.set(c.time, c);
    const oldest = res.candles.reduce((a, c) => (c.time < a ? c.time : a), res.candles[0].time);
    if (oldest === lastOldest) break; // no older data available — stop
    lastOldest = oldest;
    startTime = oldest;
  }
  return { ok: true, candles: sortDedup(seen) };
}

function sortDedup(seen: Map<string, MetaApiCandle>): MetaApiCandle[] {
  return [...seen.values()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

async function metaApiGetHistoricalCandlesInner(input: {
  symbol: string;
  timeframe?: string;
  limit?: number;
  startTime?: string;
}): Promise<{ ok: true; candles: MetaApiCandle[] } | { ok: false; error: string }> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.token || !cfg.accountId) {
    return { ok: false, error: 'MetaAPI not configured (token + account id)' };
  }

  const region = cfg.region || 'london';
  const base = MARKET_DATA_HOST[region] || MARKET_DATA_HOST.london;
  const requestedSymbol = input.symbol.replace(/[^A-Za-z0-9._]/g, '').toUpperCase() || 'XAUUSD';
  const tf = encodeURIComponent(normalizeTf(input.timeframe || '1h'));
  const limit = Math.min(Math.max(1, input.limit ?? 300), 1000);

  const startParam = input.startTime ? `&startTime=${encodeURIComponent(input.startTime)}` : '';
  const fetchCandles = (symbol: string) =>
    fetch(
      `${base}/users/current/accounts/${encodeURIComponent(cfg.accountId)}` +
        `/historical-market-data/symbols/${encodeURIComponent(symbol)}/timeframes/${tf}/candles?limit=${limit}${startParam}`,
      { method: 'GET', headers: { Accept: 'application/json', 'auth-token': cfg.token } },
    );

  try {
    let res = await fetchCandles(requestedSymbol);
    let errText = res.ok ? '' : await res.text();

    if (!res.ok && /does not exist|not found|invalid symbol/i.test(errText)) {
      const resolved = await resolveBrokerSymbol(requestedSymbol, { token: cfg.token, accountId: cfg.accountId, region });
      if (resolved && resolved.toUpperCase() !== requestedSymbol) {
        res = await fetchCandles(resolved);
        errText = res.ok ? '' : await res.text();
      }
    }

    if (!res.ok) {
      return { ok: false, error: `Candles ${res.status}: ${errText.slice(0, 220)}` };
    }
    const body = await res.json();
    if (!Array.isArray(body)) return { ok: true, candles: [] };
    const candles: MetaApiCandle[] = body.map((c: Record<string, unknown>) => {
      const tick =
        c.tickVolume != null ? Number(c.tickVolume)
        : c.tick_volume != null ? Number(c.tick_volume)
        : undefined;
      const real =
        c.realVolume != null ? Number(c.realVolume)
        : c.real_volume != null ? Number(c.real_volume)
        : c.volume != null ? Number(c.volume)
        : undefined;
      const vol = Number.isFinite(tick as number) && (tick as number) > 0
        ? (tick as number)
        : Number.isFinite(real as number) ? (real as number) : undefined;
      return {
        time: String(c.time ?? ''),
        open: Number(c.open) || 0,
        high: Number(c.high) || 0,
        low: Number(c.low) || 0,
        close: Number(c.close) || 0,
        tickVolume: vol,
        volume: vol,
      };
    });
    return { ok: true, candles };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
