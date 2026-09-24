import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Kaarttokens en de inhoudsruimte horen één keer te staan.
 *
 * Dezelfde val als plaatTint en railBreedte: twee definities, de tweede wint
 * stil, je past de bovenste aan en ziet niets.
 */
const css = readFileSync(new URL('../design/axe-look.css', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../presentation/pages/SettingsPage.tsx', import.meta.url), 'utf8');
const mcp = readFileSync(new URL('../presentation/pages/MCPCenter.tsx', import.meta.url), 'utf8');
const primitieven = readFileSync(new URL('../presentation/components/layout/tabMaatstaf.tsx', import.meta.url), 'utf8');

function tokenKeren(naam: string): number {
  const esc = naam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (css.match(new RegExp(`^\\s*${esc}:`, 'gm')) || []).length;
}

describe('kaartmateriaal staat één keer', () => {
  it.each([
    '--axe-kaart-vlak',
    '--axe-kaart-lijn',
    '--axe-kaart-lijn-boven',
    '--axe-kaart-schaduw',
    '--axe-kaart-hoek',
  ])('%s is één keer gedefinieerd', (token) => {
    const n = tokenKeren(token);
    expect(n, `${token} staat ${n}x`).toBe(1);
  });

  it('zweef leest schaduw, geen tweede schaduwrecept', () => {
    expect(css).toMatch(/--axe-kaart-zweef:\s*var\(--axe-kaart-schaduw\)/);
  });

  it('het raster rekt niet met 1fr', () => {
    const blok = css.match(/\.axe-kaart-raster\s*\{[^}]+\}/);
    expect(blok, '.axe-kaart-raster ontbreekt').toBeTruthy();
    expect(blok![0]).not.toMatch(/1fr/);
    expect(blok![0]).toMatch(/auto-fit/);
    expect(blok![0]).toMatch(/--axe-kaart-kolom/);
  });

  it('tabruimte en browservak delen dezelfde inline-marge', () => {
    const tab = css.match(/:root\[data-look\] \.axe-tabruimte\s*\{[^}]+\}/);
    const vak = css.match(/:root\[data-look\] \.axe-browser-vak\s*\{[^}]+\}/);
    expect(tab && vak, 'beide klassen horen er te zijn').toBeTruthy();
    const marge = /margin-inline:\s*([^;]+)/;
    expect(tab![0].match(marge)?.[1]).toBe(vak![0].match(marge)?.[1]);
  });
});

describe('Settings en MCP gebruiken de primitieven', () => {
  it('de vier componenten bestaan', () => {
    expect(primitieven).toMatch(/export function TabRuimte/);
    expect(primitieven).toMatch(/export function Kaart/);
    expect(primitieven).toMatch(/export function SectieBlok/);
    expect(primitieven).toMatch(/export function SchuifBalk/);
    expect(primitieven).toMatch(/Settings/);
    expect(primitieven).toMatch(/Profile/);
  });

  it('Settings heeft TabRuimte, SchuifBalk en sectieblokken', () => {
    expect(settings).toMatch(/<TabRuimte/);
    expect(settings).toMatch(/<SchuifBalk/);
    expect(settings).toMatch(/<SectieBlok/);
    expect(settings).not.toMatch(/STAT_ROW/);
  });

  it('MCP rekt geen stats meer en heeft een tool-tester-sectie', () => {
    expect(mcp).toMatch(/<TabRuimte/);
    expect(mcp).toMatch(/<StatRij/);
    expect(mcp).toMatch(/<SchuifBalk/);
    expect(mcp).toMatch(/MCP TOOL TESTER/);
    expect(mcp).not.toMatch(/STAT_ROW/);
    expect(mcp).not.toMatch(/LIST_GRID/);
  });
});
