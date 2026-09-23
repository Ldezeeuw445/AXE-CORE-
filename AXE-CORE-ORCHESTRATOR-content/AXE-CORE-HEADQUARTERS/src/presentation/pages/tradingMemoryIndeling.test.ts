import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lees = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const tsx = lees('./TradingMemory.tsx');
const css = lees('./TradingMemory.css');

describe('de indeling van Trading Memory', () => {
  it('is één raster: per kolom precies twee tegels erboven, op dezelfde lijnen', () => {
    // Twee losse rasters (auto-fill 150 en 340) deelden geen kolomlijnen, en
    // bij 1280 breed viel de vierde kolom eronder.
    expect(tsx).not.toMatch(/<Grid[\s>]/);

    const sporen = Number(/\.axe-tm-raster \{[^}]*grid-template-columns: repeat\((\d+), minmax\(0, 1fr\)\)/.exec(css)?.[1]);
    const tegels = (tsx.match(/^\s+\{ kind: '/gm) ?? []).length;
    const kolommen = tsx.match(/<Block span=\{2\} className="axe-tm-kolom"|span=\{2\}\s+className="axe-tm-kolom"/g) ?? [];

    expect(tegels).toBe(8);
    expect(kolommen).toHaveLength(4);
    // Elke tegel één spoor, elke kolom twee: dan vult de tegelrij precies de
    // kolommen eronder, twee per kolom.
    expect(sporen).toBe(tegels);
    expect(sporen).toBe(kolommen.length * 2);
    expect(tsx).toMatch(/className="axe-tm-tegel"/);
  });

  it('staat op de tabruimte, en er beslist maar één plek over de indeling', () => {
    expect(tsx).toMatch(/className="axe-tabruimte axe-tm"/);
    // De oude klassen hebben regels in axe-look.css; die mogen hier niet
    // alsnog meebeslissen.
    expect(tsx).not.toMatch(/axe-trading-memory/);
  });
});
