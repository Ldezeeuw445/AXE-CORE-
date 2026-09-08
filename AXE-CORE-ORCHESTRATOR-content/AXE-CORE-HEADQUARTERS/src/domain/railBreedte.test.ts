import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Elke uitschuifbalk hoort even breed te zijn.
 *
 * Er waren er drie -- 300px links, 400px rechts, 378px voor de tab-rails --
 * en die 378 stond twee keer uitgeschreven, 2000 regels uit elkaar. Precies
 * dezelfde dubbele definitie die vandaag al drie keer een wijziging stil
 * ongedaan maakte.
 *
 * Deze test bewaakt niet de maat maar het aantal: één plek waar hij staat.
 */
const lees = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('uitschuifbalken hebben één breedte', () => {
  it('het token staat precies één keer gedefinieerd', () => {
    const css = lees('../design/axe-look.css');
    const keren = (css.match(/^\s*--axe-rail-breedte:/gm) || []).length;
    expect(keren, 'twee definities betekent dat de tweede de eerste stil overschrijft').toBe(1);
  });

  it('geen enkele balk zet zijn breedte nog zelf', () => {
    const bestanden = [
      '../presentation/components/layout/Sidebar.tsx',
      '../presentation/components/layout/RightPanel.tsx',
    ];
    for (const b of bestanden) {
      const t = lees(b);
      // een aside met een harde pixelbreedte, anders dan de ingeklapte 36px
      const hard = t.match(/<aside[^>]*width:\s*'?(\d+)(px)?'?/g) || [];
      const fout = hard.filter((h) => !/36/.test(h));
      expect(fout, `${b} zet zijn eigen breedte: ${fout.join(', ')}`).toHaveLength(0);
    }
  });

  it('de css-rails lezen het token in plaats van een getal', () => {
    const css = lees('../design/axe-look.css');
    expect(css).not.toMatch(/^\s*width:\s*378px;/m);
    expect((css.match(/width: var\(--axe-rail-breedte\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
