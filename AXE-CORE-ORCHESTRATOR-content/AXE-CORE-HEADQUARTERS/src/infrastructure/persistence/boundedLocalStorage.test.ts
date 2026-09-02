/**
 * The cap has to be in the unit the quota is measured in.
 *
 * Measured 2026-08-25: localStorage held 6.75 MB against WKWebView's ~5 MB,
 * so every setting write failed with "The quota has been exceeded." — WebKit's
 * QuotaExceededError message, which this project had been reading as MetaAPI's
 * rate limit. The caps existed; they counted entries. 400 entries of a
 * 256-float vector is ~1.5 MB no matter how disciplined the count looks.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setBoundedRecord, setBoundedArray, approxBytes } from './boundedLocalStorage';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
});

const vector = (n: number) => Array.from({ length: n }, (_, i) => i / 7);

describe('setBoundedRecord', () => {
  it('keeps a small cache whole', () => {
    const kept = setBoundedRecord('k', [['a', vector(4)], ['b', vector(4)]], 64 * 1024);
    expect(kept).toBe(2);
    expect(Object.keys(JSON.parse(store.get('k')!))).toEqual(['a', 'b']);
  });

  it('stays under the ceiling where a count-based cap would not', () => {
    // 400 entries of a 256-float vector — exactly the shape that filled the
    // quota while passing its own cap.
    const entries: Array<[string, number[]]> = Array.from(
      { length: 400 }, (_, i) => [`key-${i}`, vector(256)],
    );
    const unbounded = approxBytes(JSON.stringify(Object.fromEntries(entries)));
    expect(unbounded).toBeGreaterThan(1_000_000);

    setBoundedRecord('k', entries, 512 * 1024);
    expect(approxBytes(store.get('k')!)).toBeLessThanOrEqual(512 * 1024);
  });

  it('drops the oldest and keeps the newest', () => {
    // The newest entry is the one just computed and about to be read back.
    const entries: Array<[string, number[]]> = Array.from(
      { length: 300 }, (_, i) => [`key-${i}`, vector(256)],
    );
    setBoundedRecord('k', entries, 128 * 1024);
    const kept = Object.keys(JSON.parse(store.get('k')!));
    expect(kept).toContain('key-299');
    expect(kept).not.toContain('key-0');
  });

  it('removes the key rather than leaving an oversized one behind', () => {
    store.set('k', 'stale');
    // One entry that cannot fit at any count.
    expect(setBoundedRecord('k', [['a', vector(4096)]], 64)).toBe(0);
    expect(store.has('k')).toBe(false);
  });

  it('writes nothing but does not throw on an empty cache', () => {
    expect(setBoundedRecord('k', [], 1024)).toBe(0);
  });
});

describe('setBoundedArray', () => {
  it('bounds a memory list by size, newest kept', () => {
    const items = Array.from({ length: 250 }, (_, i) => ({ i, blob: 'x'.repeat(2000) }));
    setBoundedArray('r', items, 256 * 1024);
    const kept = JSON.parse(store.get('r')!) as Array<{ i: number }>;
    expect(approxBytes(store.get('r')!)).toBeLessThanOrEqual(256 * 1024);
    expect(kept.at(-1)!.i).toBe(249);
    expect(kept.length).toBeLessThan(250);
  });

  it('leaves a list that already fits untouched', () => {
    expect(setBoundedArray('r', [1, 2, 3], 1024)).toBe(3);
    expect(JSON.parse(store.get('r')!)).toEqual([1, 2, 3]);
  });
});

describe('the trim itself must be cheap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serialises the whole store a bounded number of times', () => {
    // The first version re-serialised everything on every iteration and looped
    // until it fit — O(n²) on a path that runs per embedding, with the cache
    // deliberately sitting at its ceiling. After it shipped, the app wrote
    // nothing to localStorage for 51 minutes: no autopilot status, no scan
    // offset, no new cycle, while its 60-second tick should have been firing.
    // A synchronous megabyte-scale loop on the main thread stalled the trading
    // loop this fix exists to unblock.
    const entries: Array<[string, number[]]> = Array.from(
      { length: 400 }, (_, i) => [`key-${i}`, vector(256)],
    );

    const real = JSON.stringify;
    let wholeStoreSerialisations = 0;
    vi.spyOn(JSON, 'stringify').mockImplementation(((value: unknown, ...rest: unknown[]) => {
      // Only count passes over the whole collection, not the per-entry measure.
      if (Array.isArray(value) ? value.length > 300 : value && typeof value === 'object' && Object.keys(value as object).length > 300) {
        wholeStoreSerialisations += 1;
      }
      return (real as (v: unknown, ...r: unknown[]) => string)(value, ...rest);
    }) as typeof JSON.stringify);

    setBoundedRecord('k', entries, 512 * 1024);
    // One measuring pass is per-entry; the store itself is written once.
    expect(wholeStoreSerialisations).toBeLessThanOrEqual(1);
    expect(approxBytes(store.get('k')!)).toBeLessThanOrEqual(512 * 1024);
  });

  it('does not walk the whole store when everything already fits', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ i }));
    const started = Date.now();
    expect(setBoundedArray('r', items, 10 * 1024 * 1024)).toBe(50);
    expect(Date.now() - started).toBeLessThan(200);
  });
});
