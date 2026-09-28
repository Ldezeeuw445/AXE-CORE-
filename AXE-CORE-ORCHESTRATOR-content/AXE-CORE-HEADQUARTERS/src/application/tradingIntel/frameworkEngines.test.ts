import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  backtestVectorbt: vi.fn(), backtestKronos: vi.fn(), backtestTradingAgents: vi.fn(),
  backtestNautilus: vi.fn(async () => ({
    ok: true, symbol: 'XAUUSD', interval: '1h', bars: 1000,
    strategies: {
      'nt:atr-breakout': { netReturnPct: 0.12, winRate: 0.48, profitFactor: 1.3, trades: 64, maxDrawdownPct: 0.07, sharpe: 1.1 },
      'nt:ema-bracket': { netReturnPct: -0.02, winRate: 0.4, profitFactor: 0.9, trades: 12, maxDrawdownPct: 0.05, sharpe: -0.2 },
    },
  })),
  frameworksStatus: vi.fn(async () => ({ ok: true, frameworks: { nt: { installed: true } } })),
}));

import { FRAMEWORK_ENGINES, runFrameworkEngine, toFrameworkResults } from './frameworkEngines';

describe('frameworkEngines', () => {
  it('Nautilus in één vorm, met aannames, steekproef en geschiktheid', async () => {
    const res = await runFrameworkEngine({ engine: 'nt', symbol: 'xauusd', timeframe: '1h' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const a = res.results.find(r => r.strategy === 'nt:atr-breakout')!;
    expect(a).toMatchObject({ engine: 'nt', kind: 'rule', symbol: 'XAUUSD', timeframe: 'h1', sampleSize: 64, dateRange: null });
    expect(a.assumptions.stops).toMatch(/bracket/);
    expect(a.eligibility.eligible).toBe(true);
    expect(a.warnings).toContain('Engine does not report its date range');
    const b = res.results.find(r => r.strategy === 'nt:ema-bracket')!;
    expect(b.eligibility.eligible).toBe(false);
    expect(b.warnings.join()).toMatch(/Only 12 trades/);
  });

  it('een forecaster of debat buiten zijn timeframe: geen getal', async () => {
    expect(await runFrameworkEngine({ engine: 'kr', symbol: 'XAUUSD', timeframe: '4h' })).toMatchObject({ ok: false, error: 'Kronos is built for h1, not h4' });
    expect(await runFrameworkEngine({ engine: 'ta', symbol: 'XAUUSD', timeframe: '1h' })).toMatchObject({ ok: false });
  });

  it('vectorbt draagt de waarschuwing dat er geen kosten en geen stop zijn', () => {
    const [r] = toFrameworkResults({
      engine: FRAMEWORK_ENGINES.vbt, symbol: 'EURUSD', timeframe: 'h1', health: { vbt: true },
      response: { ok: true, symbol: 'EURUSD', interval: '1h', bars: 1000, strategies: { 'vbt:macd': { netReturnPct: 0.3, winRate: 0.5, profitFactor: 1.5, trades: 80, maxDrawdownPct: 0.1, sharpe: 1 } } },
    });
    expect(r.warnings.join()).toMatch(/No costs modelled/);
    expect(r.warnings.join()).toMatch(/No stop-loss modelled/);
  });
});
