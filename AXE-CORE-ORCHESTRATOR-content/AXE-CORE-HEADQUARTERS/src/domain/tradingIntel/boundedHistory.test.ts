import { describe, it, expect } from 'vitest';
import { capBySize } from './boundedHistory';

const entry = (i: number, pad = 100) => ({ i, blob: 'x'.repeat(pad) });

describe('capBySize', () => {
  it('keeps the newest entries and drops the rest', () => {
    const list = Array.from({ length: 50 }, (_, i) => entry(i));
    const { kept, dropped } = capBySize(list, 1000);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(50);
    expect(kept[0].i).toBe(0);                 // newest first, as callers store them
    expect(dropped).toBe(50 - kept.length);
  });

  it('stays inside the budget', () => {
    const list = Array.from({ length: 200 }, (_, i) => entry(i));
    const { kept } = capBySize(list, 2000);
    expect(new TextEncoder().encode(JSON.stringify(kept)).length).toBeLessThanOrEqual(2000);
  });

  it('keeps one oversized entry rather than returning nothing', () => {
    // A store that can go empty because one record got fat is a worse failure
    // than one briefly over budget.
    const { kept, dropped } = capBySize([entry(0, 50_000), entry(1)], 1000);
    expect(kept).toHaveLength(1);
    expect(kept[0].i).toBe(0);
    expect(dropped).toBe(1);
  });

  it('honours a count limit as well, when one is given', () => {
    const list = Array.from({ length: 100 }, (_, i) => entry(i, 1));
    expect(capBySize(list, 1_000_000, 10).kept).toHaveLength(10);
  });

  it('keeps everything when it all fits', () => {
    const list = [entry(0, 5), entry(1, 5)];
    const { kept, dropped } = capBySize(list, 100_000);
    expect(kept).toHaveLength(2);
    expect(dropped).toBe(0);
  });

  it('handles an empty list', () => {
    expect(capBySize([], 1000)).toMatchObject({ kept: [], dropped: 0 });
  });

  it('counts UTF-8 bytes, not characters', () => {
    // A broker message with accents costs more bytes than it has characters,
    // and the budget is in bytes.
    const ascii = capBySize([{ s: 'aaaaaaaaaa' }], 1_000_000).bytes;
    const accented = capBySize([{ s: 'éééééééééé' }], 1_000_000).bytes;
    expect(accented).toBeGreaterThan(ascii);
  });

  it('does not throw on a value that cannot be serialised', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => capBySize([cyclic], 1000)).not.toThrow();
  });
});
