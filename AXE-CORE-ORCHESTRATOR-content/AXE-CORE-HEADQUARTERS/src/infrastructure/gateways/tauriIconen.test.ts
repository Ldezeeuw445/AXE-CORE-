import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const MAP = join(ROOT, 'src-tauri/icons');

/**
 * `tauri::generate_context!()` weigert een icoon zonder alfakanaal ("icon ... is not RGBA") en dan bouwt
 * de hele app niet. Zo stond de Mac mini op 29 okt stil: de nieuwe icoontjes (#249) waren RGB. Deze test
 * leest de PNG-kop (IHDR: bitdiepte op byte 24, kleurtype op 25; 6 = RGBA) zodat dat vóór de push opvalt
 * in plaats van na 20 minuten compileren.
 *
 * Alleen de icoontjes in de map zelf: iOS wil juist GEEN alfakanaal, en Android bouwt Tauri hier niet.
 */
const pngs = readdirSync(MAP).filter(f => f.endsWith('.png'));

describe('Tauri-icoontjes', () => {
  it('er zijn er', () => {
    expect(pngs.length).toBeGreaterThan(0);
  });

  for (const naam of pngs) {
    it(`${naam} is 8-bit RGBA`, () => {
      const kop = readFileSync(join(MAP, naam)).subarray(0, 26);
      expect(kop.subarray(12, 16).toString('ascii')).toBe('IHDR');
      expect({ bitdiepte: kop[24], kleurtype: kop[25] }, `${naam}: zet om met sharp(...).ensureAlpha()`).toEqual({ bitdiepte: 8, kleurtype: 6 });
    });
  }
});
