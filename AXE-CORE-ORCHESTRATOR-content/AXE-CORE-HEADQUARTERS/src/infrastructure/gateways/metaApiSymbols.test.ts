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
import { accountSupportsSymbol, __resetSymbolCache } from './metaApiService';
import type { MetaApiConfig } from './metaApiService';
import { __resetBudget } from './metaApiBudget';

const MT5: MetaApiConfig = {
  accountId: 'f2436f0a-05a4-47e0-9aa9-be4dfd502b49', token: 't', region: 'london', enabled: true,
} as MetaApiConfig;
const OANDA: MetaApiConfig = {
  accountId: '08c9aa65-6013-428d-87a0-5ca122f88064', token: 't', region: 'london', enabled: true,
} as MetaApiConfig;

/** Counts network touches so the cache can be proven, not assumed. */
let calls = 0;
function serve(bySymbolList: Record<string, string[] | null>) {
  calls = 0;
  vi.stubGlobal('fetch', (url: string) => {
    calls += 1;
    const id = Object.keys(bySymbolList).find(k => String(url).includes(k));
    const list = id ? bySymbolList[id] : [];
    if (list === null) return Promise.resolve(new Response('nope', { status: 500 }));
    return Promise.resolve(new Response(JSON.stringify(list), { status: 200 }));
  });
}

beforeEach(() => {
  __resetSymbolCache();
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
    expect(calls).toBe(1);
  });

  it('does not let one account answer for another', async () => {
    serve({
      'f2436f0a': ['XAUUSD'],
      '08c9aa65': ['BTCUSD'],
    });
    await accountSupportsSymbol(MT5, 'XAUUSD');
    // Same symbol, other account — must go and ask, not reuse MT5's list.
    expect(await accountSupportsSymbol(OANDA, 'XAUUSD')).toBe(false);
    expect(calls).toBe(2);
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
