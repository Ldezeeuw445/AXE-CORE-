import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Twee klachten van Luka op 6 november, en waarom ze er nog waren.
 *
 * 1. **De notch hing nog steeds onder de menubalk**, ook op de build met
 *    0b5d25f8 (die van visibleFrame naar frame ging). Gemeten op de iMac:
 *    het venster op y=30, precies de hoogte van de menubalk. Oorzaak:
 *    `set_always_on_top` zet in tao het niveau ASYNCHROON op 3, dat landt ná
 *    de 25 die dock_notch_frame zet, en op niveau 3 klemt macOS setFrame
 *    onder de menubalk. Met een kaal NSWindow nagemeten: borderless op 25
 *    komt tot 1440 (de bovenrand), dezelfde setFrame op 3 tot 1410.
 *
 * 2. **AXE pakt de focus terwijl je op een ander scherm typt.** setFocus is
 *    in tao `activateIgnoringOtherApps`. Paden die AXE uit zichzelf neemt
 *    (de notch die opkomt bij minimaliseren, de klapdetector) mogen dat niet.
 *
 * Geen DOM in deze suite, dus hij leest de bron zoals notchVastgezet.test.ts.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const schoon = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const lees = (p: string) => schoon(readFileSync(resolve(hier, p), 'utf8'));

const rust = lees('../../../../src-tauri/src/lib.rs');
const floatAxe = lees('../../pages/FloatAxe.tsx');
const zweef = lees('../../../infrastructure/gateways/zwevendeVensters.ts');
const app = lees('../../../app/App.tsx');

function dockInner(): string {
  const start = rust.indexOf('fn dock_notch_frame_inner');
  const eind = rust.indexOf('#[cfg(not(target_os = "macos"))]', start);
  return rust.slice(start, eind);
}

describe('de notch blijft op niveau 25', () => {
  it('dock_notch_frame zet hem niet terug naar "altijd bovenop" (niveau 3)', () => {
    expect(dockInner()).toContain('setLevel: 25');
    expect(dockInner()).not.toContain('set_always_on_top');
  });

  it('FloatAxe zet na het dokken geen setAlwaysOnTop meer', () => {
    // Alles van de invoke tot het einde van dockTop, mínus het catch-blok dat
    // erbij hoort: dat is de terugval zonder native dok, en daar mag het wel.
    const dock = floatAxe.slice(floatAxe.indexOf('async function dockTop'));
    const vanaf = dock.indexOf("invoke('dock_notch_frame'");
    const catchStart = dock.indexOf('} catch {', vanaf);
    let diepte = 0;
    let catchEind = catchStart;
    for (let i = dock.indexOf('{', catchStart + 1); i < dock.length; i++) {
      if (dock[i] === '{') diepte++;
      if (dock[i] === '}' && --diepte === 0) { catchEind = i; break; }
    }
    const succesPad = dock.slice(vanaf, catchStart) + dock.slice(catchEind, dock.indexOf('\n}', catchEind));
    expect(succesPad).not.toContain('setAlwaysOnTop');
  });

  it('het notch-venster wordt niet als "altijd bovenop" aangemaakt', () => {
    expect(zweef).toMatch(/alwaysOnTop:\s*type !== 'axe'/);
  });
});

describe('AXE pakt de focus niet uit zichzelf', () => {
  it('de notch verschijnt zonder het toetsenbord over te nemen', () => {
    expect(zweef).toMatch(/focus:\s*type !== 'axe'/);
    expect(zweef).toMatch(/if \(type !== 'axe'\) await bestaand\.setFocus\(\)/);
  });

  it('de klapdetector toont het venster stil', () => {
    const klap = app.slice(app.indexOf('useClapDetector('));
    const blok = klap.slice(0, klap.indexOf('});'));
    expect(blok).toContain('showMainWindowQuietly');
    expect(blok).not.toMatch(/showMainWindow\(\)/);
  });

  it('het stille commando bestaat en is aangemeld', () => {
    expect(rust).toContain('fn toon_hoofdvenster_stil');
    expect(rust).toMatch(/generate_handler!\[[\s\S]*toon_hoofdvenster_stil/);
  });
});

describe('de notch klapt in tot een handvat (Luka, 6 nov)', () => {
  it('het handvat heeft eigen, kleine maten binnen de menubalk', async () => {
    const { HANDVAT_BREEDTE, HANDVAT_HOOGTE } = await import('@/domain/overlay/notchMaten');
    expect(HANDVAT_HOOGTE).toBeLessThanOrEqual(24);
    expect(HANDVAT_BREEDTE).toBeGreaterThanOrEqual(120);
  });

  it('dockTop gebruikt die maten als hij ingeklapt is', () => {
    const dock = floatAxe.slice(floatAxe.indexOf('async function dockTop'));
    expect(dock).toMatch(/handvat \? HANDVAT_HOOGTE/);
    expect(dock).toMatch(/handvat \? HANDVAT_BREEDTE/);
  });

  it('de strook heeft een inklapknop en FloatAxe toont dan alleen het handvat', () => {
    const notch = lees('AxeOverlayNotch.tsx');
    expect(notch).toContain('onInklappen');
    expect(floatAxe).toContain('onInklappen={() => kiesHandvat(true)}');
    expect(floatAxe).toContain('axe-ov__handvat');
  });
});
