/**
 * De view-balk ligt op het HART van de kopregel, en blijft daar.
 *
 * ## Waarom deze test bestaat
 *
 * Dit is vier keer misgegaan met dezelfde oorzaak: de kopregel en de view-balk
 * rekenden met verschillende getallen. De balk was 66px hoog en zette elk kind
 * op 34px (hartlijn 33); de view-balk stond hard op `top: 16px` en is ~45px
 * hoog (hartlijn 38). Vijf pixels verschil, met 16px lucht boven de pil en 5px
 * eronder -- dus hing hij aan de onderrand en stak hij de inhoud in. Luka zag
 * dat als "de pil valt onder de top bar", en dat was precies wat het was.
 *
 * Er stonden drie getallen voor een balk waar alles op een lijn hoort: 48px
 * inline in TopNav.tsx (dood, want overschreven met !important), 66px in
 * axe-look.css, en die losse 16px die van geen van beide wist.
 *
 * Een geraden `top` ziet er in de broncode altijd goed uit -- daarom grijpt
 * deze test naar de bron in plaats van naar de weergave: zodra iemand er weer
 * een vast getal van maakt, of het hoogte-token weghaalt, wordt dit rood.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lees = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const css = lees('../../../design/axe-look.css');
const chrome = lees('./AxeShellChrome.tsx');

/** Het blok dat de view-balk POSITIONEERT (niet het blok dat hem verft). */
function positieBlok(): string {
  const start = css.indexOf(':root[data-look] .axe-viewctl {\n  position: fixed;');
  expect(start, 'het positieblok van .axe-viewctl staat er niet meer').toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('de view-balk ligt op het hart van de kopregel', () => {
  it('rekent zijn top uit in plaats van hem te raden', () => {
    const blok = positieBlok();
    expect(blok).toContain('var(--axe-kop-h');
    expect(blok).toContain('var(--axe-viewctl-h');
  });

  it('heeft geen vaste top meer die van de balkhoogte niets weet', () => {
    expect(positieBlok()).not.toMatch(/\n\s*top:\s*\d+px\s*;/);
  });

  it('kent de kophoogte maar op een plek', () => {
    const definities = css.match(/--axe-kop-h\s*:/g) ?? [];
    expect(definities).toHaveLength(1);
  });

  it('laat de kopbalk diezelfde kophoogte gebruiken', () => {
    const start = css.indexOf(':root[data-look] .axe-topbar {');
    const blok = css.slice(start, css.indexOf('}', start));
    expect(blok).toContain('var(--axe-kop-h)');
    expect(blok, 'de balkhoogte mag geen los getal meer zijn').not.toMatch(/height:\s*calc\(\s*\d+px/);
  });

  it('meet de hoogte van de balk in plaats van hem aan te nemen', () => {
    expect(chrome).toContain("--axe-viewctl-h");
    expect(chrome).toMatch(/getBoundingClientRect\(\)/);
  });

  it('reserveert het gat tot waar de pil echt eindigt', () => {
    // De oude formule was `breedte + 24` en landde 68px naast de pil, omdat de
    // pil op het SCHERM centreert en het blokje op wat flexbox overhoudt.
    expect(chrome).toContain('axe-topbar-midden');
    expect(chrome).toMatch(/pil\.right/);
  });
});
