import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTCH_TOESTANDEN } from '@/domain/overlay/notchLeven';
import { OPENABLE_PAGES } from '@/infrastructure/gateways/windowManagerService';
import { eersteUrl, paginaVoorProjectie } from './notchResultaatDoel';

/**
 * "Open groot" moet ook echt iets openen.
 *
 * De pagina-namen die `openPageOnMonitor` aanneemt staan in een allowlist, en
 * een naam die daar niet in staat gooit een fout in plaats van een venster te
 * openen. Dat is goed gedrag van die functie, maar het betekent dat een
 * typefout hier pas opvalt als Luka op de knop drukt — en dan lijkt het of de
 * notch stuk is.
 *
 * Dit is precies de val uit die allowlist zelf: 'command' stond erin terwijl
 * de route al weg was, en dan opent er een VENSTER op een lege pagina. Erger
 * dan niets, want het ziet eruit alsof het werkte.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const notch = readFileSync(join(hier, 'AxeOverlayNotch.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('open groot gaat naar een venster dat bestaat', () => {
  it('elke projectiesoort wijst een pagina aan die in de allowlist staat', () => {
    for (const mode of ['map', 'chart', 'document', 'image', 'html', 'code', 'media']) {
      expect(OPENABLE_PAGES as readonly string[]).toContain(paginaVoorProjectie(mode));
    }
  });

  it('een kaart gaat naar 3D Maps en een grafiek naar trading', () => {
    expect(paginaVoorProjectie('map')).toBe('maps-3d');
    expect(paginaVoorProjectie('chart')).toBe('trading');
  });

  it('alles waar geen eigen venster voor is, gaat naar de browser', () => {
    expect(paginaVoorProjectie('document')).toBe('browser');
    expect(paginaVoorProjectie('iets-nieuws')).toBe('browser');
  });
});

describe('de bron onder een webresultaat', () => {
  it('pakt de eerste http-link uit de tekst', () => {
    const tekst = 'Titel\nSamenvatting met tekst\nhttps://nos.nl/artikel/123\n\nTweede\nhttps://x.nl/a';
    expect(eersteUrl(tekst)).toBe('https://nos.nl/artikel/123');
  });

  it('geen link is geen fout', () => {
    expect(eersteUrl('gewoon tekst')).toBeNull();
    expect(eersteUrl(undefined)).toBeNull();
  });

  it('neemt een sluithaakje niet mee in de url', () => {
    expect(eersteUrl('zie (https://nos.nl/a) verder')).toBe('https://nos.nl/a');
  });
});

describe('de notch gebruikt de bestaande wegen', () => {
  it('vraagt de router om de projectie en bedenkt er zelf geen', () => {
    expect(notch).toContain("from '@/application/sphere/vraagRouter'");
    expect(notch).toContain('projectieUitVraag(');
  });

  it('gaat niet via presentOnSphere — dat sleept Home store mee', () => {
    // De notch is een eigen Tauri-venster zonder Home. presentOnSphere duwt
    // naar useSphereProjectionStore en staat daarom op de uitzonderingslijst
    // van architecture.test.ts; die overtreding hoort niet in de strook.
    expect(notch).not.toContain('presentOnSphere');
  });

  it('maakt zelf geen venster aan voor "open groot"', () => {
    // Anders staat er een tweede manier om een kaart te openen, met zijn
    // eigen maat, plek en route -- en wijken die twee na één wijziging af.
    expect(notch).not.toContain('new WebviewWindow');
  });

  it('en de toestandenlijst wordt echt gebruikt, niet alleen geëxporteerd', () => {
    // Een vangnet voor deze test zelf: zonder dit zou een lege lijst elke
    // controle hierboven stil laten slagen.
    expect(NOTCH_TOESTANDEN.length).toBeGreaterThanOrEqual(5);
  });
});
