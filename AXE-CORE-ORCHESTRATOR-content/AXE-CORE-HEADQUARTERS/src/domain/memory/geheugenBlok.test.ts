import { describe, it, expect } from 'vitest';
import { bouwGeheugenBlok } from './geheugenBlok';

describe('bouwGeheugenBlok', () => {
  it('relevant eerst, dubbel eruit', () => {
    const b = bouwGeheugenBlok(['Jan is zijn zakenpartner'], ['jan is zijn zakenpartner', 'Hij wil de trading desk opschonen'], ['Woont in Amsterdam']);
    expect(b.split('\n').slice(1)).toEqual([
      '- Jan is zijn zakenpartner', '- Hij wil de trading desk opschonen', '- Woont in Amsterdam',
    ]);
  });
  it('leeg geheugen = geen blok', () => {
    expect(bouwGeheugenBlok([], [], [])).toBe('');
  });
  it('blijft onder de grens', () => {
    const veel = Array.from({ length: 100 }, (_, i) => `herinnering nummer ${i} met wat tekst erbij`);
    expect(bouwGeheugenBlok(veel, [], [], 500).length).toBeLessThan(620);
  });
});
