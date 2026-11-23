import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOORVERWIJZINGEN, meerGroepen, meerNavItems } from './navRegistry';

describe('Meer in groepen (23 nov)', () => {
  it('toont geen tab die alleen doorverwijst', () => {
    const paden = meerNavItems().map((i) => i.path);
    for (const p of DOORVERWIJZINGEN) expect(paden).not.toContain(p);
  });

  it('elke doorverwijzing is in App.tsx echt een Navigate', () => {
    const app = readFileSync('src/app/App.tsx', 'utf8');
    for (const p of DOORVERWIJZINGEN) {
      expect(app, p).toMatch(new RegExp(`path="${p.slice(1)}" element=\\{<Navigate`));
    }
  });

  it('zet elke zichtbare tab precies één keer in een groep, met uitleg', () => {
    const groepen = meerGroepen();
    const alle = groepen.flatMap((g) => g.items.map((i) => i.path));
    expect(new Set(alle).size).toBe(alle.length);
    expect(alle.sort()).toEqual(meerNavItems().map((i) => i.path).sort());
    expect(groepen.find((g) => g.titel === 'Work')?.items.every((i) => i.uitleg)).toBe(true);
  });
});
