/**
 * Geen blik vooruit in de strategiesignalen.
 *
 * De signaaltest, de zelftest en de Strategy Lab berekenen de StrategySeries
 * over de HELE geschiedenis en lezen het signaal op index i. Dat is alleen eerlijk
 * als het signaal op i niets van i+1… ziet. Deze test vergelijkt voor elke echte
 * strategie het signaal op i uit de volledige reeks met het signaal uit een reeks
 * die bij i ophoudt — en met een reeks waar na i heel andere toekomst aan hangt.
 */
import { describe, it, expect } from 'vitest';
import { computeStrategySignal, DISTINCT_STRATEGIES, type StrategyId } from './strategySignals';
import { buildSeriesFromCandles } from './backtestEngine';

function candles(n: number, seed: number, start = Date.parse('2026-01-05T00:00:00Z')) {
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2 ** 31; return x / 2 ** 31; };
  let p = 2000;
  return Array.from({ length: n }, (_, i) => {
    const o = p;
    const move = (rnd() - 0.5) * 12 + Math.sin(i / 17) * 4;
    const c = o + move;
    const h = Math.max(o, c) + rnd() * 6;
    const l = Math.min(o, c) - rnd() * 6;
    p = c;
    return { time: new Date(start + i * 3_600_000).toISOString(), open: o, high: h, low: l, close: c, volume: 100 + Math.floor(rnd() * 900) };
  });
}

describe('strategiesignalen kijken niet vooruit', () => {
  const base = candles(400, 7);
  const full = buildSeriesFromCandles(base);
  // Dezelfde eerste 250 bars, daarna een totaal andere toekomst.
  const alt = [...base.slice(0, 250), ...candles(150, 99, Date.parse(base[250].time)).map(c => ({ ...c, open: c.open * 1.3, high: c.high * 1.3, low: c.low * 1.3, close: c.close * 1.3 }))];
  const altSeries = buildSeriesFromCandles(alt);

  for (const strategy of [...DISTINCT_STRATEGIES] as StrategyId[]) {
    it(`${strategy}: signaal op i is gelijk met of zonder de bars na i`, () => {
      const diffs: number[] = [];
      for (let i = 60; i < 250; i++) {
        const truncated = buildSeriesFromCandles(base.slice(0, i + 1));
        const a = computeStrategySignal(strategy, full, i);
        const b = computeStrategySignal(strategy, truncated, i);
        const c = computeStrategySignal(strategy, altSeries, i);
        if (a !== b || a !== c) diffs.push(i);
      }
      expect(diffs, `${strategy} ziet de toekomst op bars ${diffs.slice(0, 10).join(', ')}`).toEqual([]);
    });
  }
});
