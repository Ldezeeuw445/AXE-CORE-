/**
 * chartResolver — application layer.
 * Priority:
 *  1. Trading / market price series (public Binance klines — no API key)
 *  2. Income ledger (manual finance log)
 *  3. Sample series
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import {
  listIncomeEntries,
  summarizeIncome,
  INCOME_SOURCES,
} from '@/infrastructure/persistence/incomeLedgerService';

export type ChartPoint = { label: string; value: number };

function id(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function pack(
  partial: Omit<ProjectionPayload, 'id' | 'createdAt'>,
): ProjectionPayload {
  return { ...partial, id: id(), createdAt: Date.now() };
}

const SYMBOL_MAP: Record<string, string> = {
  btc: 'BTCUSDT',
  bitcoin: 'BTCUSDT',
  eth: 'ETHUSDT',
  ethereum: 'ETHUSDT',
  sol: 'SOLUSDT',
  solana: 'SOLUSDT',
  xrp: 'XRPUSDT',
  doge: 'DOGEUSDT',
  dogecoin: 'DOGEUSDT',
  ada: 'ADAUSDT',
  bnb: 'BNBUSDT',
  link: 'LINKUSDT',
  avax: 'AVAXUSDT',
  dot: 'DOTUSDT',
  matic: 'MATICUSDT',
  polygon: 'MATICUSDT',
  pepe: 'PEPEUSDT',
  sui: 'SUIUSDT',
};

function detectSymbol(query?: string): string {
  const t = (query || '').toLowerCase();
  for (const [key, sym] of Object.entries(SYMBOL_MAP)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(t)) return sym;
  }
  // bare ticker like BTCUSDT / ETH
  const bare = t.match(/\b([a-z]{2,6})usdt\b/i);
  if (bare) return bare[1].toUpperCase() + 'USDT';
  return 'BTCUSDT';
}

function wantsIncome(query?: string): boolean {
  return /\b(income|inkomen|ledger|finance|verdiensten|omzet)\b/i.test(query || '');
}

async function fetchBinanceKlines(symbol: string, limit = 24): Promise<ChartPoint[] | null> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length < 2) return null;
    return rows.map((r: unknown) => {
      const row = r as (string | number)[];
      const openTime = Number(row[0]);
      const close = Number(row[4]);
      const d = new Date(openTime);
      const label = `${String(d.getHours()).padStart(2, '0')}:00`;
      return { label, value: Math.round(close * 100) / 100 };
    });
  } catch {
    return null;
  }
}

async function resolveTradingChart(query?: string): Promise<ProjectionPayload | null> {
  const symbol = detectSymbol(query);
  const series = await fetchBinanceKlines(symbol, 24);
  if (!series?.length) return null;

  const last = series[series.length - 1]?.value ?? 0;
  const first = series[0]?.value ?? last;
  const delta = last - first;
  const pct = first ? (delta / first) * 100 : 0;
  const sign = pct >= 0 ? '+' : '';

  return pack({
    mode: 'chart',
    title: symbol.replace('USDT', '/USDT'),
    subtitle: `1h · last ${last} · ${sign}${pct.toFixed(2)}% (24h window)`,
    text: query?.trim() || undefined,
    data: {
      series,
      source: 'binance',
      symbol,
      last,
      changePct: pct,
    },
    source: 'director',
  });
}

async function resolveIncomeChart(query?: string): Promise<ProjectionPayload | null> {
  try {
    const entries = await listIncomeEntries();
    if (!entries.length) return null;
    const sum = summarizeIncome(entries);
    const series: ChartPoint[] = Object.entries(sum.bySource)
      .map(([source, v]) => ({
        label: INCOME_SOURCES.find(s => s.id === source)?.label ?? source,
        value: Math.round(v.amount * 100) / 100,
      }))
      .sort((a, b) => b.value - a.value);
    if (!series.length) return null;
    return pack({
      mode: 'chart',
      title: 'Income by source',
      subtitle: `This month ${sum.thisMonth.toFixed(2)} ${sum.currency} · total ${sum.total.toFixed(2)}`,
      text: query?.trim() || undefined,
      data: { series, currency: sum.currency, source: 'income_ledger' },
      source: 'director',
    });
  } catch {
    return null;
  }
}

function sampleChart(query?: string): ProjectionPayload {
  const series: ChartPoint[] = [
    { label: '00:00', value: 64200 },
    { label: '04:00', value: 63850 },
    { label: '08:00', value: 65120 },
    { label: '12:00', value: 64890 },
    { label: '16:00', value: 66100 },
    { label: '20:00', value: 65740 },
    { label: 'now', value: 65980 },
  ];
  return pack({
    mode: 'chart',
    title: 'BTC/USDT',
    subtitle: 'Sample · live feed unavailable',
    text: query?.trim() || undefined,
    data: { series, source: 'sample' },
    source: 'director',
  });
}

export async function resolveChart(query?: string): Promise<ProjectionPayload> {
  // Explicit income/finance → ledger first
  if (wantsIncome(query)) {
    const income = await resolveIncomeChart(query);
    if (income) return income;
  }

  // Default: trading / market chart
  const trading = await resolveTradingChart(query);
  if (trading) return trading;

  // Secondary: income if any
  const income = await resolveIncomeChart(query);
  if (income) return income;

  return sampleChart(query);
}

export function resolveChartFromSeries(
  series: ChartPoint[],
  meta?: { title?: string; subtitle?: string; text?: string },
): ProjectionPayload {
  return pack({
    mode: 'chart',
    title: meta?.title || 'Chart',
    subtitle: meta?.subtitle,
    text: meta?.text,
    data: { series, source: 'resolved' },
    source: 'tool',
  });
}
