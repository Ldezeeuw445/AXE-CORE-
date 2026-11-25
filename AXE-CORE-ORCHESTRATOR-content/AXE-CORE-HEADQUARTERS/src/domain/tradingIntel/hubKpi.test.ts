import { describe, expect, it } from 'vitest';
import { geledenKort, perStrategie, pnlCurve, pnlPerDag, terugvalPct, winRate, type HubTrade } from './hubKpi';

const t = (pnl: number | null, closed: string | null, strategy: string | null = 'ICT', status = 'closed'): HubTrade =>
  ({ symbol: 'EURUSD', side: 'buy', status, pnl, closed_at: closed, opened_at: '2026-09-01T00:00:00Z', strategy, venue: 'metaapi' });

describe('trading hub KPI', () => {
  const trades = [
    t(100, '2026-09-02T10:00:00Z'), t(-40, '2026-09-01T10:00:00Z', null), t(25, '2026-09-02T12:00:00Z', 'Breakout'),
    t(null, null, 'ICT', 'open'), t(Number.NaN, '2026-09-03T00:00:00Z'),
  ];
  it('curve: opgeteld op sluittijd, open en kapotte rijen tellen niet', () => {
    expect(pnlCurve(trades).map((p) => p.v)).toEqual([-40, 60, 85]);
    expect(pnlCurve([])).toEqual([]);
  });
  it('win rate over de laatste n', () => {
    expect(winRate(trades)).toEqual({ pct: 67, n: 3 });
    expect(winRate(trades, 1)).toEqual({ pct: 100, n: 1 });
    expect(winRate([])).toBeNull();
  });
  it('per dag en per strategie', () => {
    expect(pnlPerDag(trades)).toEqual([{ dag: '2026-09-01', pnl: -40, trades: 1 }, { dag: '2026-09-02', pnl: 125, trades: 2 }]);
    expect(perStrategie(trades)).toEqual([{ naam: 'ICT', pnl: 100, n: 1 }, { naam: 'No strategy', pnl: -40, n: 1 }, { naam: 'Breakout', pnl: 25, n: 1 }]);
  });
  it('terugval en leeftijd', () => {
    expect(terugvalPct(1000, 950)).toBe(5);
    expect(terugvalPct(1000, 1100)).toBe(0);
    expect(terugvalPct(null, 1)).toBeNull();
    const nu = Date.parse('2026-11-25T12:00:00Z');
    expect([geledenKort('2026-11-25T08:00:00Z', nu), geledenKort('2026-11-20T12:00:00Z', nu), geledenKort('2026-09-23T09:00:00Z', nu), geledenKort(null, nu)])
      .toEqual(['today', '5d ago', '2mo ago', '']);
  });
});
