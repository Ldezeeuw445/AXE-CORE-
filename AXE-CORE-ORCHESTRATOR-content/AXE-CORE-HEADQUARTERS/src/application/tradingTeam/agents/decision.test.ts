import { describe, it, expect } from 'vitest';
import { runDecision } from './decision';
import type { ChartsResult, RiskResult, ScoutResult, SentimentResult } from '../types';

const scout: ScoutResult = {
  scannedAt: '2026-11-16T12:00:00.000Z',
  watchlist: ['EURUSD'],
  candidates: [{ symbol: 'EURUSD', score: 90, reason: 'watchlist rank 1' }],
  notes: [],
};
const neutral: SentimentResult = { symbol: 'EURUSD', bias: 'neutral', score: 50, notes: [] };
const riskOk: RiskResult = { ok: true, blockedReasons: [], checks: [], suggestedLots: 0.1 };

function charts(riskReward: number): ChartsResult {
  return {
    symbol: 'EURUSD', bias: 'bullish', entry: 1.1, stopLoss: 1.09, takeProfit: 1.122,
    riskReward, structureOk: true, notes: [],
  };
}

describe('runDecision R:R boundary', () => {
  it('GO when Charts measures its own 2.2R target back as 2.199999999999984', () => {
    // Before the fix this was WAIT at 0.67 — the +0.10 bonus was skipped by `>= 2.2`.
    const d = runDecision({ scout, sentiment: neutral, charts: charts(2.199999999999984), risk: riskOk });
    expect(d.verdict).toBe('GO');
    expect(d.confidence).toBeCloseTo(0.77, 5);
    expect(d.proposal?.symbol).toBe('EURUSD');
  });

  it('GO exactly on 2.2', () => {
    expect(runDecision({ scout, sentiment: neutral, charts: charts(2.2), risk: riskOk }).verdict).toBe('GO');
  });

  it('stays WAIT just under the line, so the fix is not a free pass', () => {
    const d = runDecision({ scout, sentiment: neutral, charts: charts(2.19), risk: riskOk });
    expect(d.verdict).toBe('WAIT');
    expect(d.confidence).toBeCloseTo(0.67, 5);
  });

  it('does not GO when sentiment disagrees with the side', () => {
    const bear: SentimentResult = { symbol: 'EURUSD', bias: 'bearish', score: 35, notes: [] };
    expect(runDecision({ scout, sentiment: bear, charts: charts(2.2), risk: riskOk }).verdict).not.toBe('GO');
  });
});

describe('runDecision no data', () => {
  const noData: ChartsResult = {
    symbol: 'EURUSD', bias: 'neutral', structureOk: false,
    noData: { code: 'quota', detail: 'EODHD daily allowance spent or plan limit (HTTP 402)' },
    notes: [],
  };

  it('says NO-DATA with the reason instead of a chart verdict', () => {
    const risk: RiskResult = { ok: false, blockedReasons: ['no_data'], checks: [], suggestedLots: 0.1 };
    const d = runDecision({ scout, sentiment: neutral, charts: noData, risk });
    expect(d.verdict).toBe('NO-DATA');
    expect(d.confidence).toBe(0);
    expect(d.proposal).toBeNull();
    expect(d.summary).toContain('quota');
    expect(d.notes).toContain('no_data');
    expect(d.notes).not.toContain('min_rr');
    expect(d.notes).not.toContain('structure');
  });
});
