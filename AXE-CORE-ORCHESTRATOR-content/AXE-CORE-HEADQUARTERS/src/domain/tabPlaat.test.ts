import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Layoutregel 1: één inhoudsruimte — het vak van de Browser-plaat.
 *
 * Claude haalde op 15 okt de regel weg die elke tab zonder `vullen` tot de
 * composer-band kneep. Deze tests bewaken dat die tweede maat niet terugkomt,
 * dat tabruimte en browservak dezelfde tokens lezen, en dat elke tab (behalve
 * desktop Home en mobiele Home) in dat vak staat.
 */
const hq = new URL('../', import.meta.url);
const lees = (rel: string) => readFileSync(new URL(rel, hq), 'utf8');
const css = lees('design/axe-look.css');
const app = lees('app/App.tsx');
const home = lees('presentation/pages/Home.tsx');
const mobile = lees('presentation/pages/MobileSystem.tsx');
const browserStart = lees('presentation/components/browser/BrowserStartPage.tsx');
const browserApp = lees('presentation/components/browser/BrowserApp.tsx');
const primitieven = lees('presentation/components/layout/tabMaatstaf.tsx');

function clamp(min: number, val: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/** Zelfde som als `--axe-plaat-marge-inline: clamp(14px, 10vw, 230px)`. */
function plaatMarge(venster: number): number {
  return clamp(14, 0.10 * venster, 230);
}

function plaatBreedte(venster: number): number {
  return venster - 2 * plaatMarge(venster);
}

/** Composer/chat/nav: `--axe-barw: min(1520px, 100vw - 574px)`. */
function bandBreedte(venster: number): number {
  return Math.min(1520, venster - 574);
}

/**
 * AppShell-routes die de plaat moeten gebruiken.
 * Home (`index`), `/mobile` en `/lock` horen er expres niet bij.
 */
const TAB_BRONNEN: Array<{ route: string; files: string[] }> = [
  { route: 'status', files: ['presentation/pages/StatusPage.tsx'] },
  { route: 'ai-core', files: ['presentation/pages/AICore.tsx'] },
  { route: 'apps', files: ['presentation/pages/AppsPage.tsx'] },
  { route: 'agents', files: ['presentation/pages/Agents.tsx'] },
  { route: 'tasks', files: ['presentation/pages/Tasks.tsx'] },
  { route: 'calendar', files: ['presentation/pages/CalendarPage.tsx'] },
  { route: 'ledger', files: ['presentation/pages/Grootboek.tsx'] },
  { route: 'memory', files: ['presentation/pages/MemoryHub.tsx'] },
  { route: 'memory/explore', files: ['presentation/pages/Memory.tsx'] },
  { route: 'memory/trading', files: ['presentation/pages/TradingMemory.tsx'] },
  { route: 'obsidian', files: ['presentation/pages/ObsidianMemory.tsx'] },
  { route: 'knowledge', files: ['presentation/pages/KnowledgeBase.tsx'] },
  { route: 'trading', files: ['presentation/pages/Trading.tsx', 'presentation/pages/TradingIntel.tsx'] },
  { route: 'trading-intel', files: ['presentation/pages/TradingIntel.tsx'] },
  { route: 'finance', files: ['presentation/pages/Finance.tsx'] },
  { route: 'mcp', files: ['presentation/pages/MCPCenter.tsx'] },
  { route: 'infrastructure', files: ['presentation/pages/Infrastructure.tsx'] },
  { route: 'terminal', files: ['presentation/pages/TerminalPage.tsx'] },
  { route: 'terminals', files: ['presentation/pages/TerminalsPage.tsx'] },
  { route: 'settings', files: ['presentation/pages/SettingsPage.tsx'] },
  { route: 'table-editor', files: ['presentation/pages/TableEditor.tsx'] },
  { route: 'cron-manager', files: ['presentation/pages/CronManager.tsx'] },
  { route: 'control-plane', files: ['presentation/pages/ControlPlane.tsx'] },
  { route: 'maps-3d', files: ['presentation/pages/northsea/NorthseaDesk.tsx'] },
  { route: 'crewai', files: ['presentation/pages/CrewAI.tsx'] },
  { route: 'developer', files: ['presentation/pages/CommandCenter.tsx'] },
  { route: 'code-editor', files: ['presentation/pages/CodeEditorPage.tsx'] },
  { route: 'eve', files: ['presentation/pages/EveFramework.tsx'] },
  { route: 'browser', files: ['presentation/components/browser/BrowserApp.tsx'] },
  { route: 'computer-use', files: ['presentation/pages/ComputerUse.tsx'] },
  { route: 'organization', files: ['presentation/pages/Organization.tsx'] },
  { route: 'thinkthanks', files: ['presentation/pages/ThinkThanksPage.tsx'] },
  { route: 'device', files: ['presentation/pages/DeviceManager.tsx'] },
];

function heeftPlaat(bron: string): boolean {
  return /axe-tabruimte|<TabRuimte\b|axe-browser-vak|axe-plaat/.test(bron);
}

describe('één gedeelde plaat-maat', () => {
  it('de tokens staan in de basis en tabruimte + browservak lezen ze', () => {
    expect(css).toMatch(/--axe-plaat-marge-inline:\s*clamp\(14px,\s*10vw,\s*230px\)/);
    expect(css).toMatch(/--axe-plaat-marge-onder:\s*clamp\(10px,\s*1\.4vh,\s*20px\)/);
    expect(css).toMatch(
      /:root\[data-look\] \.axe-plaat,\s*:root\[data-look\] \.axe-tabruimte,\s*:root\[data-look\] \.axe-browser-vak/,
    );
    expect(primitieven).toMatch(/axe-plaat axe-tabruimte/);
    expect(browserApp).toMatch(/axe-plaat axe-browser-vak/);
  });

  it('bij 1440, 1600 en 1920 is de plaat breder dan de composer-band', () => {
    // UI-MAATSTAF.md: bij 1600 is de tabruimte 1280 en de band 1026.
    expect(plaatBreedte(1600)).toBe(1280);
    expect(bandBreedte(1600)).toBe(1026);
    expect(plaatBreedte(1440)).toBe(1152);
    expect(bandBreedte(1440)).toBe(866);
    expect(plaatBreedte(1920)).toBe(1536);
    expect(bandBreedte(1920)).toBe(1346);
    for (const vw of [1440, 1600, 1920]) {
      expect(plaatBreedte(vw)).toBeGreaterThan(bandBreedte(vw));
    }
  });

  it('TabRuimte is de container; de plaat is een maximum, geen doel', () => {
    expect(primitieven).toMatch(/vullen = false/);
    expect(primitieven).toMatch(/axe-inhoud/);
    expect(css).toMatch(/\.axe-kaart-raster\s*\{[^}]*auto-fit/s);
    expect(css).toMatch(/\.axe-stat-rij\s*\{[^}]*justify-content:\s*center/s);
  });
});

describe('elke tab staat in de plaat — Home en mobiele Home niet', () => {
  it('App.tsx kent elke tab in de lijst, en andersom', () => {
    for (const { route } of TAB_BRONNEN) {
      expect(app, route).toMatch(new RegExp(`path="${route.replace('/', '\\/')}"`));
    }
    expect(app).toMatch(/<Route index element=\{<HomeEntry/);
    expect(app).toMatch(/path="mobile"/);
    expect(app).toMatch(/path="lock"/);
  });

  it.each(TAB_BRONNEN)('$route gebruikt de plaat-container', ({ files }) => {
    const bron = files.map((f) => lees(f)).join('\n');
    expect(heeftPlaat(bron), files.join(', ')).toBe(true);
  });

  it('desktop Home blijft volle breedte, zonder tabruimte', () => {
    expect(home).toMatch(/Volle breedte, niet de tabruimte/);
    expect(home).not.toMatch(/className=\{?["'`][^"'`]*axe-tabruimte/);
    expect(home).not.toMatch(/<TabRuimte/);
  });

  it('mobiele Home blijft .axe-mobile-home, zonder tabruimte', () => {
    expect(mobile).toMatch(/axe-mobile-home/);
    expect(mobile).not.toMatch(/className=["'`][^"'`]*axe-tabruimte/);
    expect(mobile).not.toMatch(/<TabRuimte/);
  });

  it('Browser-home blijft op de band; een geladen site krijgt de plaat', () => {
    expect(browserStart).toMatch(/className="axe-bandbreed/);
    expect(browserStart).not.toMatch(/axe-tabruimte/);
    expect(browserStart).not.toMatch(/axe-browser-vak/);
    expect(browserApp).toMatch(/isOnHome \? '' : 'axe-plaat axe-browser-vak'/);
  });
});

describe('Playwright meet de echte plaatbreedte', () => {
  it('tabruimte en browservak zijn even breed op 1440 en 1920', () => {
    const script = fileURLToPath(new URL('../../scripts/meet-plaat-geometrie.cjs', import.meta.url));
    expect(existsSync(script), 'meet-plaat-geometrie.cjs ontbreekt').toBe(true);
    const r = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      timeout: 90_000,
      env: { ...process.env },
    });
    if (r.status === 2) {
      // Playwright of Chromium ontbreekt in deze omgeving — de statische
      // sommen hierboven blijven de meetlat. Live meting is extra bewijs.
      expect(r.stdout + r.stderr).toMatch(/SKIP/);
      return;
    }
    expect(r.status, r.stderr || r.stdout).toBe(0);
    const jsonRegel = (r.stdout || '').trim().split('\n').filter((l) => l.startsWith('{')).pop();
    expect(jsonRegel, r.stdout).toBeTruthy();
    const meting = JSON.parse(jsonRegel!) as {
      maten: Array<{
        vw: number;
        tab: { width: number; left: number };
        vak: { width: number; left: number };
      }>;
    };
    for (const m of meting.maten) {
      expect(m.tab.width, `${m.vw} tab`).toBe(plaatBreedte(m.vw));
      expect(m.vak.width, `${m.vw} vak`).toBe(plaatBreedte(m.vw));
      expect(m.tab.left, `${m.vw} left`).toBe(m.vak.left);
    }
  }, 90_000);
});
