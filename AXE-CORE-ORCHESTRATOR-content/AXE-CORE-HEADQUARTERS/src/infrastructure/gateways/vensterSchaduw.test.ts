import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Een doorzichtig venster krijgt geen OS-schaduw.
 *
 * macOS tekent om een venster een rechthoekige schaduw. Is dat venster
 * `transparent: true` met in CSS afgeronde hoeken, dan volgt die schaduw de
 * rechthoek en niet de vorm die je ziet: een donkere omtrek rondom het
 * paneel, en donkere streepjes in de hoeken.
 *
 * Dit is twee keer gebeurd. Eerst in de notch (opgelost met
 * `shadow: type !== 'axe'`), daarna in Personal Computer Use, dat dezelfde
 * combinatie had — en de reparatie van de eerste hielp de tweede niet, want
 * er was niets dat de regel vasthield.
 *
 * Vandaar deze test: wie een venster doorzichtig maakt, moet de schaduw
 * uitzetten. Hij leest de bron en niet de draaiende app, want hier draait
 * geen Tauri.
 */

const GATEWAYS = resolve(__dirname);

function tsBestanden(map: string): string[] {
  return readdirSync(map)
    .map((n) => join(map, n))
    .filter((p) => statSync(p).isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts'));
}

/** De body van elke `new WebviewWindow(...)`-aanroep in dit bestand. */
function vensterOpties(bron: string): string[] {
  const uit: string[] = [];
  let i = bron.indexOf('new WebviewWindow(');
  while (i >= 0) {
    const open = bron.indexOf('{', i);
    if (open < 0) break;
    let diepte = 0;
    let j = open;
    for (; j < bron.length; j += 1) {
      if (bron[j] === '{') diepte += 1;
      else if (bron[j] === '}') {
        diepte -= 1;
        if (diepte === 0) break;
      }
    }
    uit.push(bron.slice(open, j + 1));
    i = bron.indexOf('new WebviewWindow(', j);
  }
  return uit;
}

describe('zwevende vensters', () => {
  it('zet de OS-schaduw uit zodra een venster doorzichtig is', () => {
    const overtredingen: string[] = [];

    for (const pad of tsBestanden(GATEWAYS)) {
      const bron = readFileSync(pad, 'utf8');
      if (!bron.includes('new WebviewWindow(')) continue;

      for (const opties of vensterOpties(bron)) {
        const doorzichtig = /\btransparent:\s*true\b/.test(opties);
        if (!doorzichtig) continue;
        // Uit mag als `shadow: false`, of als een uitdrukking die per venster
        // beslist (zoals `shadow: type !== 'axe'`). Aan mag niet.
        const hardAan = /\bshadow:\s*true\b/.test(opties);
        const heeftShadow = /\bshadow:/.test(opties);
        if (hardAan || !heeftShadow) {
          overtredingen.push(`${pad.split('/').pop()}: transparent zonder shadow uit`);
        }
      }
    }

    expect(overtredingen).toEqual([]);
  });

  it('leest echt vensters uit, anders slaagt deze test om de verkeerde reden', () => {
    // Zonder dit telt een regex die niets meer vindt als "geen overtredingen".
    const gevonden = tsBestanden(GATEWAYS)
      .map((p) => vensterOpties(readFileSync(p, 'utf8')).length)
      .reduce((a, b) => a + b, 0);
    expect(gevonden).toBeGreaterThanOrEqual(3);
  });
});
