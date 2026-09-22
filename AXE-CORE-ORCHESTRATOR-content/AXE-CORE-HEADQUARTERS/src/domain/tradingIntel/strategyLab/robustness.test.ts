import { describe, it, expect } from 'vitest';
import {
  bootstrapTrades, liveVsBacktest, regimeBreakdown, selectBest, simulateRange, splitByTime,
  trainValidationTest, walkForward, type RobustInput, type SweepCell,
} from './robustness';
import { estimateInstrument } from './instrumentEstimate';
import type { LabBar, LabMetrics } from './simulate';

const T0 = Date.parse('2026-01-05T00:00:00Z');
/** Stijgt 60% van de tijd, daalt daarna — met een zaagtand zodat stops en doelen geraakt worden. */
function upThenDown(n: number, turn = 0.6): LabBar[] {
  let p = 2000;
  return Array.from({ length: n }, (_, i) => {
    const drift = i < n * turn ? 1.2 : -1.2;
    const o = p; const c = o + drift + Math.sin(i * 1.7) * 4;
    p = c;
    return { time: new Date(T0 + i * 3_600_000).toISOString(), open: o, close: c, high: Math.max(o, c) + 3, low: Math.min(o, c) - 3 };
  });
}

const baseInput = (bars: LabBar[]): RobustInput => ({
  bars,
  signalAt: i => (i % 6 === 0 ? 'buy' : 'hold'),
  cfg: {
    startingBalance: 100_000, sizing: { mode: 'risk', riskPct: 0.01 }, instrument: estimateInstrument('XAUUSD'),
    costs: { spread: 0, commissionPerLot: 0, slippage: 0 }, exitOnOppositeSignal: false,
  },
});
const GRID = { atrMultiple: [1, 1.5, 2], rewardRisk: [1, 1.5, 2] };

describe('train / validatie / test', () => {
  it('een edge die alleen in de trainperiode bestond, wordt als verdwenen gemeld', () => {
    const rep = trainValidationTest(baseInput(upThenDown(1600)), GRID, [0.5, 0.1, 0.4]);
    expect(rep.chosen).not.toBeNull();
    expect(rep.train!.metrics.avgR).toBeGreaterThan(0);
    expect(rep.test!.metrics.avgR).toBeLessThanOrEqual(0);
    expect(rep.warnings.join()).toMatch(/gone on the untouched test segment/);
    expect(rep.degradationR!).toBeGreaterThan(0.1);
  });

  it('de testuitslag hangt niet af van bars ver in de trainperiode (alleen de 60 opwarmbars ervoor)', () => {
    const bars = upThenDown(1200);
    const [, , test] = splitByTime(bars.length, [0.6, 0.2, 0.2]);
    const a = simulateRange(baseInput(bars), test).metrics;
    const changed = bars.map((b, i) => (i < test.from - 60 ? { ...b, open: b.open * 2, high: b.high * 2, low: b.low * 2, close: b.close * 2 } : b));
    const b = simulateRange(baseInput(changed), test).metrics;
    expect(b).toEqual(a);
  });

  it('kiezen negeert cellen met te weinig trades, ook als die de hoogste R hebben', () => {
    const m = (avgR: number, totalTrades: number) => ({ avgR, totalTrades } as LabMetrics);
    const cells: SweepCell[] = [
      { params: { atrMultiple: 1, rewardRisk: 3 }, metrics: m(2.5, 4) },
      { params: { atrMultiple: 1.5, rewardRisk: 1.5 }, metrics: m(0.2, 80) },
    ];
    expect(selectBest(cells)?.params).toEqual({ atrMultiple: 1.5, rewardRisk: 1.5 });
    expect(selectBest([cells[0]])).toBeNull();
  });
});

describe('walk-forward', () => {
  it('testvensters volgen elkaar op zonder overlap en zonder de trainperiode', () => {
    const rep = walkForward(baseInput(upThenDown(2000)), GRID, 4, 0.7);
    expect(rep.folds.length).toBe(4);
    rep.folds.forEach((f, k) => {
      expect(f.test.from).toBe(f.train.to + 1);
      if (k > 0) expect(f.test.from).toBeGreaterThan(rep.folds[k - 1].test.to - 0.5);
    });
    expect(rep.paramStability).toBeGreaterThanOrEqual(0);
    expect(rep.paramStability).toBeLessThanOrEqual(1);
  });
});

describe('bootstrap', () => {
  it('herhaalbaar met dezelfde seed; alleen winsten = geen kans op verlies', () => {
    const a = bootstrapTrades([100, -50, 80, -40, 60], 10_000, { seed: 7 });
    expect(bootstrapTrades([100, -50, 80, -40, 60], 10_000, { seed: 7 })).toEqual(a);
    expect(a.finalReturn.p5).toBeLessThanOrEqual(a.finalReturn.p50);
    expect(a.finalReturn.p50).toBeLessThanOrEqual(a.finalReturn.p95);
    expect(bootstrapTrades([10, 20, 30], 10_000).probLoss).toBe(0);
  });
});

describe('regimes en live tegenover backtest', () => {
  it('elke trade valt in precies één regime', () => {
    const input = baseInput(upThenDown(1200));
    const run = simulateRange(input, { from: 60, to: 1199 });
    const rows = regimeBreakdown(input.bars, run.trades);
    expect(rows.reduce((s, r) => s + r.trades, 0)).toBe(run.trades.length);
    expect(rows.some(r => r.trend === 'up')).toBe(true);
    expect(rows.some(r => r.trend === 'down')).toBe(true);
  });

  it('winst in backtest, verlies live → gemarkeerd; te weinig live → geen oordeel', () => {
    expect(liveVsBacktest({ liveTrades: 8, liveNetReturnPct: -0.02, backtestTrades: 50, backtestNetReturnPct: 0.1 }))
      .toMatchObject({ flagged: true, note: 'profitable in backtest, not live' });
    expect(liveVsBacktest({ liveTrades: 2, liveNetReturnPct: -0.02, backtestTrades: 50, backtestNetReturnPct: 0.1 })?.flagged).toBe(false);
  });
});
