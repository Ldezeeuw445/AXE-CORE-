import { describe, it, expect } from 'vitest';
import {
  sizeMultiplier, MIN_MULT, MAX_MULT, MIN_TRADES, STRONG_PER_TRADE,
} from './edgeSizing';

const ev = (trades: number, netReturnPct: number, liveTrusted = true) =>
  ({ trades, netReturnPct, liveTrusted });

describe('sizeMultiplier', () => {
  it('sizes flat when there is no evidence at all', () => {
    expect(sizeMultiplier(null).multiplier).toBe(1);
    expect(sizeMultiplier(undefined).multiplier).toBe(1);
  });

  it('sizes flat — never small — on untrusted counters', () => {
    // run-1 carries permanently inflated returns from the old divisor bug.
    // Enormous AND impossible: this must not become a huge position.
    const d = sizeMultiplier(ev(40, 12, false));
    expect(d.multiplier).toBe(1);
    expect(d.reason).toContain('not trustworthy');
  });

  it('barely moves on a tiny winning sample — the classic trap', () => {
    // 3 trades, all winners, a spectacular per-trade return. A naive rule
    // sizes this biggest; it is the reading most likely to be pure noise.
    const d = sizeMultiplier(ev(3, 0.09));
    expect(d.multiplier).toBe(1);
    expect(d.reason).toContain('too few');
  });

  it('at exactly MIN_TRADES it starts to act, but only slightly', () => {
    const d = sizeMultiplier(ev(MIN_TRADES, MIN_TRADES * STRONG_PER_TRADE));
    // trust = 5/25 = 0.2, raw = 2  ->  1 + 1*0.2 = 1.2
    expect(d.multiplier).toBeCloseTo(1.2, 5);
  });

  it('trusts the same reading more as the sample grows', () => {
    const small = sizeMultiplier(ev(10, 10 * STRONG_PER_TRADE)).multiplier;
    const mid = sizeMultiplier(ev(60, 60 * STRONG_PER_TRADE)).multiplier;
    const big = sizeMultiplier(ev(400, 400 * STRONG_PER_TRADE)).multiplier;
    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(big);
    expect(big).toBeLessThanOrEqual(MAX_MULT);
  });

  it('shrinks a well-sampled loser', () => {
    // The measured case: 15 trades, 15 losses, -15.8%.
    const d = sizeMultiplier(ev(15, -0.158));
    expect(d.multiplier).toBeLessThan(1);
    expect(d.multiplier).toBeGreaterThanOrEqual(MIN_MULT);
  });

  it('sizes the proven winner above the proven loser on the same pair', () => {
    const winner = sizeMultiplier(ev(15, 0.132)).multiplier;   // volumetric-ob
    const loser = sizeMultiplier(ev(15, -0.158)).multiplier;
    expect(winner).toBeGreaterThan(loser);
  });

  it('never leaves the bounds, however extreme the input', () => {
    for (const e of [ev(5000, 500), ev(5000, -500), ev(1e6, 1e-9), ev(9, 0)]) {
      const m = sizeMultiplier(e).multiplier;
      expect(m).toBeGreaterThanOrEqual(MIN_MULT);
      expect(m).toBeLessThanOrEqual(MAX_MULT);
      expect(Number.isFinite(m)).toBe(true);
    }
  });

  it('treats a break-even record as flat', () => {
    expect(sizeMultiplier(ev(50, 0)).multiplier).toBeCloseTo(1, 10);
  });

  it('never returns NaN on corrupt numbers', () => {
    for (const e of [ev(NaN, 1), ev(10, NaN), ev(Infinity, 1), ev(10, Infinity)]) {
      expect(Number.isFinite(sizeMultiplier(e).multiplier)).toBe(true);
    }
  });

  it('cannot turn a losing record into a bigger position', () => {
    // Property: for any sample size, a negative per-trade return never sizes up.
    for (const n of [5, 12, 40, 100, 1000]) {
      expect(sizeMultiplier(ev(n, -0.01 * n)).multiplier).toBeLessThanOrEqual(1);
    }
  });
});
