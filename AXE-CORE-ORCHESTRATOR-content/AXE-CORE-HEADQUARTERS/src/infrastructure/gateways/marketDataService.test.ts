/**
 * The synthetic fallback exists for the chart and must never reach a trade.
 *
 * On 2026-08-20 at 23:21 the agent wrote real decisions against XAUUSD at
 * 105.25 and DJ30 at 106.17 — the fallback seeds every non-BTC/ETH symbol at
 * 100 — because MetaAPI, Binance and Stooq had all failed. Nothing in the
 * decision path could tell an invented price from a real one.
 *
 * These test `assertTradeable` rather than `fetchTradeableSnapshot`, because
 * the fetch is reached through a module-local binding: mocking it would leave
 * the guard unexercised and the test would pass with the guard deleted.
 */
import { describe, it, expect } from 'vitest';
import { assertTradeable } from './marketDataService';
import type { MarketSnapshot } from '@/domain/tradingIntel/demoTypes';

function snap(source: string, last: number, symbol = 'XAUUSD'): MarketSnapshot {
  return {
    symbol,
    source,
    bars: [{ t: 1, o: last, h: last, l: last, c: last, v: 1 }],
    last,
    fetchedAt: new Date().toISOString(),
  };
}

describe('assertTradeable', () => {
  it('refuses a synthetic price rather than returning it', () => {
    // The exact failure: gold "at" $105 must not be spendable as a decision.
    expect(() => assertTradeable(snap('synthetic', 105.25))).toThrow(/synthetic price/i);
  });

  it('names the symbol, so the cycle log says which market went dark', () => {
    expect(() => assertTradeable(snap('synthetic', 106.17, 'DJ30'))).toThrow(/DJ30/);
  });

  it('passes a real price straight through', () => {
    const s = assertTradeable(snap('metaapi', 4529.1));
    expect(s.last).toBe(4529.1);
  });

  it('accepts every non-synthetic source, since a fallback feed is still real', () => {
    // Refusing Binance or Stooq would ground the agent whenever MetaAPI
    // hiccups, which is a different failure and not the one being prevented.
    for (const source of ['metaapi', 'binance', 'stooq']) {
      expect(assertTradeable(snap(source, 4529.1)).source).toBe(source);
    }
  });
});
