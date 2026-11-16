import { describe, it, expect, vi, beforeEach } from 'vitest';

const eod = vi.hoisted(() => ({ fetchEodHistoryChecked: vi.fn() }));
vi.mock('@/infrastructure/gateways/researchSources', () => eod);

import { runCharts, MIN_CHART_BARS } from './charts';

const bars = (closes: number[]) => closes.map((close, i) => ({
  date: `2026-11-${String(i + 1).padStart(2, '0')}`, open: close, high: close, low: close, close,
}));

beforeEach(() => { eod.fetchEodHistoryChecked.mockReset(); });

describe('runCharts R:R', () => {
  it('measures its own 2.2R target back as exactly 2.2, not 2.1999999', async () => {
    eod.fetchEodHistoryChecked.mockResolvedValue({
      bars: bars([1.1, 1.102, 1.101, 1.103, 1.105, 1.104, 1.106, 1.108, 1.107, 1.109]),
      fromCache: false, problem: null,
    });
    const c = await runCharts('EURUSD', null);
    expect(c.noData).toBeUndefined();
    expect(c.riskReward).toBe(2.2);
    expect(c.structureOk).toBe(true);
  });
});

describe('runCharts no data', () => {
  it('names the reason from the data source instead of "insufficient bars"', async () => {
    eod.fetchEodHistoryChecked.mockResolvedValue({
      bars: [], fromCache: false,
      problem: { code: 'quota', detail: 'EODHD daily allowance spent or plan limit (HTTP 402)' },
    });
    const c = await runCharts('EURUSD', null);
    expect(c.structureOk).toBe(false);
    expect(c.noData).toEqual({ code: 'quota', detail: 'EODHD daily allowance spent or plan limit (HTTP 402)' });
    expect(c.notes.join(' ')).toContain('no_data: quota');
    expect(c.notes.join(' ')).not.toContain('insufficient bars');
  });

  it('reports too_few_bars when the source answered with fewer than the minimum', async () => {
    eod.fetchEodHistoryChecked.mockResolvedValue({ bars: bars([1.1, 1.2]), fromCache: false, problem: null });
    const c = await runCharts('EURUSD', null);
    expect(c.noData?.code).toBe('too_few_bars');
    expect(c.noData?.detail).toContain(String(MIN_CHART_BARS));
  });

  it('turns a thrown error into no_data and does not leak its message', async () => {
    eod.fetchEodHistoryChecked.mockImplementation(() => { throw new Error('fetch failed https://eodhd.com/api/eod/X?api_token=SECRET'); });
    const c = await runCharts('EURUSD', null);
    expect(c.noData?.code).toBe('network');
    expect(JSON.stringify(c)).not.toContain('SECRET');
  });
});
