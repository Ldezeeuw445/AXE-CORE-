import { describe, it, expect } from 'vitest';
import { RR_EPSILON, roundRiskReward, rrAtLeast } from './riskReward';

describe('rrAtLeast', () => {
  it('accepts the values the live runs actually produced for a 2.2R target', () => {
    // core_trading_team_runs, 10–12 nov 2026: these made every GO impossible.
    expect(2.199999999999984 >= 2.2).toBe(false);
    expect(rrAtLeast(2.199999999999984, 2.2)).toBe(true);
    expect(rrAtLeast(2.199999999999992, 2.2)).toBe(true);
  });

  it('holds the boundary on both sides', () => {
    expect(rrAtLeast(2.2, 2.2)).toBe(true);
    expect(rrAtLeast(2.2 - RR_EPSILON / 2, 2.2)).toBe(true);
    expect(rrAtLeast(2.2 - RR_EPSILON * 2, 2.2)).toBe(false);
    expect(rrAtLeast(2.19, 2.2)).toBe(false);
    expect(rrAtLeast(2.21, 2.2)).toBe(true);
    expect(rrAtLeast(1.9999999999, 2)).toBe(true);
    expect(rrAtLeast(1.99, 2)).toBe(false);
  });

  it('never lets a missing or broken R:R through', () => {
    expect(rrAtLeast(undefined, 0)).toBe(false);
    expect(rrAtLeast(null, 0)).toBe(false);
    expect(rrAtLeast(Number.NaN, 0)).toBe(false);
    expect(rrAtLeast(Number.POSITIVE_INFINITY, 2)).toBe(false);
  });
});

describe('roundRiskReward', () => {
  it('rounds float noise at the source', () => {
    expect(roundRiskReward(2.199999999999984)).toBe(2.2);
    expect(roundRiskReward(2.2000000000000006)).toBe(2.2);
    expect(roundRiskReward(0.5)).toBe(0.5);
  });
  it('keeps non-finite visible as NaN', () => {
    expect(Number.isNaN(roundRiskReward(Number.NaN))).toBe(true);
    expect(Number.isNaN(roundRiskReward(Number.POSITIVE_INFINITY))).toBe(true);
  });
});
