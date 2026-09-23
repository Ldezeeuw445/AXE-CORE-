/**
 * Vier grafieken tegelijk: elke candle-aanvraag komt aan, en er lopen er nooit
 * meer dan twee tegelijk bij MetaAPI (die weigert daarboven met 422). Een
 * 4-grid wordt dus op volgorde geladen, niet kapot.
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ inFlight: 0, maxInFlight: 0, calls: 0 }));

vi.mock('@/infrastructure/gateways/metaApiService', () => ({
  getMetaApiConfig: vi.fn(async () => ({ token: 'tok-abcdefghijkl', accountId: 'acct', region: 'london', enabled: true })),
}));
vi.mock('@/infrastructure/gateways/metaApiSymbolResolver', () => ({ resolveBrokerSymbol: vi.fn(async () => null) }));
vi.mock('@/infrastructure/gateways/metaApiBudget', () => ({
  budgetedFetch: vi.fn(async () => {
    h.calls += 1;
    h.inFlight += 1;
    h.maxInFlight = Math.max(h.maxInFlight, h.inFlight);
    await new Promise(r => setTimeout(r, 15));
    h.inFlight -= 1;
    return new Response(JSON.stringify([{ time: '2026-09-22T00:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5, tickVolume: 10 }]), { status: 200 });
  }),
}));

import { metaApiGetHistoricalCandles } from './metaApiMarketData';

describe('meerdere grafieken tegelijk', () => {
  it('vier grafieken × (historie + eerste poll) = acht aanvragen, alle geslaagd, hooguit twee tegelijk', async () => {
    const pairs = ['XAUUSD', 'EURUSD', 'BTCUSD', 'US30'];
    const results = await Promise.all(pairs.flatMap(symbol => [
      metaApiGetHistoricalCandles({ symbol, timeframe: 'h1', limit: 400 }),
      metaApiGetHistoricalCandles({ symbol, timeframe: 'h1', limit: 2 }),
    ]));
    expect(results.every(r => r.ok && r.candles.length === 1)).toBe(true);
    expect(h.calls).toBe(8);
    expect(h.maxInFlight).toBeLessThanOrEqual(2);
  });
});
