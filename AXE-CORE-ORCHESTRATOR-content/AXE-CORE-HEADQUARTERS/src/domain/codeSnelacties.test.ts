import { describe, it, expect } from 'vitest';
import { codeSnelacties } from './codeSnelacties';
import { SNELACTIES } from './snelacties';

describe('snelacties op de Code Editor', () => {
  it('gaan over de repo als er niets open is', () => {
    const a = codeSnelacties({ repo: 'axe-companion', bestand: null, patchOpen: false });
    expect(a[0].label).toBe('Verken axe-companion');
    expect(a.every(x => x.prompt.includes('axe-companion'))).toBe(true);
  });
  it('gaan over het open bestand', () => {
    const a = codeSnelacties({ repo: 'axe-core', bestand: 'src/App.tsx', patchOpen: false });
    expect(a[0].label).toBe('Leg App.tsx uit');
    expect(a.every(x => x.prompt.includes('src/App.tsx'))).toBe(true);
  });
  it('gaan over de patch zodra die openstaat', () => {
    expect(codeSnelacties({ repo: 'axe-core', bestand: 'a.ts', patchOpen: true })[0].id).toBe('patch-uitleg');
  });
  it('houden de vier accenten van Home, in dezelfde volgorde', () => {
    const a = codeSnelacties({ repo: 'x', bestand: null, patchOpen: false });
    expect(a.map(x => x.accent)).toEqual(SNELACTIES.map(x => x.accent));
  });
});
