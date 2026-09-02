/**
 * Two accounts on one token do not offer the same market, and asking a broker
 * for one it does not carry is what produced "The quota has been exceeded".
 *
 * Measured 2026-08-21 against the two live demos:
 *   MT5 100K (MetaQuotes-Demo) : XAUUSD, US30   — no BTCUSD/ETHUSD/NAS100
 *   OANDA 50K (OANDATMS-MT5)   : BTCUSD, ETHUSD — no XAUUSD/US30/DJ30
 *
 * The autopilot fanned every symbol at every account, so roughly seven
 * requests per cycle were spent on instruments that do not exist. MetaAPI
 * counts those as NotFoundError and throttles the subscription once there are
 * enough — which is why it began the moment a second account was added, and
 * why no amount of pacing helped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { accountSupportsSymbol, __resetSymbolCache, __resetTradeModeCache, __settleTradeModes } from './metaApiService';
import type { MetaApiConfig } from './metaApiService';
import { __resetBudget } from './metaApiBudget';

const MT5: MetaApiConfig = {
  accountId: 'f2436f0a-05a4-47e0-9aa9-be4dfd502b49', token: 't', region: 'london', enabled: true,
} as MetaApiConfig;
const OANDA: MetaApiConfig = {
  accountId: '08c9aa65-6013-428d-87a0-5ca122f88064', token: 't', region: 'london', enabled: true,
} as MetaApiConfig;

/** Counts network touches so the cache can be proven, not assumed. */
let listCalls = 0;
let specCalls = 0;

/**
 * `disabled` names the broker symbols this account quotes but will not trade —
 * MetaQuotes-Demo's indices, measured 2026-08-25. The stub answers the
 * specification route separately from the list route, because the code now
 * asks two different questions and a stub that conflates them proves neither.
 */
function serve(
  bySymbolList: Record<string, string[] | null>,
  disabled: string[] = [],
) {
  listCalls = 0; specCalls = 0;
  vi.stubGlobal('fetch', (url: string) => {
    const u = String(url);
    const specMatch = u.match(/\/symbols\/([^/]+)\/specification/);
    if (specMatch) {
      specCalls += 1;
      const sym = decodeURIComponent(specMatch[1]);
      const tradeMode = disabled.includes(sym)
        ? 'SYMBOL_TRADE_MODE_DISABLED'
        : 'SYMBOL_TRADE_MODE_FULL';
      return Promise.resolve(new Response(JSON.stringify({ symbol: sym, tradeMode }), { status: 200 }));
    }
    listCalls += 1;
    const id = Object.keys(bySymbolList).find(k => u.includes(k));
    const list = id ? bySymbolList[id] : [];
    if (list === null) return Promise.resolve(new Response('nope', { status: 500 }));
    return Promise.resolve(new Response(JSON.stringify(list), { status: 200 }));
  });
}

beforeEach(() => {
  __resetSymbolCache();
  __resetTradeModeCache();
  // metaFetch goes through budgetedFetch, whose read cache is module-wide and
  // outlives a test. Without this, case 1 populates it and every later case
  // is answered from that cache without touching the stub — which reads as
  // "the code did nothing" when in fact it did the wrong thing.
  __resetBudget();
});
afterEach(() => vi.unstubAllGlobals());

describe('accountSupportsSymbol', () => {
  it('lets each account trade only what its own broker carries', async () => {
    serve({
      'f2436f0a': ['XAUUSD', 'US30', 'EURUSD'],
      '08c9aa65': ['BTCUSD', 'ETHUSD', 'EURUSD'],
    });
    expect(await accountSupportsSymbol(MT5, 'XAUUSD')).toBe(true);
    expect(await accountSupportsSymbol(OANDA, 'BTCUSD')).toBe(true);
    // The two that caused the 404 storm.
    expect(await accountSupportsSymbol(MT5, 'BTCUSD')).toBe(false);
    expect(await accountSupportsSymbol(OANDA, 'XAUUSD')).toBe(false);
  });

  it('caches per account, so the fix does not become its own call storm', async () => {
    serve({ 'f2436f0a': ['XAUUSD', 'US30'] });
    await accountSupportsSymbol(MT5, 'XAUUSD');
    await accountSupportsSymbol(MT5, 'US30');
    await accountSupportsSymbol(MT5, 'BTCUSD');
    // One list fetch answers every symbol question for that account.
    expect(listCalls).toBe(1);
  });

  it('never makes the trading path wait on a trade-mode lookup', async () => {
    // The first version awaited the specification inline. That put ~30 paced
    // MetaAPI calls in front of the first order and took a cycle from nine and
    // a half minutes to past twenty-three, against a fifteen-minute interval.
    //
    // Counting calls cannot express this — the lookup DOES start, it is simply
    // not awaited. So the specification route here never answers at all: if
    // the trading path waits on it, this test hangs instead of failing, which
    // is the honest shape of the bug.
    vi.stubGlobal('fetch', (url: string) => {
      if (String(url).includes('/specification')) return new Promise<Response>(() => {});
      return Promise.resolve(new Response(JSON.stringify(['XAUUSD', 'US30']), { status: 200 }));
    });
    // Cold cache: nothing known yet, so nothing may block and nothing may be
    // refused on a guess. The order stays the real gate.
    expect(await accountSupportsSymbol(MT5, 'US30')).toBe(true);
  });

  it('refuses the quote-only symbol from the NEXT cycle on', async () => {
    // Measured 2026-08-25: MetaQuotes-Demo lists US30 and USTEC, quotes live
    // prices, and reports SYMBOL_TRADE_MODE_DISABLED for both. MT5 has never
    // held a position. Refused orders are what MetaAPI throttles on, so the
    // second cycle must already know better.
    serve({ 'f2436f0a': ['XAUUSD', 'US30'] }, ['US30']);
    await accountSupportsSymbol(MT5, 'US30');
    await __settleTradeModes();
    expect(await accountSupportsSymbol(MT5, 'US30')).toBe(false);
    expect(await accountSupportsSymbol(MT5, 'XAUUSD')).toBe(true);
  });

  it('asks a symbol its trade mode once, then remembers', async () => {
    serve({ 'f2436f0a': ['XAUUSD'] }, []);
    await accountSupportsSymbol(MT5, 'XAUUSD');
    await __settleTradeModes();
    await accountSupportsSymbol(MT5, 'XAUUSD');
    await accountSupportsSymbol(MT5, 'XAUUSD');
    await __settleTradeModes();
    expect(specCalls).toBe(1);
  });

  it('leaves a symbol unknown when the specification cannot be read', async () => {
    // A lookup that fails is not a broker saying no — same rule as the list.
    // It must stay tradeable AND stay unlearned, so the next cycle asks again.
    serve({ 'f2436f0a': ['XAUUSD'] });
    vi.stubGlobal('fetch', (url: string) => {
      if (String(url).includes('/specification')) {
        return Promise.resolve(new Response('boom', { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify(['XAUUSD']), { status: 200 }));
    });
    expect(await accountSupportsSymbol(MT5, 'XAUUSD')).toBe(true);
    await __settleTradeModes();
    expect(await accountSupportsSymbol(MT5, 'XAUUSD')).toBe(true);
  });

  it('does not let one account answer for another', async () => {
    serve({
      'f2436f0a': ['XAUUSD'],
      '08c9aa65': ['BTCUSD'],
    });
    await accountSupportsSymbol(MT5, 'XAUUSD');
    // Same symbol, other account — must go and ask, not reuse MT5's list.
    expect(await accountSupportsSymbol(OANDA, 'XAUUSD')).toBe(false);
    // Counted per LIST, not per request: the trade-mode lookup is a separate
    // question with its own cache, and folding the two into one number is
    // what made this assertion break when the second question was added.
    expect(listCalls).toBe(2);
  });

  it('allows the symbol when the list cannot be read', async () => {
    // A broker that will not answer is a different fault from one that lacks
    // the instrument. Grounding the account here would turn a lookup blip into
    // a silent trading halt; the order itself is still the real gate.
    serve({ 'f2436f0a': null });
    expect(await accountSupportsSymbol(MT5, 'BTCUSD')).toBe(true);
  });

  it('allows the symbol when the broker returns an empty list', async () => {
    serve({ 'f2436f0a': [] });
    expect(await accountSupportsSymbol(MT5, 'BTCUSD')).toBe(true);
  });
});
