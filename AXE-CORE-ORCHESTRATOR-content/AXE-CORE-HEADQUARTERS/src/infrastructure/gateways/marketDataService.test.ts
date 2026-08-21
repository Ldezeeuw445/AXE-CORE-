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
    expect(() => assertTradeable(snap('synthetic', 105.25))).toThrow(/broker price/i);
  });

  it('names the symbol, so the cycle log says which market went dark', () => {
    expect(() => assertTradeable(snap('synthetic', 106.17, 'DJ30'))).toThrow(/DJ30/);
  });

  it('takes the broker feed', () => {
    expect(assertTradeable(snap('metaapi', 4594.77)).source).toBe('metaapi');
  });

  it('passes a real price straight through', () => {
    const s = assertTradeable(snap('metaapi', 4529.1));
    expect(s.last).toBe(4529.1);
  });

  it('refuses a substitute feed, however real that feed is', () => {
    // This asserted the opposite, on the reasoning that refusing Binance would
    // ground the agent whenever MetaAPI hiccups. Measured 2026-08-21, that
    // "grounding" was the safer half: the desk was pricing AUDUSD at 0.7252
    // off binance:AUDUSDT and EURUSD at 1.1683 off binance:EURUSDT, then
    // sending the order to MT5. Binance's AUDUSDT is a different instrument on
    // a different book; a stop computed from it sits at a level the broker
    // never printed. Less obviously wrong than gold at $105, and worse for it.
    for (const source of ['binance', 'stooq', 'synthetic']) {
      expect(() => assertTradeable(snap(source, 4529.1))).toThrow(/broker price/i);
    }
  });

  it('names the feed it refused, so the cycle log says which one answered', () => {
    expect(() => assertTradeable(snap('binance', 0.7252, 'AUDUSD'))).toThrow(/binance/);
  });
});
