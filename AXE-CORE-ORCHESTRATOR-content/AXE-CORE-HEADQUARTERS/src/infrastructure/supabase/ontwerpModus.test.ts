import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * De belofte was: nepdata komt nooit in de echte app. Die belofte is drie keer
 * gebroken voordat hij klopte, en elke keer zag de code er goed uit:
 *
 *   1. Vertrouwen op tree-shaking. De aanroeper werd gesnoeid, de data niet --
 *      die wordt op modulniveau met een functieaanroep opgebouwd en dat durft
 *      Rollup niet weg te gooien.
 *   2. process.env.NODE_ENV in vite.config. Dat is daar nog niet gezet.
 *   3. De alias stond ONDER '@', en die matcht als voorvoegsel op alles -- dus
 *      was het pad al herschreven voordat de omleiding aan de beurt kwam.
 *
 * Deze test bewaakt de twee dingen waar het op staat of valt. Hij vervangt de
 * echte controle niet -- die is:
 *
 *     npm run build && grep -rl "Voorbeeld agent" dist/public/
 *
 * en die hoort nul te geven.
 */
const WORTEL = new URL('../../../', import.meta.url).pathname;

describe('de ontwerpmodus kan de echte app niet bereiken', () => {
  it('de omleiding staat vóór de @-alias, anders komt hij nooit aan de beurt', () => {
    const cfg = readFileSync(join(WORTEL, 'vite.config.ts'), 'utf8');
    const omleiding = cfg.indexOf('ontwerpData.leeg.ts');
    const at = cfg.indexOf("'@': path.resolve");
    expect(omleiding, 'de omleiding naar ontwerpData.leeg ontbreekt').toBeGreaterThan(-1);
    expect(at, "de '@'-alias ontbreekt").toBeGreaterThan(-1);
    expect(omleiding, "de omleiding staat ONDER '@' en wordt daardoor nooit toegepast").toBeLessThan(at);
  });

  it('de omleiding hangt aan command, niet aan NODE_ENV', () => {
    const cfg = readFileSync(join(WORTEL, 'vite.config.ts'), 'utf8');
    // process.env.NODE_ENV is bij het laden van de config nog niet gezet.
    expect(cfg).toMatch(/command === 'build'/);
  });

  it('de lege vervanger levert niets op', async () => {
    const leeg = await import('./ontwerpData.leeg');
    expect(leeg.rijenVoor()).toEqual([]);
    expect(() => leeg.ontwerpClient()).toThrow();
  });

  it('de aanroeper zit achter import.meta.env.DEV', () => {
    const bron = readFileSync(join(WORTEL, 'src/infrastructure/supabase/supabaseClient.ts'), 'utf8');
    expect(bron).toMatch(/import\.meta\.env\.DEV && ontwerpModus\(\)/);
  });
});
