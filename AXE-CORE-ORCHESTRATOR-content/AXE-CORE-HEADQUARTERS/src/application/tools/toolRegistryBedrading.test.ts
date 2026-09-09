import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Elke verzameling gereedschap-uitvoeringen moet ook echt in de registry staan.
 *
 * De aanleiding: `COMPUTER_TOOL_RUNTIMES` had nul gebruikers en
 * `MAC_TOOL_RUNTIMES` stond wél geimporteerd maar werd nooit uitgerold --
 * terwijl `registerComputerCatalog` en `registerMacCatalog` hun gereedschappen
 * gewoon aanmeldden. AXE zag die gereedschappen dus in zijn lijst staan en kon
 * ze aanroepen, en er was niets dat ze uitvoerde. Van buiten lijkt dat op een
 * model dat een gereedschap "verkeerd gebruikt"; van binnen is de leiding niet
 * aangesloten.
 *
 * Dit is dezelfde faalwijze als bij de leerlus (zie learningLoopWiring.test.ts)
 * en als val 2 in AGENTS.md: bestaan, getest zijn en aangeroepen worden zijn
 * drie verschillende dingen. Een test die alleen de uitvoeringen zélf test
 * merkt hier niets van -- vandaar dat deze naar de bedrading kijkt.
 *
 * Bewust op de tekst en niet op de import: importeren we de registry hier, dan
 * sleept die de halve app mee (Supabase, gateways, een DOM). Voor de vraag "is
 * deze regel uitgerold" is de broncode het directe bewijs.
 */

const DIR = path.resolve(new URL('.', import.meta.url).pathname);
const REGISTRY = path.join(DIR, 'toolRegistry.ts');

/** Alle `export const X_TOOL_RUNTIMES` in deze map, behalve de registry zelf. */
function verzamelingen(): string[] {
  const namen: string[] = [];
  for (const bestand of readdirSync(DIR)) {
    if (!bestand.endsWith('.ts') || bestand.endsWith('.test.ts')) continue;
    if (bestand === 'toolRegistry.ts') continue;
    const bron = readFileSync(path.join(DIR, bestand), 'utf8');
    for (const m of bron.matchAll(/export const ([A-Z0-9_]*TOOL_RUNTIMES)\b/g)) {
      namen.push(m[1]);
    }
  }
  return namen;
}

describe('de gereedschap-registry', () => {
  const bron = readFileSync(REGISTRY, 'utf8');
  const gevonden = verzamelingen();

  it('vindt de verzamelingen waar het over gaat', () => {
    // Faalt deze, dan is de vorm veranderd en bewaakt de test hieronder niets
    // meer -- een test die stilletjes nul dingen controleert is erger dan geen.
    expect(gevonden.length).toBeGreaterThanOrEqual(8);
    expect(gevonden).toContain('COMPUTER_TOOL_RUNTIMES');
    expect(gevonden).toContain('MAC_TOOL_RUNTIMES');
  });

  it.each(gevonden)('rolt %s uit in TOOL_RUNTIMES', naam => {
    expect(bron).toContain(`...${naam} as ToolRuntime[]`);
  });
});
