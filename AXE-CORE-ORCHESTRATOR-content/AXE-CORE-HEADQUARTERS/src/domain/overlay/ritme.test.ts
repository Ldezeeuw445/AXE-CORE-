import { describe, expect, it } from 'vitest';
import { ritmeStrook } from './ritme';

describe('ritmeStrook', () => {
  it('schaalt naar de drukste dag en markeert vandaag', () => {
    const r = ritmeStrook([{ dag: 'a', aantal: 0 }, { dag: 'b', aantal: 4 }, { dag: 'c', aantal: 2 }]);
    expect(r.balken.map((b) => b.hoogte)).toEqual([0.08, 1, 0.5]);
    expect(r.balken[2].vandaag).toBe(true);
    expect(r.zin).toBe('2 done today · 6 this week');
  });
  it('leeg is leeg', () => {
    expect(ritmeStrook([])).toEqual({ balken: [], zin: '' });
  });
});
