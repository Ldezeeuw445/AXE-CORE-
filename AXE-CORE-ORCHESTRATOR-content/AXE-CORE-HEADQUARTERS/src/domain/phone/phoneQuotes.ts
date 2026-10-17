/**
 * Watchlist-prijzen: dezelfde snapshot als de Home/lockscreen Markets-kaart.
 * Synthetic ~100 voor goud is geen koers.
 */
import type { LockscreenMarket } from '@/infrastructure/gateways/axeCoreApiService';

export interface PhoneQuote {
  symbol: string;
  last?: number;
  changePct?: number;
  bron?: string;
}

const BAND: Record<string, readonly [number, number]> = {
  XAUUSD: [400, 20_000],
  BTCUSD: [1_000, 5_000_000],
  SPY: [50, 2_000],
  QQQ: [50, 2_000],
};

function norm(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function marktVoorSymbool(markets: readonly LockscreenMarket[], symbol: string): LockscreenMarket | undefined {
  const zoek = norm(symbol);
  return markets.find((m) => {
    const a = norm(m.symbol);
    const b = norm(m.label);
    return a === zoek || b === zoek || a.endsWith(zoek) || zoek.endsWith(a);
  });
}

export function quoteVanMarkt(symbol: string, m: LockscreenMarket | undefined): PhoneQuote {
  if (!m || m.price == null || !Number.isFinite(m.price)) return { symbol };
  const band = BAND[norm(symbol)];
  if (band && (m.price < band[0] || m.price > band[1])) return { symbol };
  const dag = m.chg?.['1D'] ?? m.chg?.['1d'] ?? m.chg?.D ?? Object.values(m.chg ?? {})[0];
  return {
    symbol,
    last: m.price,
    changePct: dag && Number.isFinite(dag.pct) ? dag.pct : undefined,
    bron: 'lockscreen',
  };
}

export function prijsTekst(last: number): string {
  return last.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
