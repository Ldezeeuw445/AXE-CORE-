import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZWEVENDE_VENSTERS } from './zwevendeVensters';

/**
 * Het venster moet passen om wat erin staat.
 *
 * Op 5 november stond het Tauri-venster van de notch op 44px hoog terwijl de
 * CSS 80px nodig heeft (`--axe-notch-h`). De icoontjes werden daardoor tegen
 * de onderrand geknipt. Op een screenshot ziet dat eruit als een smaakkwestie
 * — "hij staat wat laag" — en daardoor blijft het staan.
 *
 * Twee getallen in twee bestanden die gelijk moeten lopen en dat niet
 * afdwingen, lopen uit elkaar. Deze test leest ze allebei en vergelijkt ze,
 * zodat niemand het hoeft te onthouden.
 */

const CSS = resolve(__dirname, '../../presentation/components/overlay/AxeOverlayNotch.css');

function cssNotchHoogte(): number {
  const css = readFileSync(CSS, 'utf8');
  const m = css.match(/--axe-notch-h:\s*(\d+)px/);
  if (!m) throw new Error('--axe-notch-h staat niet meer in AxeOverlayNotch.css');
  return Number(m[1]);
}

describe('de notch past in zijn eigen venster', () => {
  it('het venster is minstens zo hoog als de CSS nodig heeft', () => {
    const nodig = cssNotchHoogte();
    const venster = ZWEVENDE_VENSTERS.axe;
    expect(venster.h).toBeGreaterThanOrEqual(nodig);
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
  });
});
