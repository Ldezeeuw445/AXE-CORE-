import { describe, expect, it } from 'vitest';
import { binnenBand, koersUitBalken } from './koers';

const balk = (c: number) => ({ t: 0, o: c, h: c, l: c, c, v: 0 });

describe('koersUitBalken', () => {
  it('neemt de LAATSTE balk als koers en meet tegen de eerste van het venster', () => {
    const k = koersUitBalken([balk(100), balk(110)], 'lse');
    expect(k?.last).toBe(110);
    expect(k?.pct).toBeCloseTo(10);
    expect(k?.bron).toBe('lse');
  });

  it('geeft null als er niets is, en geen pct bij één balk', () => {
    expect(koersUitBalken([], 'lse')).toBeNull();
    expect(koersUitBalken(null, 'lse')).toBeNull();
    expect(koersUitBalken([balk(70)], 'lse')?.pct).toBeNull();
  });
});

describe('binnenBand', () => {
  it('weigert de onmogelijke WTI-prijs van 16 september', () => {
    expect(binnenBand(4.12, [10, 400])).toBe(false);
    expect(binnenBand(63.2, [10, 400])).toBe(true);
    expect(binnenBand(Number.NaN, [10, 400])).toBe(false);
  });
});
