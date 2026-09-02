/**
 * Expectancy is the ranking metric, so one impossible row outranks every
 * honest strategy on the board — permanently, and without looking wrong on any
 * screen that shows a win rate.
 *
 * The real case: until 2026-08-20 the reconciler divided profit by
 * openPrice × volume, and MT5 volume is in lots. NAS100 fib-retracement came
 * out at +72 495% over eight trades and went straight to the top of the
 * ranking that decides what gets traded next.
 */
import { describe, it, expect } from 'vitest';
import {
  ledgerStats, liveRecordIsPlausible, MAX_PLAUSIBLE_RETURN_PER_TRADE,
  type LedgerEntry,
} from './tradingLedgerService';

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    run: 'run-1', pair: 'BTCUSD', strategy: 'volumetric-ob', timeframe: 'h1',
    trades: 10, wins: 8, losses: 2,
    grossWinPct: 0.06, grossLossPct: -0.02, netReturnPct: 0.04,
    updatedAt: '2026-08-26T12:00:00Z',
    ...over,
  };
}

describe('liveRecordIsPlausible', () => {
  it('accepts a normal record', () => {
    expect(liveRecordIsPlausible(entry())).toBe(true);
  });

  it('rejects the NAS100 row exactly as it was stored', () => {
    expect(liveRecordIsPlausible(entry({
      pair: 'NAS100', strategy: 'fib-retracement',
      trades: 8, wins: 7, losses: 1,
      grossWinPct: 724.96, grossLossPct: -0.0067, netReturnPct: 724.95,
    }))).toBe(false);
  });

  it('rejects the silver row, where the two sides nearly cancel', () => {
    // Net is a harmless +1.18, so anything looking only at net would pass it.
    // The per-trade size is what gives it away.
    expect(liveRecordIsPlausible(entry({
      pair: 'SILVER', strategy: 'mean-reversion',
      trades: 3, wins: 2, losses: 1,
      grossWinPct: 47.45, grossLossPct: -46.27, netReturnPct: 1.18,
    }))).toBe(false);
  });

  it('has nothing to judge on a row with no trades', () => {
    expect(liveRecordIsPlausible(entry({ trades: 0, wins: 0, losses: 0, grossWinPct: 0, grossLossPct: 0 }))).toBe(true);
  });

  it('draws the line where the constant says', () => {
    const justUnder = entry({ trades: 1, grossWinPct: MAX_PLAUSIBLE_RETURN_PER_TRADE - 0.01 });
    const justOver = entry({ trades: 1, grossWinPct: MAX_PLAUSIBLE_RETURN_PER_TRADE + 0.01 });
    expect(liveRecordIsPlausible(justUnder)).toBe(true);
    expect(liveRecordIsPlausible(justOver)).toBe(false);
  });
});

describe('ledgerStats with an untrusted record', () => {
  it('does not let an impossible row outrank an honest one', () => {
    const honest = ledgerStats(entry());
    const corrupt = ledgerStats(entry({
      pair: 'NAS100', trades: 8, wins: 7, losses: 1,
      grossWinPct: 724.96, grossLossPct: -0.0067, netReturnPct: 724.95,
    }));
    expect(corrupt.expectancy).toBeLessThan(honest.expectancy);
  });

  it('falls back to the backtest prior rather than discarding the row', () => {
    // Throwing the whole row away would lose a perfectly good prior — the
    // NAS100 backtest read 17.7% over 43 trades and was never suspect.
    const stats = ledgerStats(entry({
      trades: 8, grossWinPct: 724.96, netReturnPct: 724.95,
      backtest: { netReturnPct: 0.177, winRate: 0.488, profitFactor: 1.41, trades: 43, timeframe: 'h1', bars: 1000, at: '2026-08-20T22:55:22Z' },
    }));
    expect(stats.liveTrusted).toBe(false);
    expect(stats.expectancy).toBeGreaterThan(0);
    expect(stats.expectancy).toBeCloseTo((0.177 / 43) * 0.7, 6);
  });

  it('reports no confidence in an untrusted live record', () => {
    const stats = ledgerStats(entry({ trades: 30, grossWinPct: 724.96, netReturnPct: 724.95 }));
    expect(stats.confidence).toBe(0);
  });

  it('still shows the raw win rate, because that part is not in doubt', () => {
    // 7 of 8 really did close green; only the SIZE is wrong. Hiding the win
    // rate would remove a true fact along with the false one.
    const stats = ledgerStats(entry({ trades: 8, wins: 7, losses: 1, grossWinPct: 724.96 }));
    expect(stats.winRate).toBeCloseTo(7 / 8, 6);
  });
});
