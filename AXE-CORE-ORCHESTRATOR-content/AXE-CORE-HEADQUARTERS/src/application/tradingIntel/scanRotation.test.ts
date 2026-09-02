/**
 * Why the same pairs kept getting traded.
 *
 * The cheap screen walks a window of the universe and breaks as soon as it has
 * flagged its budget, so whatever sits at the front of that window is what gets
 * researched, decided and traded. The window only rotated when the universe was
 * larger than MAX_SCAN_EXAMINED (40) — with a 30-pair watchlist it never was,
 * so the front never moved and the tail was never reached.
 */
import { describe, it, expect } from 'vitest';
import { nextScanWindow, flaggedBudget } from './agentAutopilot';

const universe = (n: number) => Array.from({ length: n }, (_, i) => `PAIR${i}`);

describe('nextScanWindow', () => {
  it('rotates a universe smaller than the window', () => {
    // The regression itself: 30 pairs, window of 40.
    const pairs = universe(30);
    const first = nextScanWindow(pairs, 0, 10);
    const second = nextScanWindow(pairs, first.nextOffset, 10);
    expect(second.window[0]).not.toBe(first.window[0]);
  });

  it('reaches every pair, including the tail the budget never got to', () => {
    const pairs = universe(30);
    const budget = flaggedBudget(1);
    const seen = new Set<string>();
    let offset = 0;
    for (let cycle = 0; cycle < 30; cycle++) {
      const { window, nextOffset } = nextScanWindow(pairs, offset, budget);
      // Only the pairs the screen actually looks at before it breaks count.
      window.slice(0, budget).forEach(p => seen.add(p));
      offset = nextOffset;
    }
    expect(seen.size).toBe(pairs.length);
  });

  it('steps by the budget, not by the window, so nothing is skipped', () => {
    // Stepping by the window (40) over 30 pairs would jump past pairs the
    // previous cycle stopped short of.
    const pairs = universe(30);
    expect(nextScanWindow(pairs, 0, 10).nextOffset).toBe(10);
  });

  it('still rotates a universe larger than the window', () => {
    const pairs = universe(100);
    const first = nextScanWindow(pairs, 0, 10);
    expect(first.window).toHaveLength(40);
    expect(first.nextOffset).toBe(10);
  });

  it('wraps instead of running off the end', () => {
    const pairs = universe(30);
    const { window, nextOffset } = nextScanWindow(pairs, 28, 10);
    expect(window[0]).toBe('PAIR28');
    expect(window[2]).toBe('PAIR0');
    expect(nextOffset).toBe(8);
  });

  it('never emits an undefined symbol', () => {
    for (const n of [1, 2, 7, 30, 41]) {
      const { window } = nextScanWindow(universe(n), 5, 10);
      expect(window).toHaveLength(Math.min(40, n));
      expect(window.every(Boolean)).toBe(true);
    }
  });

  it('survives a stored offset that is stale, negative or not a number', () => {
    // The offset is persisted across restarts and outlives watchlist edits.
    const pairs = universe(30);
    expect(nextScanWindow(pairs, 999, 10).window[0]).toBe('PAIR9');
    expect(nextScanWindow(pairs, -1, 10).window[0]).toBe('PAIR29');
    expect(nextScanWindow(pairs, NaN, 10).window[0]).toBe('PAIR0');
  });

  it('advances by at least one pair even on a nonsense budget', () => {
    // A stalled offset is the bug; never reintroduce it via a zero step.
    const pairs = universe(30);
    expect(nextScanWindow(pairs, 0, 0).nextOffset).toBe(1);
    expect(nextScanWindow(pairs, 0, -5).nextOffset).toBe(1);
  });

  it('has nothing to walk on an empty universe', () => {
    expect(nextScanWindow([], 3, 10)).toEqual({ window: [], nextOffset: 0 });
  });
});
