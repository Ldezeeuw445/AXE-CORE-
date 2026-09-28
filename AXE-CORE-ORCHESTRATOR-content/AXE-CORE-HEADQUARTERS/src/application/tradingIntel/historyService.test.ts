/**
 * De candle-cache haalt alleen op wat ontbreekt.
 *
 * Een nagebootste MetaAPI serveert pagina's uit een vaste geschiedenis (terug
 * vanaf `startTime`, hooguit `limit`, zoals de echte) en telt de aanroepen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const H = vi.hoisted(() => ({
  firstBar: 0, now: 0, calls: [] as Array<{ startTime?: string; limit?: number }>,
}));

vi.mock('@/infrastructure/gateways/metaApiMarketData', () => ({
  metaApiGetHistoricalCandles: vi.fn(async (input: { startTime?: string; limit?: number }) => {
    H.calls.push({ startTime: input.startTime, limit: input.limit });
    const hour = 3_600_000;
    const end = input.startTime ? Date.parse(input.startTime) : H.now;
    const out = [];
    for (let t = Math.floor(end / hour) * hour; t >= H.firstBar && out.length < (input.limit ?? 1000); t -= hour) {
      out.push({ time: new Date(t).toISOString(), open: 1, high: 1.1, low: 0.9, close: 1 });
    }
    return { ok: true, candles: out.reverse() };
  }),
}));
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({ fetchHistoricalCandles: vi.fn() }));

import { getHistory, historyCoverage } from './historyService';
import { __setCandleStore } from '@/infrastructure/persistence/candleStore';
import type { CachedSeries } from '@/domain/tradingIntel/candleCache';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  H.now = Date.parse('2026-09-20T12:00:00Z');
  vi.setSystemTime(H.now);
  H.firstBar = Date.parse('2026-03-01T00:00:00Z'); // ~4 900 uurbars beschikbaar
  H.calls = [];
  const m = new Map<string, CachedSeries>();
  __setCandleStore({ get: async k => m.get(k) ?? null, put: async (k, s) => { m.set(k, s); }, keys: async () => [...m.keys()], remove: async k => { m.delete(k); } });
});
afterEach(() => { vi.useRealTimers(); __setCandleStore(null); });

describe('historyService', () => {
  it('eerste keer: ophalen tot het minimum; tweede keer: niets downloaden', async () => {
    const first = await getHistory({ symbol: 'xauusd', timeframe: '1h', minBars: 2500 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.coverage.count).toBeGreaterThanOrEqual(2500);
    expect(first.fromCache).toBe(false);
    const pagesFirst = H.calls.length;
    expect(pagesFirst).toBeGreaterThanOrEqual(3);

    H.calls = [];
    const again = await getHistory({ symbol: 'XAUUSD', timeframe: 'h1', minBars: 2500 });
    expect(again.ok && again.fromCache).toBe(true);
    expect(H.calls).toHaveLength(0);
  });

  it('later: alleen de nieuwe bars, niet de hele geschiedenis opnieuw', async () => {
    await getHistory({ symbol: 'XAUUSD', timeframe: 'h1', minBars: 2000 });
    H.calls = [];
    H.now += 10 * 3_600_000; // tien uur later
    vi.setSystemTime(H.now);
    const res = await getHistory({ symbol: 'XAUUSD', timeframe: 'h1', minBars: 2000 });
    expect(H.calls).toHaveLength(1);
    expect(H.calls[0].startTime).toBeUndefined(); // één pagina vanaf nu, die de cache raakt
    expect(res.ok && res.coverage.to).toBe('2026-09-20T22:00:00.000Z');
  });

  it('From vóór het begin van de provider: alles wat er is, en daarna nooit meer ouder vragen', async () => {
    const res = await getHistory({ symbol: 'XAUUSD', timeframe: 'h1', from: '2020-01-01T00:00:00Z' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.coverage.exhaustedBefore).toBe(true);
    expect(res.coverage.from).toBe('2026-03-01T00:00:00.000Z');
    H.calls = [];
    await getHistory({ symbol: 'XAUUSD', timeframe: 'h1', from: '2020-01-01T00:00:00Z' });
    expect(H.calls).toHaveLength(0);
  });

  it('From/To geeft precies dat venster, en de dekking staat per symbool × timeframe × provider', async () => {
    const res = await getHistory({ symbol: 'XAUUSD', timeframe: 'h1', from: '2026-09-01T00:00:00Z', to: '2026-09-02T00:00:00Z' });
    expect(res.ok && res.candles.length).toBe(25);
    const cov = await historyCoverage();
    expect(cov).toEqual([expect.objectContaining({ symbol: 'XAUUSD', timeframe: 'h1', provider: 'metaapi' })]);
  });
});
