import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTCH_TOESTANDEN } from '@/domain/overlay/notchLeven';

/**
 * Een toestand die niemand tekent, bestaat niet.
 *
 * De notch heeft zes toestanden (zie `domain/overlay/notchLeven`). Of die
 * logica klopt, toetst dat bestand zelf. Hier gaat het om de stap erna: dat
 * elke toestand ook ZICHTBAAR is. Voeg je er een toe en vergeet je de CSS,
 * dan draait alles groen terwijl de strook er in die toestand uitziet als in
 * rust — en dat is precies de fout die dit hele stuk werk moest oplossen.
 *
 * Deze suite draait zonder DOM (zie `vitest.config.ts`: node, geen jsdom, met
 * opzet). Dus leest hij de bron, zoals `vensterSchaduw.test.ts` dat ook doet.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const ruw = readFileSync(join(hier, 'AxeOverlayNotch.tsx'), 'utf8');
const css = readFileSync(join(hier, 'AxeOverlayNotch.css'), 'utf8');

/**
 * De bron zonder commentaar.
 *
 * Een uitleg die vertelt dat het leven eerst alleen in `axe-ov__body` stond,
 * noemt `axe-ov__body` — en dan vindt de volgorde-test die naam in de uitleg
 * in plaats van in de JSX. Een test die op zijn eigen documentatie faalt,
 * leert je de documentatie weg te halen.
 */
const tsx = ruw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('de notch toont zijn toestand', () => {
  it('leest de toestand uit het domein in plaats van hem zelf te bedenken', () => {
    expect(tsx).toContain("from '@/domain/overlay/notchLeven'");
    expect(tsx).toContain('beoordeelNotch({');
  });

  it('zet de toestand op de bol, zodat de CSS erop kan mikken', () => {
    expect(tsx).toMatch(/data-toestand=\{leven\.toestand\}/);
  });

  it('staat in de strook zelf en niet in het uitklapbare deel', () => {
    // `axe-ov__body` bestaat alleen als de notch open is. Stond het leven
    // daarin, dan zou je ingeklapt — dus bijna altijd — weer niets zien.
    const hart = tsx.indexOf('axe-ov__hart');
    const body = tsx.indexOf('axe-ov__body');
    expect(hart).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(-1);
    expect(hart).toBeLessThan(body);
  });

  it('elke toestand heeft een eigen ring in de CSS', () => {
    const missend = NOTCH_TOESTANDEN.filter(
      (t) => !css.includes(`[data-toestand='${t}']`),
    );
    expect(missend, `zonder CSS-regel, dus onzichtbaar: ${missend.join(', ')}`).toEqual([]);
  });

  it('elke toestand met een woord heeft ook een kleur voor dat woord', () => {
    // `rust` heeft geen woord: daar zegt de ademende bol het.
    const metWoord = NOTCH_TOESTANDEN.filter((t) => t !== 'rust');
    const missend = metWoord.filter((t) => !css.includes(`.axe-ov__leven--${t}`));
    expect(missend, `woord zonder kleur: ${missend.join(', ')}`).toEqual([]);
  });

  it('de bol ademt ook in rust — stilstand leest als dood', () => {
    expect(css).toMatch(/\[data-toestand='rust'\][^}]*animation:\s*axe-ov-adem/s);
    expect(css).toContain('@keyframes axe-ov-adem');
  });

  it('wie beweging uit heeft, kan de toestand nog steeds lezen', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    const blok = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(blok).toContain('animation: none');
    // De ring moet dan blijven staan in plaats van op opacity 0 te bevriezen.
    expect(blok).toMatch(/\.axe-ov__ring\s*\{[^}]*opacity:\s*1/s);
  });

  it('de kleur zit in het woord, niet in een vlak (wet 10)', () => {
    // Een gekleurde vulling achter een getal is decoratie; een gekleurd woord
    // lees je. De ring mag kleur hebben omdat hij een rand is, geen vlak.
    const levenRegels = css
      .split('\n')
      .filter((r) => r.includes('.axe-ov__leven'))
      .join('\n');
    expect(levenRegels).not.toMatch(/background(-color)?:\s*(#|rgba?\()/);
  });
});
