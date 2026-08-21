/**
 * One canonical name per market, and every ticker a broker might list it under.
 *
 * WHY THIS EXISTS. Two accounts on one MetaAPI token, measured 2026-08-21:
 *
 *   MT5 100K (MetaQuotes-Demo) : 12.524 instruments — bare tickers (A, AA, AAPL)
 *   OANDA 50K (OANDATMS-MT5)   :  1.766 instruments — suffixed (AAPL_CFD.US)
 *   listed under the same name on both:  31
 *
 * The same market is XAUUSD here, GOLD.pro there, and XAUUSD.c on the next
 * broker. Without one vocabulary the algo cannot say "trade gold" — it can
 * only say "trade the string XAUUSD", which is a different and much weaker
 * thing, and it is why gold silently never traded on one account while the
 * ledger showed it as a live pair.
 *
 * MATCHING IS DELIBERATELY STRICT. The resolver this feeds used to do
 * `symbol.includes('GOLD')` against the account's catalogue. On 12.524 US
 * equity tickers that also matches GOLDMAN — a loose alias does not miss a
 * trade, it places one in the wrong instrument. So candidates match only as a
 * whole ticker, optionally followed by a broker suffix (`.c`, `.pro`, `_CFD`,
 * `m`), and never as a fragment inside a longer name.
 */

export interface PairSpec {
  /** Canonical AXE name — the only one the rest of the app should use. */
  id: string;
  /** Human label for the UI. */
  label: string;
  kind: 'fx' | 'metal' | 'index' | 'crypto' | 'energy';
  /**
   * Tickers this market is listed under, best first. The canonical id is
   * always tried first and does not need repeating here.
   */
  aliases: string[];
}

export const PAIR_REGISTRY: PairSpec[] = [
  // ── FX majors — the one group both brokers name identically ──
  { id: 'EURUSD', label: 'EUR/USD', kind: 'fx', aliases: [] },
  { id: 'GBPUSD', label: 'GBP/USD', kind: 'fx', aliases: [] },
  { id: 'USDJPY', label: 'USD/JPY', kind: 'fx', aliases: [] },
  { id: 'USDCHF', label: 'USD/CHF', kind: 'fx', aliases: [] },
  { id: 'AUDUSD', label: 'AUD/USD', kind: 'fx', aliases: [] },
  { id: 'NZDUSD', label: 'NZD/USD', kind: 'fx', aliases: [] },
  { id: 'USDCAD', label: 'USD/CAD', kind: 'fx', aliases: [] },
  { id: 'EURGBP', label: 'EUR/GBP', kind: 'fx', aliases: [] },
  { id: 'EURJPY', label: 'EUR/JPY', kind: 'fx', aliases: [] },
  { id: 'GBPJPY', label: 'GBP/JPY', kind: 'fx', aliases: [] },

  // ── Metals — the group that exposed the bug ──
  { id: 'XAUUSD', label: 'Gold', kind: 'metal', aliases: ['GOLD', 'XAU_USD', 'GOLD_CFD'] },
  { id: 'XAGUSD', label: 'Silver', kind: 'metal', aliases: ['SILVER', 'XAG_USD', 'SILVER_CFD'] },

  // ── Indices — every broker spells these differently ──
  { id: 'US30', label: 'Dow Jones 30', kind: 'index', aliases: ['DJ30', 'DOW', 'WS30', 'US30_CFD', 'USA30'] },
  { id: 'US500', label: 'S&P 500', kind: 'index', aliases: ['SPX500', 'SP500', 'SPX', 'US500_CFD', 'USA500'] },
  { id: 'NAS100', label: 'Nasdaq 100', kind: 'index', aliases: ['USTEC', 'NDX100', 'NAS100_CFD', 'USATECH', 'US100'] },
  { id: 'GER40', label: 'DAX 40', kind: 'index', aliases: ['DE40', 'DAX40', 'DAX', 'GER40_CFD', 'GERMANY40'] },
  { id: 'UK100', label: 'FTSE 100', kind: 'index', aliases: ['FTSE100', 'UK100_CFD', 'GB100'] },
  { id: 'JP225', label: 'Nikkei 225', kind: 'index', aliases: ['JPN225', 'NIKKEI', 'JP225_CFD'] },

  // ── Crypto — OANDA has these, MetaQuotes-Demo does not ──
  { id: 'BTCUSD', label: 'Bitcoin', kind: 'crypto', aliases: ['BTC_USD', 'BITCOIN', 'BTCUSDT'] },
  { id: 'ETHUSD', label: 'Ethereum', kind: 'crypto', aliases: ['ETH_USD', 'ETHEREUM', 'ETHUSDT'] },
  { id: 'LTCUSD', label: 'Litecoin', kind: 'crypto', aliases: ['LTC_USD', 'LTCUSDT'] },
  { id: 'XRPUSD', label: 'XRP', kind: 'crypto', aliases: ['XRP_USD', 'XRPUSDT'] },

  // ── Energy ──
  { id: 'WTIUSD', label: 'WTI Crude', kind: 'energy', aliases: ['WTI', 'USOIL', 'CRUDE', 'OIL', 'WTICOUSD'] },
  { id: 'BCOUSD', label: 'Brent Crude', kind: 'energy', aliases: ['BRENT', 'UKOIL', 'BCO_USD'] },
];

const BY_ID = new Map(PAIR_REGISTRY.map(p => [p.id, p]));

export function pairSpec(id: string): PairSpec | null {
  return BY_ID.get(id.toUpperCase()) ?? null;
}

export function allPairIds(): string[] {
  return PAIR_REGISTRY.map(p => p.id);
}

/**
 * Whether `ticker` is this candidate, optionally carrying a broker suffix.
 *
 * The distinguishing signal is CASE, and losing it is what makes this hard.
 * Broker suffixes are punctuated or lowercase — XAUUSD.c, XAUUSD_CFD,
 * XAUUSD-ecn, XAUUSDm, GOLD.pro. Continuations of a different word are
 * uppercase — GOLDMAN, GOLDCORP, EURUSDT (Tether, a genuinely different
 * instrument). Uppercasing both sides first makes MAN look exactly like a
 * four-character suffix, which is how `includes('GOLD')` came to match
 * Goldman Sachs on a 12.524-ticker catalogue.
 *
 * So: compare the name case-insensitively, but judge the remainder on the
 * ticker as the broker actually spells it.
 */
function matches(candidate: string, ticker: string): boolean {
  const c = candidate.toUpperCase();
  if (ticker.toUpperCase() === c) return true;
  if (!ticker.toUpperCase().startsWith(c)) return false;
  const rest = ticker.slice(candidate.length);
  // Separator plus a short tag: .c, .pro, _CFD, -ecn, .US
  if (/^[._-][A-Za-z0-9]{1,6}$/.test(rest)) return true;
  // Or a bare lowercase suffix: XAUUSDm, EURUSDc. Uppercase here means the
  // ticker is a different name that merely starts the same way.
  return /^[a-z]{1,3}$/.test(rest);
}

/**
 * The broker's real ticker for a canonical pair, or null when this account
 * genuinely does not carry it.
 *
 * Order matters: an exact hit on the canonical id always wins over an alias,
 * so a broker that lists both XAUUSD and GOLD gets the one AXE asked for.
 */
export function resolvePairTicker(pairId: string, brokerSymbols: Iterable<string>): string | null {
  const spec = pairSpec(pairId);
  const canonical = pairId.toUpperCase();
  const list = Array.from(brokerSymbols);

  // 1. Exact canonical.
  const exact = list.find(s => s.toUpperCase() === canonical);
  if (exact) return exact;

  // 2. Canonical plus a broker suffix.
  const suffixed = list.find(s => matches(canonical, s));
  if (suffixed) return suffixed;

  // 3. Registered aliases, best first, same strictness.
  for (const alias of spec?.aliases ?? []) {
    const hit = list.find(s => matches(alias, s));
    if (hit) return hit;
  }
  return null;
}

/** Every registry pair this account can actually trade, canonical ids. */
export function tradablePairsFor(brokerSymbols: Iterable<string>): string[] {
  const list = Array.from(brokerSymbols);
  return PAIR_REGISTRY.filter(p => resolvePairTicker(p.id, list) !== null).map(p => p.id);
}
