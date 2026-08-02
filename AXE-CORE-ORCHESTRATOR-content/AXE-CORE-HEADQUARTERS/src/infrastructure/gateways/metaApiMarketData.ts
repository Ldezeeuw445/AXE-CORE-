/**
 * MetaAPI historical candles — same hosts as AXE-COMPANION-OS metaApiClient.
 * Companion is NOT modified; this is a port for CORE only.
 */
import { getMetaApiConfig, type MetaApiRegion } from '@/infrastructure/gateways/metaApiService';

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

/** MetaAPI timeframe codes */
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

export async function metaApiGetHistoricalCandles(input: {
  symbol: string;
  timeframe?: string;
  limit?: number;
}): Promise<{ ok: true; candles: MetaApiCandle[] } | { ok: false; error: string }> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.token || !cfg.accountId) {
    return { ok: false, error: 'MetaAPI not configured (token + account id)' };
  }

  const region = cfg.region || 'london';
  const base = MARKET_DATA_HOST[region] || MARKET_DATA_HOST.london;
  const symbol = encodeURIComponent(input.symbol.replace(/[^A-Za-z0-9._]/g, '').toUpperCase() || 'XAUUSD');
  const tf = encodeURIComponent(normalizeTf(input.timeframe || '1h'));
  const limit = Math.min(Math.max(1, input.limit ?? 300), 1000);
  const url =
    `${base}/users/current/accounts/${encodeURIComponent(cfg.accountId)}` +
    `/historical-market-data/symbols/${symbol}/timeframes/${tf}/candles?limit=${limit}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'auth-token': cfg.token,
      },
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Candles ${res.status}: ${t.slice(0, 220)}` };
    }
    const body = await res.json();
    if (!Array.isArray(body)) return { ok: true, candles: [] };
    const candles: MetaApiCandle[] = body.map((c: Record<string, unknown>) => ({
      time: String(c.time ?? ''),
      open: Number(c.open) || 0,
      high: Number(c.high) || 0,
      low: Number(c.low) || 0,
      close: Number(c.close) || 0,
      tickVolume: c.tickVolume != null ? Number(c.tickVolume) : undefined,
      volume: c.volume != null ? Number(c.volume) : undefined,
    }));
    return { ok: true, candles };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
