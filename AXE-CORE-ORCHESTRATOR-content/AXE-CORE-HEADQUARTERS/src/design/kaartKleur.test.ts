import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Kaarten zijn altijd matzwart (Luka, 4 nov 2026).
 *
 * Het matzwart staat op één plek: `--axe-card-bg` in axe-surface.css, het
 * vlak van de Browser-tab quick actions. Binnen tien dagen dreef het weg via
 * losse rgba's in #264, #272-#276 en #289 -- elk een iets ander blauwzwart.
 *
 * Deze test faalt zodra een kaart/tegel/rail/paneel/v3-selector weer een
 * eigen donkere achtergrond schrijft (rgba of #hex). Tinten (cyaan, rood…)
 * blijven mogen; alleen een donker neutraal vlak hoort uit het token te komen.
 */

const SRC = new URL('..', import.meta.url).pathname;
const SELECTOR = /(card|kaart|tile|tegel|v3|rail|paneel|panel|room|box)/i;
/** Bewust anders: een scrim, en een tegel waarvan de kleur de cyaan-tint is. */
const UITZONDERING = new Set(['.axe-home-v3-hint', '.axe-managers-room-boss-tile']);

function cssBestanden(dir: string, uit: string[] = []): string[] {
  for (const naam of readdirSync(dir)) {
    if (naam === 'node_modules') continue;
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) cssBestanden(pad, uit);
    else if (naam.endsWith('.css')) uit.push(pad);
  }
  return uit;
}

export function isDonkerVlak(waarde: string): boolean {
  for (const m of waarde.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/g)) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if (Math.max(r, g, b) <= 45 && Number(m[4] ?? 1) >= 0.5) return true;
  }
  for (const m of waarde.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    if (Math.max(...[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))) <= 45) return true;
  }
  return false;
}

export function overtreders(css: string): string[] {
  const schoon = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const uit: string[] = [];
  for (const blok of schoon.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = blok[1].trim();
    const laatste = sel.split('\n').pop()!.trim();
    if (sel.startsWith('@') || !SELECTOR.test(sel) || UITZONDERING.has(laatste)) continue;
    for (const d of blok[2].matchAll(/background(?:-color)?\s*:\s*([^;]+)/g)) {
      if (isDonkerVlak(d[1])) uit.push(`${laatste} :: ${d[1].trim()}`);
    }
  }
  return uit;
}

describe('kaarten lezen --axe-card-bg', () => {
  it('het token bestaat en is het referentie-matzwart', () => {
    const css = readFileSync(join(SRC, 'design/axe-surface.css'), 'utf8');
    expect(css).toMatch(/--axe-card-bg:\s*linear-gradient\(180deg, rgba\(23, 23, 23, \.94\), rgba\(12, 12, 12, \.96\)\);/);
    expect(css).toMatch(/--axe-panel-bg:\s*var\(--axe-card-bg\)/);
  });

  it('de oude kaartnamen wijzen ernaar', () => {
    const look = readFileSync(join(SRC, 'design/axe-look.css'), 'utf8');
    for (const t of ['--kaart', '--kaart-2', '--card-2', '--axe-kaart-vlak']) {
      expect(look, t).toMatch(new RegExp(`${t}:\\s*var\\(--axe-card-bg\\)`));
    }
  });

  it('herkent een losse donkere achtergrond (zelftest)', () => {
    expect(overtreders('.axe-x-card { background: rgba(14, 17, 22, .92); }')).toHaveLength(1);
    expect(overtreders('.axe-v3-tile { background: #07090c; }')).toHaveLength(1);
    expect(overtreders('.axe-x-card { background: rgba(34, 211, 238, .12); }')).toHaveLength(0);
    expect(overtreders('.axe-x-card { background: var(--axe-card-bg); }')).toHaveLength(0);
    expect(overtreders('.axe-knop { background: #000; }')).toHaveLength(0);
  });

  it('geen kaart/tegel/v3-selector schrijft een eigen donker vlak', () => {
    const fout = cssBestanden(SRC).flatMap((p) =>
      overtreders(readFileSync(p, 'utf8')).map((o) => `${p.replace(SRC, '')}: ${o}`),
    );
    expect(fout).toEqual([]);
  });
});
