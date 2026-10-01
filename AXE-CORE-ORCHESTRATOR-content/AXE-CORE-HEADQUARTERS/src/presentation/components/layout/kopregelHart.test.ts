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
const nav = lees('./TopNav.tsx');

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

  /* ── 1 okt 2026: het gat is weg, en dat is de hele correctie ───────────
   *
   * Hier stond: "reserveert het gat tot waar de pil echt eindigt", met een
   * blokje `.axe-topbar-midden` zo breed als de pil. Dat kon niet werken. De
   * kopbalk staat op `justify-between`, dus de rechtergroep ligt al tegen de
   * rechterrand; een blokje ervóór duwt haar niet verder op, het maakt de rij
   * alleen breder dan het venster. De overlap die het moest voorkomen werd
   * daarmee een overloop: gemeten op /settings liep de groep op 1512px tot
   * 1588 (76px voorbij de rand, óók in Tauri) en op een iPad in landschap tot
   * 1440 van 1180 -- 260px buiten beeld.
   *
   * Daarom toetst dit nu het omgekeerde: géén gat, maar afslanken tot het past,
   * en dat op gemeten POSITIE. */
  it('reserveert geen gat meer -- dat blokje maakte de rij breder dan het venster', () => {
    /* Op CODE, niet op het woord: de uitleg waaróm dit weg is mag blijven
       staan, en moet ook -- anders bouwt de volgende sessie het terug. */
    expect(chrome).not.toContain("querySelector('.axe-topbar-midden')");
    expect(chrome).not.toContain("setProperty('--axe-viewctl-b'");
    expect(nav).not.toContain('axe-topbar-midden');
    expect(css).not.toMatch(/\.axe-topbar-midden\s*\{/);
  });

  it('slankt de kopbalk af tot de groep naast de pil past, in stappen', () => {
    // De stand staat op de wortel, zodat de CSS kan kiezen wat wijkt.
    expect(chrome).toContain('dataset.kopKrap');
    // Vijf standen: 0 past alles, 4 is de pil zonder woorden.
    expect(chrome).toMatch(/stap\s*<=\s*4/);
    // En de CSS laat ze vallen in die orde: klok, label, profiel, pil-labels.
    expect(css).toMatch(/\[data-kop-krap='1'\][^{]*\.axe-tr-klok/);
    expect(css).toMatch(/\[data-kop-krap='2'\][^{]*\.axe-tl\b/);
    expect(css).toMatch(/\[data-kop-krap='3'\][^{]*\.axe-tr-profiel/);
    expect(css).toMatch(/\[data-kop-krap='4'\][^{]*\.axe-viewknop span/);
  });

  it('laat de klok bij elke krappere stand ook weg', () => {
    /* Anders komt hij op stap 4 terug: de regel noemde eerst alleen 1 t/m 3,
       en een scherm dat tot stap 4 gaat is per definitie krapper dan een dat
       bij 1 stopt. */
    for (const stand of ['1', '2', '3', '4']) {
      expect(css, `klok hoort weg op stand ${stand}`)
        .toMatch(new RegExp(`\\[data-kop-krap='${stand}'\\] \\.axe-tr-klok`));
    }
  });

  it('toetst op positie, niet op opgetelde breedtes', () => {
    /* Breedtes optellen vraagt om elke marge meerekenen, en één vergeten marge
       is precies hoe de vorige poging misging. Twee voorwaarden: binnen het
       venster, en beginnen waar de pil ophoudt. */
    expect(chrome).toMatch(/window\.innerWidth/);
    expect(chrome).toContain('pilKnopRechts');
  });
});
