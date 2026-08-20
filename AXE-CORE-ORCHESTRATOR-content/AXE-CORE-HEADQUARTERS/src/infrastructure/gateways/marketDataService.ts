/**
 * marketDataService — market OHLC for charts / demo marks / agent decisions.
 * Real MT5 via MetaAPI when connected (preferred — see fetchMarketSnapshot).
 * Crypto via Binance public API (no key). Equities best-effort via Stooq CSV.
 * Synthetic random-walk only as an offline-safe last resort.
 */
import type { MarketSnapshot, OhlcBar } from '@/domain/tradingIntel/demoTypes';
import { getMetaApiConfig, toMt5Symbol } from '@/infrastructure/gateways/metaApiService';
import { metaApiGetHistoricalCandles } from '@/infrastructure/gateways/metaApiMarketData';

/**
 * Tries the connected real MT5 account first. This didn't exist before —
 * fetchMarketSnapshot only ever tried Binance/Stooq, both of which have no
 * coverage for indices (US30/NAS100/DJ30/...) and unreliable coverage for
 * FX/metals, silently falling through to a fake seeded-at-100 random walk.
 * The agent then sized positions off that fake price (risk budget ÷ price),
 * which for something like US30 (~40,000) vs. a fake ~100-106 price means
 * roughly 400x oversized qty going into brokerConnector's lot conversion —
 * bounded by its 1-lot cap, but still wrong risk math on a real account.
 */
/**
 * MT5 names timeframes m15/h1/h4/d1; Binance names the same things 15m/1h/4h/1d.
 * One map, so a caller can ask for a timeframe without knowing which source
 * will answer.
 */
const BINANCE_INTERVAL: Record<string, string> = {
  m5: '5m', m15: '15m', m30: '30m', h1: '1h', h4: '4h', d1: '1d',
};

function toBinanceInterval(tf: string): string {
  return BINANCE_INTERVAL[tf.toLowerCase()] ?? '1h';
}

async function tryMetaApiSnapshot(sym: string, timeframe: string): Promise<MarketSnapshot | null> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return null;
  try {
    const res = await metaApiGetHistoricalCandles({ symbol: toMt5Symbol(sym), timeframe, limit: 120 });
    if (!res.ok || res.candles.length < 5) return null;
    const bars: OhlcBar[] = res.candles
      .map(c => ({ t: Date.parse(c.time), o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume ?? c.tickVolume }))
      .filter(b => Number.isFinite(b.t) && Number.isFinite(b.c));
    if (bars.length < 5) return null;
    const last = bars[bars.length - 1].c;
    const prev = bars[0].c;
    return {
      symbol: sym,
      source: 'metaapi',
      bars,
      last,
      changePct: prev ? ((last - prev) / prev) * 100 : undefined,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[marketData] metaapi failed', e);
    return null;
  }
}

function toBinanceSymbol(symbol: string): string | null {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.endsWith('USDT')) return s;
  if (s.endsWith('USD')) return s.replace(/USD$/, 'USDT');
  // common crypto tickers
  if (/^(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|DOT)$/.test(s)) return `${s}USDT`;
  if (s.includes('BTC') && s.length <= 10) return s.endsWith('USDT') ? s : `${s}USDT`;
  return null;
}

async function fetchBinanceKlines(binanceSym: string, interval = '1h', limit = 120): Promise<OhlcBar[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const data = (await res.json()) as unknown[];
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const r = row as (string | number)[];
    return {
      t: Number(r[0]),
      o: Number(r[1]),
      h: Number(r[2]),
      l: Number(r[3]),
      c: Number(r[4]),
      v: Number(r[5]),
    };
  }).filter(b => Number.isFinite(b.c));
}

/** Stooq daily CSV — works for some equities / forex pairs */
async function fetchStooqDaily(symbol: string): Promise<OhlcBar[]> {
  // Stooq wants lowercase ticker, e.g. aapl.us, btc.v
  let q = symbol.toLowerCase();
  if (!q.includes('.')) {
    if (/^[a-z]+$/.test(q) && q.length <= 5) q = `${q}.us`;
  }
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(q)}&i=d`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stooq ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split('\n').slice(1);
  const bars: OhlcBar[] = [];
  for (const line of lines.slice(-120)) {
    const [date, o, h, l, c, v] = line.split(',');
    if (!date || !c) continue;
    const t = Date.parse(date);
    if (!Number.isFinite(t)) continue;
    bars.push({
      t,
      o: Number(o),
      h: Number(h),
      l: Number(l),
      c: Number(c),
      v: v ? Number(v) : undefined,
    });
  }
  return bars.filter(b => Number.isFinite(b.c));
}

function synthBars(seedPrice: number): OhlcBar[] {
  const bars: OhlcBar[] = [];
  let p = seedPrice;
  const now = Date.now();
  for (let i = 120; i >= 0; i--) {
    const drift = (Math.sin(i / 8) + (Math.random() - 0.5) * 0.4) * p * 0.004;
    const o = p;
    const c = Math.max(0.01, p + drift);
    const h = Math.max(o, c) * (1 + Math.random() * 0.003);
    const l = Math.min(o, c) * (1 - Math.random() * 0.003);
    bars.push({ t: now - i * 3600_000, o, h, l, c, v: 1000 + Math.random() * 500 });
    p = c;
  }
  return bars;
}

/**
 * Candles for a symbol, on a timeframe.
 *
 * The timeframe used to be fixed at h1 in three separate places — here, in the
 * MetaAPI branch and in the Binance branch — so every live decision was an h1
 * decision no matter what anything upstream believed. That made "which
 * timeframe works for this pair" a question the system could not ask, and it
 * would have quietly made the algo's new per-pair timeframe choice decorative:
 * chosen, recorded, displayed, and then ignored at the one moment it mattered.
 */
export async function fetchMarketSnapshot(symbol: string, timeframe = 'h1'): Promise<MarketSnapshot> {
  const sym = symbol.trim().toUpperCase();
  const tf = timeframe.trim().toLowerCase() || 'h1';

  const metaSnap = await tryMetaApiSnapshot(sym, tf);
  if (metaSnap) return metaSnap;

  const binance = toBinanceSymbol(sym);

  if (binance) {
    try {
      const bars = await fetchBinanceKlines(binance, toBinanceInterval(tf));
      if (bars.length > 5) {
        const last = bars[bars.length - 1].c;
        const prev = bars[0].c;
        return {
          symbol: sym,
          source: `binance:${binance}`,
          bars,
          last,
          changePct: prev ? ((last - prev) / prev) * 100 : undefined,
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch (e) {
      console.warn('[marketData] binance failed', e);
    }
  }

  try {
    const bars = await fetchStooqDaily(sym);
    if (bars.length > 5) {
      const last = bars[bars.length - 1].c;
      const prev = bars[0].c;
      return {
        symbol: sym,
        source: 'stooq',
        bars,
        last,
        changePct: prev ? ((last - prev) / prev) * 100 : undefined,
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn('[marketData] stooq failed', e);
  }

  // Deterministic fallback so chart UI always works offline
  const seed = /BTC/i.test(sym) ? 65000 : /ETH/i.test(sym) ? 3200 : 100;
  const bars = synthBars(seed);
  return {
    symbol: sym,
    source: 'synthetic',
    bars,
    last: bars[bars.length - 1].c,
    changePct: ((bars[bars.length - 1].c - bars[0].c) / bars[0].c) * 100,
    fetchedAt: new Date().toISOString(),
  };
}

/** Simple indicator helpers for the dashboard */
export function sma(bars: OhlcBar[], period: number): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  return slice.reduce((s, b) => s + b.c, 0) / period;
}

export function rsi(bars: OhlcBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const d = bars[i].c - bars[i - 1].c;
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** Average true range — used by tradingAgentEngine to size stop-loss/take-
 *  profit distance off actual recent volatility instead of a fixed %. */
export function atr(bars: OhlcBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const slice = bars.slice(-period);
  let sum = 0;
  for (let i = 0; i < slice.length; i++) {
    const b = slice[i];
    const prevClose = i > 0 ? slice[i - 1].c : b.o;
    const trueRange = Math.max(b.h - b.l, Math.abs(b.h - prevClose), Math.abs(b.l - prevClose));
    sum += trueRange;
  }
  return sum / slice.length;
}
