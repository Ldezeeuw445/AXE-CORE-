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
  /** De inhoud van elk @media-blok eruit, zodat alleen de basis overblijft. */
  const zonderMedia = (css: string): string => {
    let uit = '';
    let i = 0;
    while (i < css.length) {
      const m = css.indexOf('@media', i);
      if (m === -1) { uit += css.slice(i); break; }
      uit += css.slice(i, m);
      const open = css.indexOf('{', m);
      if (open === -1) break;
      let diepte = 0;
      let j = open;
      for (; j < css.length; j++) {
        if (css[j] === '{') diepte++;
        else if (css[j] === '}') { diepte--; if (diepte === 0) break; }
      }
      i = j + 1;
    }
    return uit;
  };

  /* Deze test telde ÉLKE definitie en eiste er één. Dat vangt de val waar hij
     voor gemaakt is -- dezelfde regel twee keer, duizenden regels uit elkaar,
     waarbij de tweede de eerste stil overschrijft -- maar hij kan dat niet
     onderscheiden van een bewuste responsive override. En die is er een: in
     het iPad-blok staat `clamp(260px, 30vw, 360px)`, mét uitleg erboven,
     omdat 380px daar niet naast de plaat past.
  
     Dus telt hij nu alleen de BASIS. Een tweede definitie op het hoogste
     niveau is nog steeds fout; een override binnen een media-query is precies
     waar media-queries voor zijn. */
  it('het token staat precies één keer buiten een media-query', () => {
    const css = lees('../design/axe-look.css');
    const basis = (zonderMedia(css).match(/^\s*--axe-rail-breedte:/gm) || []).length;
    expect(basis, 'twee definities in de basis betekent dat de tweede de eerste stil overschrijft').toBe(1);
  });

  it('elke override zit in een media-query met een echte voorwaarde', () => {
    const css = lees('../design/axe-look.css');
    // Elk @media-blok met zijn voorwaarde, zodat we kunnen kijken WAAR een
    // override staat in plaats van alleen DAT er een is.
    const blokken: Array<{ voorwaarde: string; inhoud: string }> = [];
    let i = 0;
    while (true) {
      const m = css.indexOf('@media', i);
      if (m === -1) break;
      const open = css.indexOf('{', m);
      if (open === -1) break;
      let diepte = 0;
      let j = open;
      for (; j < css.length; j++) {
        if (css[j] === '{') diepte++;
        else if (css[j] === '}') { diepte--; if (diepte === 0) break; }
      }
      blokken.push({ voorwaarde: css.slice(m + 6, open).trim(), inhoud: css.slice(open, j) });
      i = j + 1;
    }

    const overrides = blokken.filter((b) => /--axe-rail-breedte:/.test(b.inhoud));
    for (const o of overrides) {
      // Een voorwaarde die niets uitsluit is geen override maar een tweede basis.
      expect(o.voorwaarde.length, `lege media-voorwaarde rond --axe-rail-breedte`).toBeGreaterThan(5);
    }
    // De iPad is de enige die hem vandaag overschrijft; verandert dat, dan
    // hoort dat hier op te vallen in plaats van stil te gebeuren.
    expect(overrides.map((o) => o.voorwaarde).join(' | ')).toMatch(/pointer:\s*coarse/);
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
