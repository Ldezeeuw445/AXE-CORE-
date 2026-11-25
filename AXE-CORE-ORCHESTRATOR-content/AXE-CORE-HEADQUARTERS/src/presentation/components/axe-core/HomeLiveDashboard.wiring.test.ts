import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bron = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe('Home command center is aangesloten (25 nov v2)', () => {
  it('desktop Home toont het command center, mobiel de rails rond de core', () => {
    const home = bron('../../pages/Home.tsx');
    expect(home).toContain('HomeLiveDashboard');
    expect(home).toMatch(/!isMobile && <HomeLiveDashboard/);
    expect(home).toMatch(/\{isMobile && <AgentVensters \/>\}/);
    expect(home).not.toContain('ArchitectureWorkspace');
    expect(home).toMatch(/--axe-chat-onder/);
    expect(home).toMatch(/axe-home-bolvak/);
    expect(home).toMatch(/data-axe-home-view=\{coreView\}/);
    expect(home).toMatch(/\{isMobile && <div className="axe-home-status/);
  });

  it('één symmetrisch raster: strip / links · core · rechts / vier gelijke kaarten, nooit scrollen', () => {
    const css = bron('homeCommandCenter.css');
    expect(css).toMatch(/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/'strip strip strip strip'/);
    expect(css).toMatch(/'links kern kern rechts'/);
    expect(css).toMatch(/'onder onder onder onder'/);
    expect(css).toMatch(/\.axe-hcc \{[^}]*overflow: hidden/);
    expect(css).toMatch(/\.axe-hcc \{[^}]*pointer-events: none/);
    // Boven de composer en vrij van de ronde dok-knoppen.
    expect(css).toMatch(/--hcc-onder: calc\(var\(--axe-composer-onder[^;]*var\(--axe-composer-hoog[^;]*var\(--hcc-lucht\)\)/);
    expect(css).toMatch(/:root\[data-axe-dash\] \{ --hcc-lucht: 30px; \}/);
    // De core staat in het middenvak, alleen in de AXE-weergave.
    expect(css).toMatch(/\.axe-home-v3\[data-axe-home-view='axe'\] \.axe-home-bolvak \{[^}]*left: calc\(var\(--hcc-inset\) \+ var\(--hcc-kol\) \+ var\(--hcc-gat\)\)/);
    // Lijsten lopen door naar een verborgen kolom: geen halve regels, geen schuifbalk.
    expect(css).toMatch(/\.axe-hcc-feed \{[^}]*flex-wrap: wrap/);
    // Het oude losse command-center blok (rails-breedte) is weg.
    expect(bron('homeLive.css')).not.toMatch(/\.axe-home-kpis \{/);
  });

  it('alle kaarten uit het referentiedashboard staan erin', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    for (const titel of ['Core overview', 'Services & devices', 'Live feed', 'Needs you', 'Quick commands', 'Agents', 'Today', 'System monitor', 'LLM providers']) {
      expect(dash).toContain(`titel="${titel}"`);
    }
    for (const kern of ['AI core', 'Memory', 'Voice', 'Agents', 'LLMs', 'System']) {
      expect(dash).toContain(`<KernRij label="${kern}"`);
    }
    expect(dash).toContain('Executive briefing');
    expect(dash).toMatch(/setPalette\(true\)/);
    expect(dash).toMatch(/navigate\('\/notifications'\)/);
  });

  it('leest echte polls; eerlijke lege staten, niets verzonnen', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toContain('homeLiveStand');
    expect(dash).toContain('codingSeatsHeartbeat');
    expect(dash).toContain('lockscreenSnapshot');
    expect(dash).toContain('ledgerOverview');
    expect(dash).toContain('calendarJobs');
    expect(dash).toContain('laadDevices');
    expect(dash).toContain('useNotifications');
    expect(dash).toMatch(/useCoreStatusStore\(\(s\) => s\.status\?\.providers/);
    expect(dash).toContain('No live metrics: the VPS snapshot did not answer.');
    expect(dash).toContain('No provider check yet.');
    expect(dash).not.toMatch(/Math\.random/);
    expect(dash).not.toContain('useLayoutEffect');
  });

  it('Needs you: Approve/Decline en Ask agent, Luka tikt zelf', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toContain('GoedkeuringActie');
    expect(dash).toMatch(/rijen=\{stand\.goedkeuringen\}/);
    expect(dash).toMatch(/onVraag=/);
    expect(dash).toMatch(/onBeslis=\{\(rij, akkoord\) => \{ void beslisAgentOk\(\{ akkoord, rij \}\)/);
    // Nergens een automatische beslissing.
    expect(dash).not.toMatch(/beslisAgentOk\(\{ akkoord: true/);
    expect(dash).toContain('Nothing is waiting on you.');
  });

  it('mislukte taken in de feed bieden Fix, niet alleen Retry', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toMatch(/fixDurableTask/);
    expect(dash).toMatch(/actie === 'fix'/);
    expect(dash).toMatch(/taakActieLabel/);
  });
});
