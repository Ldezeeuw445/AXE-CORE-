/**
 * These numbers go on a screen that decides whether an account is doing well,
 * so the ones that must not be quietly wrong are: a run that has ended is not
 * "current", a window with no loser has no profit factor, and a day is the day
 * the trade closed.
 */
import { describe, it, expect } from 'vitest';
import {
  computeAccountStats, streaksOf, dailyPnl, filterByPeriod, consistencyPct,
  mergeDailyPnl, monthGrid, netOf, dayKeyOf,
} from './accountStats';
import type { ClosedTrade } from './accountStats';

function trade(closeTime: string, profit: number, over: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    symbol: 'XAUUSD', side: 'buy', volume: 0.1,
    openTime: closeTime, closeTime,
    openPrice: 1, closePrice: 1, stopLoss: null, takeProfit: null,
    commission: 0, swap: 0, profit,
    ...over,
  } as ClosedTrade;
}

describe('netOf', () => {
  it('counts commission and swap, not just the headline profit', () => {
    // A "winner" that paid more in costs than it made is a loser, and an
    // account judged on gross profit would never find out.
    expect(netOf(trade('2026-08-01T10:00:00Z', 10, { commission: -6, swap: -5 }))).toBe(-1);
  });
});

describe('dayKeyOf', () => {
  it('files a trade under the day it closed', () => {
    expect(dayKeyOf(trade('2026-08-14T09:30:00', 5))).toBe('2026-08-14');
  });
  it('returns null rather than guessing when there is no time at all', () => {
    expect(dayKeyOf({ ...trade('2026-08-14T09:30:00', 5), openTime: null, closeTime: null })).toBeNull();
  });
});

describe('filterByPeriod', () => {
  const now = new Date('2026-08-25T12:00:00');
  const trades = [
    trade('2026-08-25T09:00:00', 10),
    trade('2026-08-22T09:00:00', 10),
    trade('2026-07-20T09:00:00', 10),
    trade('2024-03-01T09:00:00', 10), // genuinely older than a year
  ];

  it('narrows as the window narrows', () => {
    expect(filterByPeriod(trades, 'day', now)).toHaveLength(1);
    expect(filterByPeriod(trades, 'week', now)).toHaveLength(2);
    // 20 July is 36 days back, so it falls outside a 30-day month but inside
    // the year — the boundary is the thing worth pinning down here.
    expect(filterByPeriod(trades, 'month', now)).toHaveLength(2);
    expect(filterByPeriod(trades, 'year', now)).toHaveLength(3);
    expect(filterByPeriod(trades, 'all', now)).toHaveLength(4);
  });
});

describe('streaksOf', () => {
  it('reports the run the account is on right now, and only that one', () => {
    const s = streaksOf([
      trade('2026-08-01T10:00:00', 5),
      trade('2026-08-02T10:00:00', 5),
      trade('2026-08-03T10:00:00', -5),
      trade('2026-08-04T10:00:00', -5),
      trade('2026-08-05T10:00:00', -5),
    ]);
    expect(s.currentLoss).toBe(3);
    expect(s.currentWin).toBe(0); // the winning run is over — it is not "current"
    expect(s.longestWin).toBe(2);
    expect(s.longestLoss).toBe(3);
  });

  it('ends a run on a scratch without starting a new one', () => {
    const s = streaksOf([
      trade('2026-08-01T10:00:00', 5),
      trade('2026-08-02T10:00:00', 0),
    ]);
    expect(s.currentWin).toBe(0);
    expect(s.currentLoss).toBe(0);
  });

  it('orders by close time, not by array order', () => {
    // Deals come back from brokers in whatever order they like.
    const s = streaksOf([
      trade('2026-08-05T10:00:00', -5),
      trade('2026-08-01T10:00:00', 5),
    ]);
    expect(s.currentLoss).toBe(1);
  });
});

describe('dailyPnl', () => {
  it('sums a day and keeps the days in order', () => {
    const d = dailyPnl([
      trade('2026-08-02T10:00:00', 5),
      trade('2026-08-01T10:00:00', 3),
      trade('2026-08-01T15:00:00', -1),
    ]);
    expect([...d.keys()]).toEqual(['2026-08-01', '2026-08-02']);
    expect(d.get('2026-08-01')).toBe(2);
  });
});

describe('consistencyPct', () => {
  it('shows when one day carried everything', () => {
    // The pattern that fails a prop challenge even while the total is green.
    const d = new Map([['2026-08-01', 900], ['2026-08-02', 50], ['2026-08-03', 50]]);
    expect(consistencyPct(d)).toBeCloseTo(90, 5);
  });

  it('refuses to grade a losing window', () => {
    const d = new Map([['2026-08-01', -100], ['2026-08-02', 20]]);
    expect(consistencyPct(d)).toBeNull();
  });
});

describe('computeAccountStats', () => {
  const now = new Date('2026-08-25T23:00:00');

  it('reports no profit factor when nothing lost, instead of infinity', () => {
    const s = computeAccountStats([trade('2026-08-25T10:00:00', 10)], 'all', now);
    expect(s.profitFactor).toBeNull();
  });

  it('splits win and loss rate over every trade, scratches included', () => {
    const s = computeAccountStats([
      trade('2026-08-25T10:00:00', 10),
      trade('2026-08-25T11:00:00', -10),
      trade('2026-08-25T12:00:00', 0),
    ], 'all', now);
    expect(s.trades).toBe(3);
    expect(s.breakeven).toBe(1);
    expect(s.winRatePct).toBeCloseTo(33.33, 1);
    expect(s.lossRatePct).toBeCloseTo(33.33, 1);
    // The two do not add to 100, and that is the point — the rest scratched.
    expect(s.winRatePct + s.lossRatePct).toBeLessThan(100);
  });

  it('names the best and worst day', () => {
    const s = computeAccountStats([
      trade('2026-08-20T10:00:00', 300),
      trade('2026-08-21T10:00:00', -120),
      trade('2026-08-21T14:00:00', -30),
    ], 'all', now);
    expect(s.bestDay).toEqual({ day: '2026-08-20', net: 300 });
    expect(s.worstDay).toEqual({ day: '2026-08-21', net: -150 });
  });

  it('counts trading days, not calendar days', () => {
    const s = computeAccountStats([
      trade('2026-08-20T10:00:00', 5),
      trade('2026-08-20T11:00:00', 5),
      trade('2026-08-24T10:00:00', 5),
    ], 'all', now);
    expect(s.tradingDays).toBe(2);
  });

  it('is empty rather than broken with no trades at all', () => {
    const s = computeAccountStats([], 'month', now);
    expect(s.trades).toBe(0);
    expect(s.netPnl).toBe(0);
    expect(s.bestDay).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.consistencyPct).toBeNull();
  });
});

describe('mergeDailyPnl', () => {
  it('adds the accounts together per day', () => {
    const merged = mergeDailyPnl([
      new Map([['2026-08-01', 10], ['2026-08-02', -5]]),
      new Map([['2026-08-01', 4]]),
    ]);
    expect(merged.get('2026-08-01')).toBe(14);
    expect(merged.get('2026-08-02')).toBe(-5);
  });
});

describe('monthGrid', () => {
  it('lines the first day up under the right weekday', () => {
    // 1 August 2026 is a Saturday, so Monday-first leaves five blanks.
    const weeks = monthGrid(2026, 7, new Map());
    expect(weeks[0].slice(0, 5).every(c => !c.inMonth)).toBe(true);
    expect(weeks[0][5].date).toBe(1);
  });

  it('always returns whole weeks', () => {
    for (const m of [0, 1, 6, 11]) {
      const weeks = monthGrid(2026, m, new Map());
      for (const w of weeks) expect(w).toHaveLength(7);
    }
  });

  it('separates a day that traded flat from a day with no trades', () => {
    // Zero is a result; null is silence. Colouring them the same would paint
    // every untraded day as breakeven.
    const weeks = monthGrid(2026, 7, new Map([['2026-08-03', 0]]));
    const flat = weeks.flat().find(c => c.day === '2026-08-03');
    const quiet = weeks.flat().find(c => c.day === '2026-08-04');
    expect(flat?.net).toBe(0);
    expect(quiet?.net).toBeNull();
  });
});
