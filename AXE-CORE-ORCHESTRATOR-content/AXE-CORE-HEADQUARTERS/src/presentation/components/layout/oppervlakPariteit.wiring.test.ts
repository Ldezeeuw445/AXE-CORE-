/**
 * Eén app, geen drie: wat op het ene oppervlak kan, kan op het andere ook.
 *
 * ## Waarom deze test bestaat
 *
 * Gemeten 2 okt 2026, door elk gedeeld gedrag langs de drie oppervlakken te
 * lopen (telefoon-PWA, iPad-PWA, Tauri): de telefoon kon elf dingen niet die de
 * andere twee wel konden, en dat kwam niet door het platform. Het kwam doordat
 * het gedrag in een desktopcomponent zat die achter `!mobileCommandSurface`
 * staat.
 *
 * Het ergste geval: `resolvePendingExec` -- AXE's "mag ik dit doen?" -- werd
 * alleen aangeroepen in `PlaatChat.tsx` en `AxePresenceDock.tsx`. Op de iPhone
 * kon AXE dus om toestemming vragen zonder dat er ergens een knop stond om die
 * te geven. Het werk stond stil en je kon er niets aan doen.
 *
 * Een unittest ziet dat niet: beide componenten zijn afzonderlijk correct. Wat
 * je moet toetsen is of élk oppervlak de handeling heeft. Daarom leest deze test
 * de bron, net als `installTierRouter.wiring.test.ts` en `MobileSystem.wiring.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '../../..');
const bron = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** De componenten die samen "het bureau" zijn, en die samen "de telefoon". */
const BUREAU = [
  'presentation/components/layout/PlaatChat.tsx',
  'presentation/components/layout/AxePresenceDock.tsx',
];
const TELEFOON = [
  'presentation/components/layout/MobileChat.tsx',
  'presentation/components/layout/AppShell.tsx',
];

describe('goedkeuren kan op elk oppervlak', () => {
  it('gebruikt overal hetzelfde blok in plaats van een eigen copy', () => {
    for (const bestand of [...BUREAU, ...TELEFOON]) {
      expect(bron(bestand), bestand).toContain('GoedkeuringBlok');
    }
  });

  /* Het punt van één component: niemand mag zijn eigen knoppen bouwen. Zodra
     een bestand `resolvePendingExec` zelf aanroept, is er een tweede opmaak en
     kunnen ze uit elkaar lopen -- precies hoe de telefoon achterop raakte. */
  it('roept resolvePendingExec nergens anders meer rechtstreeks aan', () => {
    for (const bestand of [...BUREAU, ...TELEFOON]) {
      expect(bron(bestand), `${bestand} hoort GoedkeuringBlok te gebruiken`)
        .not.toContain('resolvePendingExec(');
    }
  });

  it('het blok zelf doet het werk', () => {
    const blok = bron('presentation/components/shared/GoedkeuringBlok.tsx');
    expect(blok).toContain('resolvePendingExec');
    // Beide antwoorden, niet alleen ja.
    expect(blok).toMatch(/resolvePendingExec\(pending\.id, true\)/);
    expect(blok).toMatch(/resolvePendingExec\(pending\.id, false\)/);
  });

  /* Op de telefoon-tabs staat hij buiten de inklap-tak van de composer: schuif
     je die weg, dan moet de vraag blijven staan. */
  it('blijft op de telefoon staan als de composer weggeschoven is', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    const blok = shell.indexOf('<GoedkeuringBlok />');
    const inklap = shell.indexOf('{mobieleComposerWeg ? (');
    expect(blok).toBeGreaterThan(0);
    expect(inklap).toBeGreaterThan(blok);
  });
});
