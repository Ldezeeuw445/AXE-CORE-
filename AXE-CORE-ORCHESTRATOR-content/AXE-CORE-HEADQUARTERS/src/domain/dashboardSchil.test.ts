import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * De dashboardschil (Luka, 25 nov 2026): elke tab één scherm, de pagina
 * schuift niet. Deze toetsen bewaken de vorm, niet de pixels -- de meting
 * staat in e2e/home-live-layout/dashboard-audit.spec.ts.
 */
const css = readFileSync(new URL('../design/axe-dashboard.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../app/index.css', import.meta.url), 'utf8');
const schil = readFileSync(new URL('../presentation/components/layout/dashboardSchil.tsx', import.meta.url), 'utf8');
const tasks = readFileSync(new URL('../presentation/pages/Tasks.tsx', import.meta.url), 'utf8');
const hub = readFileSync(new URL('../presentation/components/v3/HubV3.tsx', import.meta.url), 'utf8');

function blok(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`${esc}\\s*\\{[^}]+\\}`));
  expect(m, `${selector} ontbreekt`).toBeTruthy();
  return m![0];
}

describe('dashboardschil', () => {
  it('wordt geladen na axe-look.css', () => {
    expect(index.indexOf('axe-dashboard.css')).toBeGreaterThan(index.indexOf('axe-look.css'));
  });

  it('de schil zelf schuift nooit', () => {
    expect(blok(':root[data-look] .axe-dash')).toMatch(/overflow:\s*hidden/);
  });

  it('het raster verdeelt beide assen in gelijke sporen', () => {
    const r = blok(':root[data-look] .axe-dash-raster');
    expect(r).toMatch(/grid-template-columns:\s*repeat\(var\(--dash-kolommen[^)]*\),\s*minmax\(0,\s*1fr\)\)/);
    expect(r).toMatch(/grid-template-rows:\s*repeat\(var\(--dash-rijen[^)]*\),\s*minmax\(0,\s*1fr\)\)/);
  });

  it('alleen het kaartlijf mag schuiven', () => {
    expect(blok(':root[data-look] .axe-dash-kaart')).toMatch(/overflow:\s*hidden/);
    expect(blok(':root[data-look] .axe-dash-kaart-lijf')).toMatch(/overflow-y:\s*auto/);
  });

  it('kaarten zijn het ene materiaal, geen eigen kaartkleur', () => {
    expect(schil).toMatch(/'axe-kaart axe-dash-kaart/);
    expect(css).not.toMatch(/--axe-kaart-(vlak|lijn|schaduw|hoek):/);
  });

  it('staat in TabRuimte vullen, zodat de plaatmaat gelijk blijft', () => {
    expect(schil).toMatch(/<TabRuimte vullen>/);
  });

  it('Tasks en de hubs gebruiken de schil', () => {
    expect(tasks).toMatch(/<DashSchil/);
    expect(tasks).toMatch(/<DashRaster/);
    expect(hub).toMatch(/<DashSchil/);
  });
});
