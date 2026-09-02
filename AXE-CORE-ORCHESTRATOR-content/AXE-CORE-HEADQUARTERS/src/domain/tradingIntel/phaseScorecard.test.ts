import { describe, it, expect } from 'vitest';
import {
  scorePhases, outlierPhase, MATERIAL_MOVE_PCT, MIN_DROPS_TO_JUDGE,
} from './phaseScorecard';

const drop = (phase: string, movePct: number | null, i = 0) => ({
  pairId: `P${i}`, phase, at: '2026-08-27T00:00:00Z',
  priceAtDrop: movePct == null ? null : 100,
  priceAfter: movePct == null ? null : 100 * (1 + movePct),
});

const many = (phase: string, n: number, movePct: number | null) =>
  Array.from({ length: n }, (_, i) => drop(phase, movePct, i));

describe('scorePhases', () => {
  it('counts a big move after a drop as a miss', () => {
    const [s] = scorePhases(many('strength', MIN_DROPS_TO_JUDGE, 0.02));
    expect(s.judged).toBe(MIN_DROPS_TO_JUDGE);
    expect(s.misses).toBe(MIN_DROPS_TO_JUDGE);
    expect(s.missRate).toBe(1);
  });

  it('counts a pair that went nowhere as a good drop', () => {
    const [s] = scorePhases(many('strength', MIN_DROPS_TO_JUDGE, 0.001));
    expect(s.misses).toBe(0);
    expect(s.missRate).toBe(0);
  });

  it('does not care which way the move went', () => {
    // The phase decides whether a pair is worth attention, not which way it
    // goes — a 2% fall was as much a trade as a 2% rise.
    const up = scorePhases(many('a', MIN_DROPS_TO_JUDGE, 0.02))[0];
    const down = scorePhases(many('a', MIN_DROPS_TO_JUDGE, -0.02))[0];
    expect(up.missRate).toBe(down.missRate);
  });

  it('separates a move just over the threshold from one just under', () => {
    // The boundary itself is not asserted exactly: 100 * 1.008 - 100 lands at
    // 0.00799999… in binary, so an exact-equality test measures floating point
    // rather than behaviour. What has to hold is that the threshold divides.
    const over = scorePhases(many('a', MIN_DROPS_TO_JUDGE, MATERIAL_MOVE_PCT * 1.01))[0];
    const under = scorePhases(many('a', MIN_DROPS_TO_JUDGE, MATERIAL_MOVE_PCT * 0.99))[0];
    expect(over.misses).toBe(MIN_DROPS_TO_JUDGE);
    expect(under.misses).toBe(0);
  });

  it('withholds a rate when there are too few drops to mean anything', () => {
    // Three drops and one miss is 33%, and it means nothing. This is the number
    // most likely to be acted on wrongly, so it is not shown as a number.
    const [s] = scorePhases([drop('rrr', 0.02, 1), drop('rrr', 0.0, 2), drop('rrr', 0.0, 3)]);
    expect(s.judged).toBe(3);
    expect(s.missRate).toBeNull();
    expect(s.reading).toContain('too few');
  });

  it('reports coverage separately instead of silently dropping unknowns', () => {
    const [s] = scorePhases([...many('a', MIN_DROPS_TO_JUDGE, 0.0), ...many('a', 5, null)]);
    expect(s.judged).toBe(MIN_DROPS_TO_JUDGE);
    expect(s.unscored).toBe(5);
  });

  it('survives a zero or non-finite price without dividing by it', () => {
    const bad = [
      { pairId: 'X', phase: 'a', at: 'now', priceAtDrop: 0, priceAfter: 5 },
      { pairId: 'Y', phase: 'a', at: 'now', priceAtDrop: NaN, priceAfter: 5 },
      { pairId: 'Z', phase: 'a', at: 'now', priceAtDrop: 100, priceAfter: Infinity },
    ];
    const [s] = scorePhases(bad);
    expect(s.judged).toBe(0);
    expect(s.unscored).toBe(3);
    expect(s.missRate).toBeNull();
  });

  it('puts the phase throwing away the most that mattered first', () => {
    const scores = scorePhases([
      ...many('good', MIN_DROPS_TO_JUDGE, 0.0),
      ...many('bad', MIN_DROPS_TO_JUDGE, 0.02),
    ]);
    expect(scores[0].phase).toBe('bad');
  });
});

describe('outlierPhase', () => {
  it('stays silent when only one phase has a readable rate', () => {
    // A single number has nothing to be out of line with.
    const scores = scorePhases([...many('a', MIN_DROPS_TO_JUDGE, 0.02), drop('b', 0.02, 99)]);
    expect(outlierPhase(scores)).toBeNull();
  });

  it('stays silent when every phase is about as good as the others', () => {
    const scores = scorePhases([
      ...many('a', MIN_DROPS_TO_JUDGE, 0.02),
      ...many('b', MIN_DROPS_TO_JUDGE, 0.02),
    ]);
    expect(outlierPhase(scores)).toBeNull();
  });

  it('names the phase that is well out of line', () => {
    const scores = scorePhases([
      ...many('fine', MIN_DROPS_TO_JUDGE, 0.0),
      ...many('suspect', MIN_DROPS_TO_JUDGE, 0.02),
    ]);
    expect(outlierPhase(scores)?.phase).toBe('suspect');
  });
});
