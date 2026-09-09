import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Een kaart op de plaat is dicht.
 *
 * Vier keer op één dag ging het hier mis, steeds op dezelfde manier: een
 * achtergrond als `${kleur}08` -- een kleur met acht van de 255 aan dekking,
 * drie procent. Op een ondoorzichtige achtergrond ziet dat er uit als een
 * subtiele tint. Op de glazen plaat van AXE is het geen kaart maar een waas:
 * je bureaublad komt er dwars doorheen, en de tekst erop wordt onleesbaar.
 *
 * Regel 4 van UI-MAATSTAF.md. De kleur van zo'n kaart hoort in de rand en de
 * letters te zitten, niet in een vulling die te zwak is om iets te dekken.
 *
 * Deze test kijkt alleen naar de vorm `${...}08` en `${...}0A` in een
 * achtergrond -- precies het patroon dat de fout maakte. Een bewuste zwakke
 * tint met een geschreven rgba() blijft mogelijk; die lees je tenminste.
 */

const SRC = new URL('..', import.meta.url).pathname;

function bestanden(dir: string, uit: string[] = []): string[] {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) bestanden(pad, uit);
    else if (/\.tsx$/.test(naam) && !/\.test\.tsx$/.test(naam)) uit.push(pad);
  }
  return uit;
}

/** background: `${iets}08` -- een kleur met 3% dekking. */
const ZWAK = /background(?:Color)?:\s*`\$\{[^}]+\}0[0-9aA]`/;

describe('kaarten op de plaat zijn dicht', () => {
  it('geen achtergrond als kleur met 3% dekking', () => {
    const fout: string[] = [];
    for (const pad of bestanden(join(SRC, 'presentation'))) {
      const tekst = readFileSync(pad, 'utf8');
      for (const [i, regel] of tekst.split('\n').entries()) {
        if (ZWAK.test(regel)) fout.push(`${pad.slice(SRC.length)}:${i + 1}`);
      }
    }
    expect(
      fout,
      'Een kleur met 3% dekking is op de glazen plaat geen kaart maar een waas.\n' +
        'Gebruik var(--surface-bg) en zet de kleur in de rand en de letters.\n' +
        'Zie UI-MAATSTAF.md, regel 4.',
    ).toEqual([]);
  });
});
