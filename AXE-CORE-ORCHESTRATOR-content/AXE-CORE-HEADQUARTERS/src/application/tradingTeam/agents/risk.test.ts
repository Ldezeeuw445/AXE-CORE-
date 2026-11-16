import { describe, it, expect } from 'vitest';
import { runRisk } from './risk';
import type { ChartsResult, NewsResult } from '../types';

const calm: NewsResult = { symbol: 'EURUSD', headlines: [], highImpactWithin2h: false, events: [], notes: [] };
const good: ChartsResult = {
  symbol: 'EURUSD', bias: 'bullish', entry: 1.1, stopLoss: 1.09, takeProfit: 1.122,
  riskReward: 2.199999999999984, structureOk: true, notes: [],
};

describe('runRisk', () => {
  it('passes a setup whose R:R is 2.0 within float noise', () => {
    const r = runRisk({ news: calm, charts: { ...good, riskReward: 1.9999999999999 } });
    expect(r.ok).toBe(true);
    expect(r.blockedReasons).toEqual([]);
  });

  it('still blocks a real low R:R and a weak structure', () => {
    const r = runRisk({ news: calm, charts: { ...good, riskReward: 1.5, structureOk: false } });
    expect(r.ok).toBe(false);
    expect(r.blockedReasons).toEqual(['min_rr', 'structure']);
  });

  it('reports no_data, and not min_rr / structure, when Charts could not look', () => {
    const noData: ChartsResult = {
      symbol: 'EURUSD', bias: 'neutral', structureOk: false,
      noData: { code: 'empty', detail: 'EODHD returned no bars for EURUSD.FOREX' }, notes: [],
    };
    const r = runRisk({ news: calm, charts: noData });
    expect(r.ok).toBe(false);
    expect(r.blockedReasons).toEqual(['no_data']);
    const check = r.checks.find(c => c.id === 'chart_data');
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('empty');
    expect(r.checks.find(c => c.id === 'min_rr')).toBeUndefined();
  });

  it('keeps the news window as its own reason', () => {
    const r = runRisk({ news: { ...calm, highImpactWithin2h: true }, charts: good });
    expect(r.blockedReasons).toEqual(['news_window']);
  });
});
