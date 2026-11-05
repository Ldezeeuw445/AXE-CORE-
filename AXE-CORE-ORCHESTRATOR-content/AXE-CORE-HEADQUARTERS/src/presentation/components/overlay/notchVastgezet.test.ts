import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTCH_MIN_BREEDTE, notchMaten } from '@/domain/overlay/notchMaten';

/**
 * De notch zit vast midden boven, en komt alleen als je hem vraagt.
 *
 * Vier dingen die op 5 november alle vier anders waren dan Luka wil, en die
 * geen van alle door een test werden vastgehouden:
 *
 *  1. De balk was een venstergreep (`data-tauri-drag-region`), dus één
 *     onbedoelde sleep zette hem uit het midden en niets zette hem terug.
 *  2. `AppShell` opende hem bij elke start, dus hij kwam altijd op — ook
 *     bovenop een app die je net geopend had.
 *  3. Hij dokte onder de menubalk aan (`visibleFrame`), waardoor hij zweefde
 *     terwijl zijn vorm zegt dat hij tegen de schermrand zit.
 *  4. Hij was smal.
 *
 * Deze suite draait zonder DOM, dus hij leest de bron — zoals
 * `vensterSchaduw.test.ts` dat ook doet.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const schoon = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const notch = schoon(readFileSync(join(hier, 'AxeOverlayNotch.tsx'), 'utf8'));
const floatAxe = schoon(readFileSync(resolve(hier, '../../pages/FloatAxe.tsx'), 'utf8'));
const appShell = schoon(readFileSync(resolve(hier, '../layout/AppShell.tsx'), 'utf8'));
const rust = schoon(readFileSync(resolve(hier, '../../../../src-tauri/src/lib.rs'), 'utf8'));

describe('de notch is niet te verslepen', () => {
  it('de balk is geen venstergreep', () => {
    expect(notch).not.toContain('data-tauri-drag-region');
  });

  it('en het venster is ook niet van maat te veranderen', () => {
    const zweef = readFileSync(
      resolve(hier, '../../../infrastructure/gateways/zwevendeVensters.ts'),
      'utf8',
    );
    expect(zweef).toContain("resizable: type !== 'axe'");
  });

  it('dokt opnieuw aan als hij weer in beeld komt, met de stand van dat moment', () => {
    // Eén keer aandokken bij het laden is niet genoeg: een scherm erbij of
    // eraf verandert waar "midden boven" is zonder dat de pagina herlaadt.
    expect(floatAxe).toMatch(/addEventListener\('focus'/);
    expect(floatAxe).toContain('dockTop(openRef.current)');
  });
});

describe('de notch komt alleen als je hem vraagt', () => {
  it('de schil opent hem niet bij het laden', () => {
    // Niet op de letterlijke tekst met enkele quotes: dat liet een
    // teruggezette `openZwevend("axe")` er stil doorheen, gemeten tijdens de
    // mutatietoets van deze test zelf.
    expect(appShell).not.toMatch(/openZwevend\(\s*['"`]axe['"`]\s*\)/);
  });

  it('maar wel als AXE Core geminimaliseerd wordt', () => {
    expect(appShell).toContain('useNotchBijMinimaliseren()');
  });

  it('de haak sluit alleen wat hij zelf opende', () => {
    // Anders overrult hij de knop in het radiale dok: open je de notch zelf
    // en haal je daarna het hoofdvenster terug, dan ging hij weer dicht.
    const haak = readFileSync(
      resolve(hier, '../../hooks/useNotchBijMinimaliseren.ts'),
      'utf8',
    );
    expect(haak).toContain('doorOnsGeopend');
    expect(haak).toMatch(/if \(eerste\) return;/);
  });
});

describe('de notch zit tegen de bovenrand, niet eronder', () => {
  it('de pagina vraagt om de bovenrand van het scherm zelf', () => {
    expect(floatAxe).toMatch(/const ny = screenY;/);
  });

  it('en de native kant gebruikt de hele frame, niet de visibleFrame', () => {
    // visibleFrame begint ONDER de menubalk. Op NSStatusWindowLevel (25) mag
    // een venster daar juist bovenop staan, en dat is het hele punt.
    expect(rust).toContain('setLevel: 25_i64');
    const inDock = rust.slice(rust.indexOf('fn dock_notch_frame_inner'));
    expect(inDock).not.toContain('visibleFrame');
    expect(inDock).toMatch(/let top_y = sf\.origin\.y \+ sf\.size\.height;/);
  });
});

describe('de notch is breder dan hij was', () => {
  it('de ondergrens is ruimer dan de oude 720', () => {
    expect(NOTCH_MIN_BREEDTE).toBeGreaterThan(720);
  });

  it('op een 1440-scherm is hij breder dan de helft van de oude maat', () => {
    // Oud: max(720, 1440 * 0.34) = 720. Dat was de ondergrens, dus op dit
    // scherm veranderde de fractie niets en bleef hij smal.
    expect(notchMaten(1440, 900).b).toBeGreaterThan(720);
  });

  it('en op een breed scherm groeit hij mee', () => {
    expect(notchMaten(3840, 2160).b).toBeGreaterThan(notchMaten(1440, 900).b);
  });
});
