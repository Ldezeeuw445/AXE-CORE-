import { describe, it, expect } from 'vitest';
import { isSwipeOmhoog } from './gebaar';

describe('swipe omhoog', () => {
  it('telt als de vinger ver genoeg omhoog gaat en meer verticaal dan horizontaal', () => {
    expect(isSwipeOmhoog({ x: 10, y: 200 }, { x: 12, y: 140 })).toBe(true);
  });
  it('telt niet bij een tik of een zijwaartse veeg', () => {
    expect(isSwipeOmhoog({ x: 10, y: 200 }, { x: 12, y: 190 })).toBe(false);
    expect(isSwipeOmhoog({ x: 10, y: 200 }, { x: 80, y: 160 })).toBe(false);
  });
});
