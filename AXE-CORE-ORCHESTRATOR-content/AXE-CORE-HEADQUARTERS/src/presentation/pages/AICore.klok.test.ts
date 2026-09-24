import { describe, it, expect } from 'vitest';
import { formatLocalClock } from './aicoreKlok';

describe('formatLocalClock', () => {
  it('schrijft lokale tijd met milliseconden', () => {
    const d = new Date(2026, 5, 15, 14, 30, 5, 123);
    expect(formatLocalClock(d)).toBe('14:30:05.123');
  });

  it('kan de milliseconden weglaten', () => {
    const d = new Date(2026, 5, 15, 9, 4, 7, 1);
    expect(formatLocalClock(d, false)).toBe('09:04:07');
  });
});
