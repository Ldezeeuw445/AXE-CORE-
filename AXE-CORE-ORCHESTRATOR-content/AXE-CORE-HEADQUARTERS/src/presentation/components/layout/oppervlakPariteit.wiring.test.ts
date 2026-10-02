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

/* ── Het chatvak zegt wat het weet (2 okt 2026) ─────────────────────────────
   Gemeten op Luka's telefoon-Home: een leeg zwart vlak. Het vak werkte -- er
   was niets te tonen. Maar vier verschillende dingen zagen er identiek uit:
   nog niets gezegd, nog aan het ophalen, niet kunnen ophalen, en -- het ergste
   -- niet aan het bewaren. Dat laatste wist de app precies (`chatSaveHealth`),
   maar de enige plek die het toonde was /status, en die staat niet in de
   telefoonnavigatie. Op de telefoon is dit vak het enige venster op het
   gesprek, dus daar is zwijgen het duurst. */
describe('een leeg chatvak legt zich uit, op elk oppervlak', () => {
  /* BUREAU is hier PlaatChat EN AxePresenceDock, en dat is geen slordigheid:
     op desktopbreedte is `kopAlleen` in PlaatChat vrijwel altijd waar (zijn
     eigen uitleg zegt dat), dus staat het gesprek in de wolk van de dock. Een
     melding die alleen in de plaat staat zou dus bijna nooit te zien zijn --
     precies de fout van de Skills-pil in de FAB, één dag eerder. */
  it('staat op elk oppervlak waar het gesprek woont', () => {
    for (const bestand of ['presentation/components/layout/MobileChat.tsx', ...BUREAU]) {
      expect(bron(bestand), bestand).toContain('<GesprekStand');
    }
  });

  /* Wanneer welke melding komt is een regel, geen opmaak: die staat in domain
     en is daar per geval getest. Zet een oppervlak zijn eigen `if` erom, dan
     lopen ze weer uit elkaar -- precies hoe dit gat ontstond. */
  it('leest de stand uit de regel in domain, niet uit eigen ifs', () => {
    const blok = bron('presentation/components/shared/GesprekStand.tsx');
    expect(blok).toContain("from '@/domain/chat/gesprekStand'");
    expect(blok).toContain('chatSaveHealth');
    expect(blok).toContain('chatLoadHealth');
  });

  /* De laadfout moest ophouden stil te zijn: `loadMessages` gaf bij elke fout
     `[]` terug, en `[]` is hier niet "geen berichten" maar "ik weet het niet". */
  it('houdt een mislukte lading apart van een leeg gesprek', () => {
    const bestand = readFileSync(join(ROOT, 'infrastructure/persistence/chatPersistence.ts'), 'utf8');
    expect(bestand).toContain('export function chatLoadHealth');
    expect(bestand).toContain('noteLoadFailed');
  });
});

/* ── De vijf skills, en spraak aan/uit (2 okt 2026) ─────────────────────────
   Gemeten vóór deze ronde: de telefoon kon bij geen van beide. De skills stonden
   in het commandopalet (⌘K of de zoekknop in de kopbalk -- de telefoon heeft geen
   van beide) en in een pil in MobileFab, en die FAB hangt aan `!opPlaatMobiel`,
   wat op de telefoon waar is op élke route behalve /lock. De pil was dus
   onbereikbaar: een ingang op een oppervlak dat er niet is.

   Beide staan nu in `MobileComposer`, die op élke mobiele tab staat. */
describe('de telefoon komt bij wat het bureau kan', () => {
  const composer = () => bron('presentation/components/layout/MobileComposer.tsx');

  it('heeft een ingang naar de vijf skills', () => {
    expect(composer()).toContain('setCommandPaletteOpen');
    expect(composer()).toMatch(/aria-label="Skills"/);
  });

  it('kan AXE\'s stem uitzetten', () => {
    // Zelfde store-actie als het bureau, niet een eigen stand ernaast.
    expect(composer()).toContain('setResponseMode');
    expect(composer()).toMatch(/responseMode === 'speak'/);
  });

  /* Eén ingang per handeling. De FAB had er een tweede, en die was onzichtbaar --
     dan lijkt het geregeld terwijl het dat niet is. */
  it('heeft die ingang maar op één plek', () => {
    expect(bron('presentation/components/layout/MobileFab.tsx'))
      .not.toContain('setCommandPaletteOpen');
  });
});
