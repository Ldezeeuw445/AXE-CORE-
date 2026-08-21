/**
 * The rotating self-test window.
 *
 * The ledger decides which strategy and which timeframe a pair is traded with,
 * and it only learns from the self-test. On 2026-08-21 the self-test walked the
 * WATCHLIST only, so the ledger held rows for five pairs — ETHUSD, BTCUSD,
 * XAUUSD, NAS100, US30 — while the screen looked at twenty-two. On every other
 * pair there was nothing to rank, so the desk showed BTCUSD and AUDUSD and
 * little else. He was not choosing badly; he had nothing to choose from.
 *
 * The window logic is arithmetic, so it is tested as arithmetic: the property
 * that matters is that repeated runs COVER the universe rather than circling
 * the same head of the list forever.
 */
import { describe, it, expect } from 'vitest';

/** Mirrors selfTestUniverse's window step in agentAutopilot.ts. */
function windowAt(universe: string[], offset: number, size: number): string[] {
  if (universe.length <= size) return universe;
  return Array.from({ length: size }, (_, k) => universe[(offset + k) % universe.length]);
}

const UNIVERSE = [
  'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD',
  'USDCAD', 'BTCUSD', 'ETHUSD', 'US30', 'US500', 'NAS100', 'GER40', 'UK100',
  'WTIUSD', 'SILVER', 'DJ30', 'UK100', 'FRA40', 'JP225',
];
const SIZE = 6;

describe('the self-test window', () => {
  it('covers every tradeable pair within a few runs', () => {
    const seen = new Set<string>();
    let offset = 0;
    // Twice a day at six a pair, a 22-pair universe should close in ~2 days.
    for (let run = 0; run < 4; run++) {
      for (const p of windowAt(UNIVERSE, offset, SIZE)) seen.add(p);
      offset = (offset + SIZE) % UNIVERSE.length;
    }
    for (const pair of new Set(UNIVERSE)) {
      expect(seen.has(pair), `${pair} never entered the ledger`).toBe(true);
    }
  });

  it('moves on instead of re-testing the head of the list', () => {
    const first = windowAt(UNIVERSE, 0, SIZE);
    const second = windowAt(UNIVERSE, SIZE, SIZE);
    // The exact failure this replaces: a fixed list means pair six onwards is
    // never reached, however many times the self-test runs.
    expect(second).not.toEqual(first);
    expect(second.some(p => !first.includes(p))).toBe(true);
  });

  it('wraps around the end rather than running short', () => {
    const nearEnd = windowAt(UNIVERSE, UNIVERSE.length - 2, SIZE);
    expect(nearEnd).toHaveLength(SIZE);
    expect(nearEnd[0]).toBe(UNIVERSE[UNIVERSE.length - 2]);
    expect(nearEnd[2]).toBe(UNIVERSE[0]);
  });

  it('takes the whole universe when it is smaller than the window', () => {
    const small = ['BTCUSD', 'ETHUSD'];
    expect(windowAt(small, 0, SIZE)).toEqual(small);
  });
});
