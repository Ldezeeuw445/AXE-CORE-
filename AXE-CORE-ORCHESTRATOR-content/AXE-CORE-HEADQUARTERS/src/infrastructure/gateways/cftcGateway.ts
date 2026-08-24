/**
 * CFTC Commitment of Traders — who is actually positioned, and which way.
 *
 * Built because the Unusual Whales key behind five intel feeds returns 401 and
 * Luka does not have a replacement. Rather than leave Intel with ten-day-old
 * rows, this fills the gap with something that fits his book better anyway:
 * those UW feeds are about individual US equities — options flow, dark pool,
 * insider and congress trades — and his watchlist contains no single stocks.
 * It is gold, silver, indices, FX, oil and crypto.
 *
 * COT covers exactly that, is published by the regulator, and needs no key.
 *
 * ## What it is and is not
 *
 * Weekly, as of the prior Tuesday, released Friday. So it is days old by
 * construction — that is the instrument, not a fault, and the age is carried
 * so nothing reads it as a live tape. It answers "how is the crowd leaning",
 * never "what is happening now".
 */
import { canonicalPairId } from '@/domain/tradingIntel/pairRegistry';

const BASE = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';

/**
 * Canonical pair → the CFTC contract name to match on.
 *
 * Matched on a prefix that is specific enough to exclude look-alikes: plain
 * "GOLD" also hits "GOLD -1 TROY OUNCE - COINBASE DERIVATIVES", a different
 * market with different participants. The COMEX contract is the one that sets
 * the price everyone else references.
 */
const CONTRACTS: Record<string, string> = {
  XAUUSD: 'GOLD - COMMODITY EXCHANGE',
  XAGUSD: 'SILVER - COMMODITY EXCHANGE',
  // Verified against the live dataset rather than guessed: the WTI contract
  // the CFTC lists is on ICE Futures Europe, not NYMEX, and a NYMEX prefix
  // matches nothing at all.
  WTIUSD: 'CRUDE OIL, LIGHT SWEET-WTI - ICE FUTURES EUROPE',
  BCOUSD: 'BRENT LAST DAY - NEW YORK MERCANTILE',
  NATGAS: 'NATURAL GAS - NEW YORK MERCANTILE',
  EURUSD: 'EURO FX - CHICAGO MERCANTILE',
  GBPUSD: 'BRITISH POUND - CHICAGO MERCANTILE',
  USDJPY: 'JAPANESE YEN - CHICAGO MERCANTILE',
  AUDUSD: 'AUSTRALIAN DOLLAR - CHICAGO MERCANTILE',
  NZDUSD: 'NZ DOLLAR - CHICAGO MERCANTILE',
  USDCAD: 'CANADIAN DOLLAR - CHICAGO MERCANTILE',
  USDCHF: 'SWISS FRANC - CHICAGO MERCANTILE',
  US500:  'E-MINI S&P 500 - CHICAGO MERCANTILE',
  NAS100: 'NASDAQ MINI - CHICAGO MERCANTILE',
  US30:   'DJIA Consolidated - CHICAGO BOARD OF TRADE',
  US2000: 'MICRO E-MINI RUSSELL 2000 INDX - CHICAGO MERCANTILE',
  BTCUSD: 'BITCOIN - CHICAGO MERCANTILE',
  ETHUSD: 'ETHER CASH SETTLED - CHICAGO MERCANTILE',
};

export interface CotPositioning {
  pair: string;
  contract: string;
  reportDate: string;
  /** Large speculators: long minus short. The number people mean by "positioning". */
  netNonCommercial: number;
  longs: number;
  shorts: number;
}

/**
 * Positioning for one of Luka's pairs, or null when the CFTC does not list it.
 *
 * Null rather than zero. A pair with no futures contract (most FX crosses) is
 * a different thing from a pair where the crowd is flat, and an agent handed
 * a zero will read it as the second.
 */
export async function fetchPositioning(symbol: string): Promise<CotPositioning | null> {
  const pair = canonicalPairId(symbol);
  const contract = pair ? CONTRACTS[pair] : undefined;
  if (!pair || !contract) return null;

  const where = encodeURIComponent(`starts_with(market_and_exchange_names,'${contract}')`);
  const url = `${BASE}?$limit=1&$order=report_date_as_yyyy_mm_dd%20DESC&$where=${where}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const r = rows?.[0];
    if (!r) return null;

    const longs = Number(r.noncomm_positions_long_all ?? 0);
    const shorts = Number(r.noncomm_positions_short_all ?? 0);
    if (!Number.isFinite(longs) || !Number.isFinite(shorts)) return null;

    return {
      pair,
      contract: String(r.market_and_exchange_names ?? contract).slice(0, 60),
      reportDate: String(r.report_date_as_yyyy_mm_dd ?? '').slice(0, 10),
      netNonCommercial: longs - shorts,
      longs,
      shorts,
    };
  } catch {
    return null;
  }
}

/** One line for a prompt, stating the age so it cannot pass for a live tape. */
export function formatPositioning(cot: CotPositioning | null): string {
  if (!cot) {
    return 'POSITIONING (CFTC): no futures contract for this instrument — the crowd\'s lean is unknown, not flat.';
  }
  const side = cot.netNonCommercial > 0 ? 'net LONG' : cot.netNonCommercial < 0 ? 'net SHORT' : 'flat';
  return [
    `POSITIONING (CFTC Commitment of Traders, weekly — as of ${cot.reportDate}, days old by design):`,
    `- ${cot.contract}: large speculators ${side} ${Math.abs(cot.netNonCommercial).toLocaleString('en-US')} contracts`,
    `  (${cot.longs.toLocaleString('en-US')} long vs ${cot.shorts.toLocaleString('en-US')} short)`,
  ].join('\n');
}
