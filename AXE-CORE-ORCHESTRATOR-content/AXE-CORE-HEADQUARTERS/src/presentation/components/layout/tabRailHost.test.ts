import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Een tab kan alleen iets in de rail zetten als er een knoop is om in te
 * portalen. Die knoop verdween op twee manieren tegelijk, en samen maakten ze
 * de rails van elke tab onzichtbaar:
 *
 * 1. De host stond alleen in de UITGEKLAPTE tak van de zijbalk. Ingeklapt is
 *    de normale stand -- hij schuift pas uit als je met de muis naar de rand
 *    gaat -- dus meestal bestond hij niet.
 * 2. TabRail stopte met kijken zodra hij hem één keer gevonden had. Bij het
 *    uitschuiven wordt het element vervangen, en het portaal bleef in de oude,
 *    losgekoppelde knoop tekenen.
 *
 * Beide zijn hier vastgelegd omdat het van buiten niet te zien is: er komt geen
 * fout, er gebeurt alleen niets.
 */

const SRC = new URL('../../../', import.meta.url).pathname;
const lees = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('de rail-host is altijd te vinden', () => {
  it('de linkerbalk zet zijn host in beide standen', () => {
    const tekst = lees('presentation/components/layout/Sidebar.tsx');
    const aantal = tekst.split('id="axe-rail-links"').length - 1;
    expect(aantal, 'host hoort zowel ingeklapt als uitgeklapt te bestaan').toBe(2);
  });

  it('de rechterbalk ook', () => {
    const tekst = lees('presentation/components/layout/RightPanel.tsx');
    const aantal = tekst.split('id="axe-rail-rechts"').length - 1;
    expect(aantal, 'host hoort zowel ingeklapt als uitgeklapt te bestaan').toBe(2);
  });

  it('TabRail blijft kijken nadat hij de host gevonden heeft', () => {
    const tekst = lees('presentation/components/layout/useTabRail.tsx');
    // Een vroege return op een gevonden host betekent: nooit meer kijken.
    expect(tekst).not.toMatch(/if\s*\(gastheer\)\s*return;/);
    // En een disconnect binnen de waarnemer doet hetzelfde.
    expect(tekst).not.toMatch(/setGastheer\(el\);\s*obs\.disconnect\(\)/);
  });
});
