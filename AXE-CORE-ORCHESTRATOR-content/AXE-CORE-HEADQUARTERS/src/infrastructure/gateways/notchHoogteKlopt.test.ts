import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZWEVENDE_VENSTERS } from './zwevendeVensters';
import { NOTCH_HOOGTE, NOTCH_MIN_BREEDTE, notchMaten } from '@/domain/overlay/notchMaten';

/**
 * Het venster moet passen om wat erin staat — op élke plek waar de hoogte staat.
 *
 * Op 5 november stond het Tauri-venster van de notch op 44px terwijl de CSS er
 * 80 nodig heeft (`--axe-notch-h`). De icoontjes werden tegen de onderrand
 * geknipt. Op een screenshot ziet dat eruit als een smaakkwestie — "hij staat
 * wat laag" — en daardoor blijft het staan.
 *
 * De eerste versie van deze test las de CSS en de vensteropties, zette die op
 * 80, en werd groen. In de app bleef de notch 44, want er was een DERDE plek:
 * `FloatAxe.tsx` overschrijft bij elke start zowel de CSS-variabele als de
 * vensterhoogte, en die stond nog op 44. Een test die twee van de drie plekken
 * dekt, bewijst niets: de plek die hij niet ziet heeft het laatste woord.
 *
 * Daarom leest deze versie alle plekken en vergelijkt ze met het ene getal in
 * `domain/overlay/notchMaten`, en controleert hij bovendien dat niemand er een
 * vierde bij zet.
 */

const HIER = resolve(__dirname);
const CSS = resolve(HIER, '../../presentation/components/overlay/AxeOverlayNotch.css');
const FLOAT = resolve(HIER, '../../presentation/pages/FloatAxe.tsx');

/**
 * Zonder commentaar.
 *
 * Een test die de hele bron scant, struikelt over de uitleg waarom iets weg
 * is: "`uiScale` is om dezelfde reden weg" bevat het woord `uiScale`. Dan
 * faalt de test op zijn eigen documentatie en haal je de uitleg weg om hem
 * groen te krijgen — precies de verkeerde kant op.
 */
function zonderCommentaar(bron: string): string {
  return bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function cssNotchHoogte(): number {
  const css = readFileSync(CSS, 'utf8');
  const m = css.match(/--axe-notch-h:\s*(\d+)px/);
  if (!m) throw new Error('--axe-notch-h staat niet meer in AxeOverlayNotch.css');
  return Number(m[1]);
}

describe('de notch past in zijn eigen venster', () => {
  it('de CSS gaat uit van dezelfde hoogte als de code', () => {
    expect(cssNotchHoogte()).toBe(NOTCH_HOOGTE);
  });

  it('het venster is minstens zo hoog als de CSS nodig heeft', () => {
    expect(ZWEVENDE_VENSTERS.axe.h).toBeGreaterThanOrEqual(cssNotchHoogte());
  });

  it('en kan ook niet kleiner gesleept worden dan dat', () => {
    // Zonder deze regel kun je hem alsnog tot 40px samenknijpen en is de
    // reparatie weg zodra iemand de rand verschuift.
    expect(ZWEVENDE_VENSTERS.axe.minH).toBeGreaterThanOrEqual(cssNotchHoogte());
  });

  it('de breedte-ondergrens laat de knoppen links en rechts staan', () => {
    // De notch heeft drie knoppen links en twee rechts met de orb ertussen.
    // Onder ongeveer 600px lopen die op elkaar.
    expect(ZWEVENDE_VENSTERS.axe.minB).toBeGreaterThanOrEqual(600);
    expect(ZWEVENDE_VENSTERS.axe.minB).toBe(NOTCH_MIN_BREEDTE);
  });
});

describe('FloatAxe heeft niet zijn eigen hoogte', () => {
  const bron = zonderCommentaar(readFileSync(FLOAT, 'utf8'));

  it('haalt de maten uit notchMaten in plaats van ze zelf te verzinnen', () => {
    expect(bron).toContain("from '@/domain/overlay/notchMaten'");
  });

  it('schrijft --axe-notch-h op precies één plek, uit de berekende maten', () => {
    // Dit is de val: deze pagina is de laatste die aan het woord is, dus wat
    // zij in die variabele zet, is wat je ziet. Niet "geen getal" — dat is te
    // soepel, want de oude regel schreef `${m.collapsedH}px` en had ook geen
    // getal in de bron staan. Hij moet uit notchMaten komen, en nergens anders.
    const regels = bron.split('\n').filter((r) => r.includes('--axe-notch-h'));
    expect(regels.length, `--axe-notch-h staat op ${regels.length} plekken in FloatAxe`).toBe(1);
    expect(regels[0]).toContain('m.inklapH');
  });

  it('krimpt de notch niet onder zijn eigen ontwerp met een afgeleide schaal', () => {
    // `uiScale = collapsedH / 54` rekende bij 44px alles terug naar 0,81 en
    // maakte de knoppen kleiner dan waarvoor ze getekend zijn.
    expect(bron).not.toContain('uiScale');
    expect(bron).not.toContain('BASE_H');
  });

  it('volgt het scherm waar Luka zit, niet dat wat primair heet', () => {
    // currentMonitor eerst, primaryMonitor als terugval. Andersom stond de
    // notch op de ene monitor terwijl hij op de andere werkte.
    expect(bron).toMatch(/currentMonitor\(\)\s*\)?\s*\|\|\s*\(?await primaryMonitor\(\)/);
  });
});

describe('notchMaten rekent de strook uit', () => {
  it('de ingeklapte hoogte is op elk scherm hetzelfde', () => {
    for (const [b, h] of [[1440, 900], [1920, 1080], [3840, 2160], [800, 600]]) {
      expect(notchMaten(b, h).inklapH).toBe(NOTCH_HOOGTE);
    }
  });

  it('op een breed scherm wordt de notch breder, op een smal scherm niet smaller dan de ondergrens', () => {
    expect(notchMaten(3840, 2160).b).toBeGreaterThan(notchMaten(1440, 900).b);
    expect(notchMaten(800, 600).b).toBe(NOTCH_MIN_BREEDTE);
  });

  it('uitgeklapt valt het paneel naar beneden uit, nooit minder dan 720', () => {
    expect(notchMaten(1440, 900).uitklapH).toBeGreaterThanOrEqual(720);
    expect(notchMaten(3840, 2160).uitklapH).toBeGreaterThan(notchMaten(1440, 900).uitklapH);
  });
});
