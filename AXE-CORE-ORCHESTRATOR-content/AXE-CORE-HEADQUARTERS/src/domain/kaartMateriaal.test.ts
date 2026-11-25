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
const tasks = readFileSync(new URL('../presentation/pages/Tasks.tsx', import.meta.url), 'utf8');
const cron = readFileSync(new URL('../presentation/pages/CronManager.tsx', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../presentation/pages/CalendarPage.tsx', import.meta.url), 'utf8');
const finance = readFileSync(new URL('../presentation/pages/Finance.tsx', import.meta.url), 'utf8');
const control = readFileSync(new URL('../presentation/pages/ControlPlane.tsx', import.meta.url), 'utf8');
const crew = readFileSync(new URL('../presentation/pages/CrewAI.tsx', import.meta.url), 'utf8');

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

  it('tabruimte en browservak delen dezelfde plaat-tokens', () => {
    expect(css).toMatch(/--axe-plaat-marge-inline:\s*clamp\(14px,\s*10vw,\s*230px\)/);
    expect(css).toMatch(/--axe-plaat-marge-onder:\s*clamp\(10px,\s*1\.4vh,\s*20px\)/);
    const gedeeld = css.match(
      /:root\[data-look\] \.axe-plaat,\s*:root\[data-look\] \.axe-tabruimte,\s*:root\[data-look\] \.axe-browser-vak\s*\{[^}]+\}/,
    );
    expect(gedeeld, 'één regel voor plaat + tabruimte + browservak').toBeTruthy();
    expect(gedeeld![0]).toMatch(/margin-inline:\s*var\(--axe-plaat-marge-inline\)/);
    expect(gedeeld![0]).toMatch(/margin-bottom:\s*var\(--axe-plaat-marge-onder\)/);
  });

  /* 11 okt 2026: een regel `.axe-tabruimte:not(.axe-tabruimte--vullen)` kneep
     sinds 25 sep elke tab zonder `vullen` terug tot de bandbreedte van de
     composer. Layoutregel 1 kent één inhoudsruimte; de band is alleen voor de
     composer, de chatplaat en de browser-startpagina. */
  it('geen regel knijpt de tabruimte tot de bandbreedte', () => {
    // Per regelblok: alles tussen twee `}`; selector = laatste stuk vóór `{`.
    const blokken = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}')
      .map((b) => {
        const i = b.lastIndexOf('{');
        return i < 0 ? null : { selector: b.slice(0, i).split('{').pop()!.trim(), lijf: b.slice(i + 1) };
      })
      .filter((b): b is { selector: string; lijf: string } => !!b && b.selector.includes('.axe-tabruimte'));
    expect(blokken.length).toBeGreaterThan(0);
    for (const { selector, lijf } of blokken) {
      expect(lijf, selector).not.toMatch(/--axe-barw/);
      expect(lijf, selector).not.toMatch(/margin-inline:\s*auto/);
    }
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

  it('Settings is één dashboard: sectiekaarten in een raster, secties in een venster', () => {
    // 25 nov: DashSchil zet TabRuimte vullen neer; de linkerrail werd een
    // raster van sectiekaarten (axe-settings-v3-raster), elke sectie
    // opent in een DashVenster. De sectieblokken zelf blijven.
    expect(settings).toMatch(/<DashSchil/);
    expect(settings).toMatch(/<DashVenster/);
    expect(settings).toMatch(/axe-settings-v3-raster/);
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

describe('Calendar, Cron, Tasks en de volgende tabs', () => {
  it('Tasks is één dashboard: DashSchil (TabRuimte vullen), SchuifBalk en kaarten', () => {
    // 25 nov: de dashboardschil zet zelf TabRuimte vullen neer.
    expect(tasks).toMatch(/<DashSchil/);
    expect(tasks).toMatch(/<DashKaart/);
    expect(tasks).toMatch(/<SchuifBalk/);
    expect(tasks).toMatch(/<SectieBlok/);
  });

  it('Cron gebruikt Kaart en geen LIST_GRID', () => {
    expect(cron).toMatch(/<TabRuimte/);
    expect(cron).toMatch(/<Kaart/);
    expect(cron).toMatch(/<SectieBlok/);
    expect(cron).not.toMatch(/LIST_GRID/);
  });

  it('Calendar vult via TabRuimte', () => {
    expect(calendar).toMatch(/<TabRuimte/);
    expect(calendar).toMatch(/vullen/);
  });

  it('Finance rekt geen stats meer', () => {
    expect(finance).toMatch(/<TabRuimte/);
    expect(finance).toMatch(/<StatRij/);
    expect(finance).toMatch(/<SchuifBalk/);
    expect(finance).not.toMatch(/STAT_ROW/);
  });

  it('ControlPlane gebruikt StatRij; CrewAI is een dashboard (cijfers in de kop)', () => {
    expect(control).toMatch(/<TabRuimte/);
    expect(control).toMatch(/<StatRij/);
    expect(control).not.toMatch(/STAT_ROW/);
    // 25 nov: CrewAI staat in DashSchil (TabRuimte vullen); de stats zijn
    // kopcijfers (DashKop) in plaats van een StatRij -- nog steeds niet gerekt.
    expect(crew).toMatch(/<DashSchil/);
    expect(crew).toMatch(/<DashKop/);
    expect(crew).not.toMatch(/STAT_ROW/);
  });
});
