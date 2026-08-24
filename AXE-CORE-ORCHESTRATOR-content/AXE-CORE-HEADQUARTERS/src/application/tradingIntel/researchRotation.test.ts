/**
 * Covering thirty instruments without researching one of them forever.
 */
import { describe, it, expect } from 'vitest';
import { nextBatch, RESEARCH_BATCH } from './researchRotation';
import { allPairIds } from '@/domain/tradingIntel/pairRegistry';

describe('nextBatch', () => {
  it('takes a bounded slice rather than the whole watchlist', () => {
    // Thirty pairs would be 30 model calls and 210 data fetches in one press.
    expect(nextBatch(0).pairs).toHaveLength(RESEARCH_BATCH);
  });

  it('moves on, so a second press researches different pairs', () => {
    const first = nextBatch(0);
    const second = nextBatch(first.nextOffset);
    expect(second.pairs).not.toEqual(first.pairs);
  });

  it('covers every instrument in the watchlist across enough presses', () => {
    const all = allPairIds();
    const seen = new Set<string>();
    let offset = 0;
    for (let i = 0; i < Math.ceil(all.length / RESEARCH_BATCH); i++) {
      const b = nextBatch(offset);
      b.pairs.forEach(p => seen.add(p));
      offset = b.nextOffset;
    }
    expect(seen.size).toBe(all.length);
  });

  it('wraps instead of stopping at the end', () => {
    // Positioning and flow move; coming back round to a pair is the point.
    const all = allPairIds();
    const b = nextBatch(all.length - 1);
    expect(b.pairs).toHaveLength(RESEARCH_BATCH);
    expect(b.pairs[1]).toBe(all[0]);
  });

  it('survives a stored offset that is negative or out of range', () => {
    // Offsets come from persisted settings, which outlive the list they index.
    expect(() => nextBatch(-5)).not.toThrow();
    expect(nextBatch(9999).pairs).toHaveLength(RESEARCH_BATCH);
    expect(nextBatch(-5).pairs.every(p => typeof p === 'string')).toBe(true);
  });
});
