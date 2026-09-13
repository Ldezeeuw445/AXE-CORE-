import { describe, it, expect } from 'vitest';
import { isIngebed, type Venster } from './ingebed';

describe('isIngebed', () => {
  it('is nee in het bovenste venster: self en top zijn hetzelfde object', () => {
    const w = {} as Window;
    const venster: Venster = { self: w, top: w };
    expect(isIngebed(venster)).toBe(false);
  });

  it('is ja in een iframe: top is een ander venster', () => {
    const venster: Venster = { self: {} as Window, top: {} as Window };
    expect(isIngebed(venster)).toBe(true);
  });

  it('is ja als top niet te lezen is (andere origin)', () => {
    const venster = {
      self: {} as Window,
      get top(): Window { throw new DOMException('Blocked a frame', 'SecurityError'); },
    };
    expect(isIngebed(venster)).toBe(true);
  });

  it('is nee zonder venster (server, test zonder dom)', () => {
    expect(isIngebed(undefined)).toBe(false);
  });
});
