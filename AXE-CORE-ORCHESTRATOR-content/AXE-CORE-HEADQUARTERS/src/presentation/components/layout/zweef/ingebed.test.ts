import { describe, it, expect } from 'vitest';
import { isIngebed, type Venster } from './ingebed';

describe('isIngebed', () => {
  it('is nee in het bovenste venster: self en top zijn hetzelfde object', () => {
    // Window.self/top are typed as `Window & typeof globalThis` (the real global
    // window), not plain `Window` -- a plain `as Window` cast is too weak for
    // Venster and TS correctly refuses it.
    const w = {} as Window & typeof globalThis;
    const venster: Venster = { self: w, top: w };
    expect(isIngebed(venster)).toBe(false);
  });

  it('is ja in een iframe: top is een ander venster', () => {
    const venster: Venster = { self: {} as Window & typeof globalThis, top: {} as Window & typeof globalThis };
    expect(isIngebed(venster)).toBe(true);
  });

  it('is ja als top niet te lezen is (andere origin)', () => {
    const venster = {
      self: {} as Window & typeof globalThis,
      get top(): Window & typeof globalThis { throw new DOMException('Blocked a frame', 'SecurityError'); },
    };
    expect(isIngebed(venster)).toBe(true);
  });

  it('is nee zonder venster (server, test zonder dom)', () => {
    expect(isIngebed(undefined)).toBe(false);
  });
});
