/**
 * runStrategyLab: periode, instrument (broker of schatting), waarschuwingen, en
 * dat het signaal van de canonieke computeStrategySignal komt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ account: null as null | Record<string, unknown>, calls: [] as number[], cache: null as null | Array<Record<string, unknown>> }));

vi.mock('@/application/tradingIntel/backtestEngine', () => {
  const T0 = Date.parse('2026-01-01T00:00:00Z');
  const candles = Array.from({ length: 400 }, (_, i) => ({
    time: new Date(T0 + i * 3_600_000).toISOString(), open: 1.1, high: 1.1005, low: 1.0995, close: 1.1,
  }));
  return {
    buildSeriesFromCandles: (cs: Array<{ time: string; close: number }>) => ({
      closes: cs.map(c => c.close), highs: [], lows: [], opens: [], times: cs.map(c => c.time), sma20: [], sma50: [], rsi14: [],
    }),
    loadBacktestSeries: vi.fn(async () => ({
      ok: true, candles, source: 'twelvedata',
      series: { closes: candles.map(c => c.close), highs: [], lows: [], opens: [], times: candles.map(c => c.time), sma20: [], sma50: [], rsi14: [] },
    })),
  };
});
vi.mock('@/application/tradingIntel/strategySignals', () => ({
  DISTINCT_STRATEGIES: new Set(['ifvg']),
  computeStrategySignal: vi.fn((_s: string, _series: unknown, i: number) => { h.calls.push(i); return i === 200 ? 'buy' : 'hold'; }),
}));
vi.mock('@/application/tradingIntel/preTradeGateService', () => ({
  resolveOrderAccount: vi.fn(async () => h.account),
  loadInstrumentSpec: vi.fn(async () => ({
    ok: true,
    spec: { symbol: 'EURUSD', tickSize: 0.00001, lossTickValue: 0.92, contractSize: 100000, minVolume: 0.01, maxVolume: 50, volumeStep: 0.01, accountCurrency: 'EUR', source: 'broker' },
  })),
}));
vi.mock('@/application/tradingIntel/historyService', () => ({
  getHistory: vi.fn(async () => (h.cache ? {
    ok: true, candles: h.cache, pagesFetched: 0, fromCache: true, provider: 'metaapi',
    coverage: { provider: 'metaapi', timeframe: 'h1', count: h.cache.length, from: h.cache[0].time, to: h.cache[h.cache.length - 1].time, exhaustedBefore: false },
  } : { ok: false, error: 'no MetaAPI' })),
}));
vi.mock('@/infrastructure/gateways/metaApiService', () => ({
  metaApiAccountInfoFor: vi.fn(async () => ({ ok: true, info: { currency: 'EUR' } })),
}));
vi.mock('@/infrastructure/gateways/researchSources', () => ({ fetchEconomicReleases: vi.fn(async () => []) }));
vi.mock('@/infrastructure/persistence/userSettingsService', () => ({ loadSetting: vi.fn(async (_k: string, fb: unknown) => fb), saveSetting: vi.fn() }));

import { runStrategyLab, runStrategyMatrix } from './strategyLab';

const BASE = {
  symbol: 'eurusd', timeframe: '1h', limit: 400, strategy: { kind: 'single' as const, strategy: 'ifvg' as never },
  startingBalance: 10_000, sizing: { mode: 'risk' as const, riskPct: 0.01 }, costs: { spread: 0, commissionPerLot: 0, slippage: 0 },
};

beforeEach(() => { h.account = null; h.calls = []; h.cache = null; });

describe('runStrategyLab', () => {
  it('zonder broker: geschatte specificatie, en dat staat in de waarschuwingen', async () => {
    const res = await runStrategyLab(BASE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.meta).toMatchObject({ engine: 'axe-lab', symbol: 'EURUSD', instrumentSource: 'estimate', pnlCurrency: 'USD', source: 'twelvedata' });
    expect(res.result.meta.warnings.join()).toMatch(/estimated/);
    expect(res.result.meta.warnings.join()).toMatch(/TwelveData/);
    expect(res.result.run.trades).toHaveLength(1);
    expect(res.result.run.trades[0].signalIndex).toBeGreaterThan(0);
  });

  it('met een verbonden account: de specificatie en valuta van de broker', async () => {
    h.account = { accountId: 'a', token: 't', enabled: true };
    const res = await runStrategyLab(BASE);
    expect(res.ok && res.result.meta).toMatchObject({ instrumentSource: 'broker', pnlCurrency: 'EUR' });
  });

  it('From/To knipt de periode, met opwarmen van vóór From', async () => {
    const res = await runStrategyLab({ ...BASE, from: '2026-01-06T00:00:00Z', to: '2026-01-10T00:00:00Z' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.meta.from?.slice(0, 13)).toBe('2026-01-06T00');
    expect(res.result.meta.to?.slice(0, 13)).toBe('2026-01-10T00');
    // Het signaal wordt gevraagd met de index in de VOLLEDIGE reeks, niet in het venster.
    expect(Math.min(...h.calls)).toBeGreaterThan(60);
  });

  it('te korte periode is een weigering, geen lege uitslag', async () => {
    const res = await runStrategyLab({ ...BASE, from: '2026-01-16T00:00:00Z', to: '2026-01-16T10:00:00Z' });
    expect(res).toMatchObject({ ok: false });
  });

  it('uit de candle-cache als die er is — broker-feed, met de diepte in de meta', async () => {
    const T = Date.parse('2025-06-01T00:00:00Z');
    h.cache = Array.from({ length: 500 }, (_, i) => ({ time: new Date(T + i * 3_600_000).toISOString(), open: 1.2, high: 1.2005, low: 1.1995, close: 1.2 }));
    const res = await runStrategyLab(BASE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.meta.source).toBe('metaapi');
    expect(res.result.meta.history).toMatch(/metaapi h1: 500 bars cached, 2025-06-01 → 2025-06-21 · from cache/);
    expect(res.result.meta.warnings.join()).not.toMatch(/TwelveData/);
  });
});

describe('runStrategyMatrix', () => {
  const base = { limit: 400, startingBalance: 10_000, sizing: { mode: 'risk' as const, riskPct: 0.01 }, costs: { spread: 0, commissionPerLot: 0, slippage: 0 } };

  it('één cel per strategie × paar × timeframe, met een waarschuwing bij te weinig trades', async () => {
    const progress: string[] = [];
    const cells = await runStrategyMatrix({
      strategies: ['ifvg' as never, 'pdh' as never], symbols: ['EURUSD'], timeframes: ['1h', '4h'], base,
      onProgress: (_d, _t, label) => progress.push(label),
    });
    expect(cells.map(c => `${c.strategy}@${c.timeframe}`)).toEqual(['ifvg@1h', 'pdh@1h', 'ifvg@4h', 'pdh@4h']);
    expect(cells.every(c => c.ok && c.trades === 1 && c.smallSample)).toBe(true);
    expect(progress.filter(Boolean)).toHaveLength(4);
  });

  it('stoppen houdt op na de lopende cel', async () => {
    let n = 0;
    const cells = await runStrategyMatrix({
      strategies: ['ifvg' as never, 'pdh' as never], symbols: ['EURUSD', 'XAUUSD'], timeframes: ['1h'], base,
      shouldStop: () => ++n > 2,
    });
    expect(cells).toHaveLength(2);
  });
});
