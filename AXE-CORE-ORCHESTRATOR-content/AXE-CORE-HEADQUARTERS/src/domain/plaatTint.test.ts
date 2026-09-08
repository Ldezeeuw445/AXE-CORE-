import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Dezelfde regel twee keer uitschrijven is vandaag vier keer misgegaan.
 *
 * --surface-bg, de railbreedte, de lichte tint van de schil: elke keer stond
 * er een tweede definitie honderden regels verderop, die de eerste stil
 * overschreef. Je past de bovenste aan, ziet geen verschil, en gaat ergens
 * anders zoeken.
 *
 * Deze test bewaakt niet de waarden maar het AANTAL: staat een regel er twee
 * keer, dan faalt hij -- ook als beide exemplaren toevallig hetzelfde zeggen.
 */
const css = readFileSync(new URL('../design/axe-look.css', import.meta.url), 'utf8');

/** Tel hoe vaak een selector als blok-opening voorkomt. */
function keren(selector: string): number {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (css.match(new RegExp(`^${esc}\\s*\\{`, 'gm')) || []).length;
}

describe('geen enkele plaatregel staat er twee keer', () => {
  it.each([
    ":root[data-look='glass'] .axe-shell",
    ":root[data-look='black'] .axe-shell",
  ])('%s is één keer gedefinieerd', (sel) => {
    const n = keren(sel);
    expect(n, `${sel} staat ${n}x -- de laatste overschrijft de eerste stil`).toBeLessThanOrEqual(1);
  });

  it('de lichte schil legt niets over het native glas', () => {
    // Het materiaal onder de webview levert de kleur. Een waas erover haalt
    // het bureaublad weg, en dan is het geen matglas meer maar een plaat.
    const blok = css.match(/:root\[data-look='glass'\] \.axe-shell\s*\{[^}]*\}/s);
    expect(blok, 'de lichte schil-regel is verdwenen').toBeTruthy();
    expect(blok![0]).toMatch(/background:\s*transparent/);
  });
});
