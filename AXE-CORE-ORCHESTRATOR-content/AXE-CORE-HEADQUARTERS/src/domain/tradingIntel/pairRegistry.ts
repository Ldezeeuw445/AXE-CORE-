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
  // ── FX majors ──
  { id: 'EURUSD', label: 'EUR/USD', kind: 'fx', aliases: ['EUR/USD'] },
  { id: 'GBPUSD', label: 'GBP/USD', kind: 'fx', aliases: ['GBP/USD'] },
  { id: 'USDJPY', label: 'USD/JPY', kind: 'fx', aliases: ['USD/JPY'] },
  { id: 'USDCHF', label: 'USD/CHF', kind: 'fx', aliases: ['USD/CHF'] },
  { id: 'AUDUSD', label: 'AUD/USD', kind: 'fx', aliases: ['AUD/USD'] },
  { id: 'NZDUSD', label: 'NZD/USD', kind: 'fx', aliases: ['NZD/USD'] },
  { id: 'USDCAD', label: 'USD/CAD', kind: 'fx', aliases: ['USD/CAD'] },

  // ── FX crosses ──
  { id: 'EURJPY', label: 'EUR/JPY', kind: 'fx', aliases: ['EUR/JPY'] },
  { id: 'GBPJPY', label: 'GBP/JPY', kind: 'fx', aliases: ['GBP/JPY'] },
  { id: 'AUDJPY', label: 'AUD/JPY', kind: 'fx', aliases: ['AUD/JPY'] },
  { id: 'EURAUD', label: 'EUR/AUD', kind: 'fx', aliases: ['EUR/AUD'] },
  { id: 'GBPAUD', label: 'GBP/AUD', kind: 'fx', aliases: ['GBP/AUD'] },

  // ── Metals ──
  { id: 'XAUUSD', label: 'Gold', kind: 'metal', aliases: ['GOLD', 'XAU/USD'] },
  { id: 'XAGUSD', label: 'Silver', kind: 'metal', aliases: ['SILVER', 'XAG/USD'] },

  // ── Crypto ──
  { id: 'BTCUSD', label: 'Bitcoin', kind: 'crypto', aliases: ['BTC/USD', 'XBTUSD', 'BTCUSDT', 'BITCOIN'] },
  { id: 'ETHUSD', label: 'Ethereum', kind: 'crypto', aliases: ['ETH/USD', 'ETHUSDT', 'ETHEREUM'] },

  // ── Indices ──
  //
  // The canonical ids here are the ones already written into trades, settings
  // and strategy tags. Luka's preferred names (SP500, USOIL, UKOIL) are
  // aliases rather than renames: pairSpec() resolves either, so both work,
  // and nine files of live trading code do not change for a label.
  { id: 'NAS100', label: 'Nasdaq 100', kind: 'index', aliases: ['US100', 'USTEC', 'NASDAQ100', 'NDX', 'NDX100'] },
  { id: 'US30', label: 'Dow 30', kind: 'index', aliases: ['DJ30', 'DJIA', 'DOW30', 'WALL30'] },
  { id: 'US500', label: 'S&P 500', kind: 'index', aliases: ['SP500', 'SPX500', 'S&P500', 'SPX'] },
  { id: 'US2000', label: 'Russell 2000', kind: 'index', aliases: ['RUS2000', 'RUSSELL2000', 'RTY'] },
  { id: 'GER40', label: 'DAX 40', kind: 'index', aliases: ['DE40', 'DAX40', 'DAX', 'GER30'] },
  { id: 'UK100', label: 'FTSE 100', kind: 'index', aliases: ['FTSE100', 'UKX'] },
  { id: 'FRA40', label: 'CAC 40', kind: 'index', aliases: ['FR40', 'CAC40', 'CAC'] },
  { id: 'EU50', label: 'Euro Stoxx 50', kind: 'index', aliases: ['EUSTX50', 'EURO50', 'STOXX50'] },
  { id: 'JP225', label: 'Nikkei 225', kind: 'index', aliases: ['JPN225', 'NIKKEI225', 'NIKKEI'] },
  { id: 'HK50', label: 'Hang Seng', kind: 'index', aliases: ['HKG33', 'HK33', 'HS50', 'HANGSENG'] },
  { id: 'AUS200', label: 'ASX 200', kind: 'index', aliases: ['ASX200', 'AUSTRALIA200'] },

  // ── Energy ──
  { id: 'WTIUSD', label: 'WTI Crude', kind: 'energy', aliases: ['USOIL', 'WTI', 'XTIUSD', 'CRUDE'] },
  { id: 'BCOUSD', label: 'Brent Crude', kind: 'energy', aliases: ['UKOIL', 'BRENT', 'XBRUSD'] },
  { id: 'NATGAS', label: 'Natural Gas', kind: 'energy', aliases: ['NGAS', 'NATURALGAS', 'XNGUSD'] },

];

const BY_ID = new Map(PAIR_REGISTRY.map(p => [p.id, p]));

/**
 * Look up by canonical id OR by any registered alias.
 *
 * Both directions matter. Luka's own list names S&P 500 "SP500" while nine
 * files of live trading code already say "US500"; resolving either means the
 * preferred name works everywhere without renaming anything that trades.
 *
 * It also means a symbol arriving from a broker, a strategy tag or a saved
 * trade lands on the same spec regardless of which name it was written under,
 * which is the whole point of having one watchlist.
 */
export function pairSpec(id: string): PairSpec | null {
  const key = id.toUpperCase();
  const direct = BY_ID.get(key);
  if (direct) return direct;
  return BY_ALIAS.get(key) ?? null;
}

/** Canonical id for any name — alias, suffixed broker ticker, or the id itself. */
export function canonicalPairId(symbol: string): string | null {
  const spec = pairSpec(symbol);
  if (spec) return spec.id;
  // Not a known name: try it as a broker ticker with a suffix on it.
  //
  // Passed with its original case on purpose. matches() distinguishes a
  // lowercase tag (US500m — Gold at that broker) from an uppercase one (a
  // different market that merely starts the same way), so upper-casing first
  // destroys the very signal it reads.
  for (const p of PAIR_REGISTRY) {
    if (matches(p.id, symbol)) return p.id;
    if (p.aliases.some(a => matches(a, symbol))) return p.id;
  }
  return null;
}

const BY_ALIAS = new Map<string, PairSpec>(
  PAIR_REGISTRY.flatMap(p => p.aliases.map(a => [a.toUpperCase(), p] as const)),
);

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
  // A bare marker with no separator: XAUUSD#, EURUSD+. Some brokers use these
  // to mark a raw-spread or ECN book of the same instrument.
  if (/^[#+*]$/.test(rest)) return true;
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
