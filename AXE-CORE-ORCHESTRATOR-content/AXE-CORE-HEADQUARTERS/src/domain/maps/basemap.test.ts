import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BASEMAP_DARK_TILES, BASEMAP_DARK_LABELS } from './basemap';

function bronnen(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? bronnen(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe('de kaartondergrond', () => {
  it('gebruikt een ondergrond die zonder sleutel werkt: CARTO dark_all geeft overal "API KEY REQUIRED"', () => {
    const fout = bronnen('src').filter(f => !f.endsWith('basemap.test.ts') && /basemaps\.cartocdn\.com/.test(readFileSync(f, 'utf8')));
    expect(fout).toEqual([]);
  });

  it('zet {z}/{y}/{x} in de volgorde die Esri wil (y voor x), anders staat de kaart gespiegeld', () => {
    for (const u of [...BASEMAP_DARK_TILES, ...BASEMAP_DARK_LABELS]) expect(u).toMatch(/\{z\}\/\{y\}\/\{x\}$/);
  });
});
