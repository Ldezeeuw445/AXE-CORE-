import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bron = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe('Home live dashboard is aangesloten', () => {
  it('desktop Home zet de strip onder de bol, mobiel niet', () => {
    const home = bron('../../pages/Home.tsx');
    expect(home).toContain('HomeLiveDashboard');
    expect(home).toMatch(/!isMobile && <HomeLiveDashboard/);
    expect(home).not.toContain('ArchitectureWorkspace');
    expect(home).toMatch(/--axe-chat-onder/);
  });

  it('de live strip blijft tussen de rails, niet onder de composer', () => {
    const css = bron('homeLive.css');
    expect(css).toContain('--axe-home-rail-breed');
    expect(css).toContain('--axe-home-rail-gap');
    expect(css).toContain('--axe-home-rail-top');
    expect(css).toContain('.axe-home-rail--rechts');
    expect(css).toMatch(/left: var\(--axe-home-rail-inset\)/);
    expect(css).toMatch(/right: var\(--axe-home-rail-inset\)/);
    expect(css).toMatch(/axe-home-live-cluster/);
    expect(css).toMatch(/grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/--axe-home-rail-gap: clamp\(8px/);
    expect(css).toMatch(/--axe-home-rail-pad-y: clamp\(4px/);
    expect(css).toMatch(/--axe-home-rail-regel-lijnen: 2/);
    expect(css).toMatch(/--axe-home-rail-tegel-pad: 6px/);
    expect(css).toMatch(/container-name: home-rail/);
    expect(css).toMatch(/--axe-home-stack-gap: 12px/);
    expect(css).toMatch(/--axe-home-live-hoog: clamp\(168px/);
    expect(css).toMatch(/--axe-home-live-cluster-breed: var\(--axe-home-rail-breed\)/);
    expect(css).toMatch(/--axe-home-live-lijnen: 4/);
    expect(css).toMatch(/axe-home-rail-stapel/);
    expect(css).toMatch(/\.axe-home-rail \{[^}]*justify-content: center/);
    expect(css).toMatch(/\.axe-home-rail--mobiel \{[^}]*justify-content: flex-start/);
    expect(css).toMatch(/--axe-home-rail-top: calc\(var\(--axe-kop-h/);
    expect(css).toMatch(/top: var\(--axe-home-rail-top\)/);
    expect(css).toMatch(/--axe-composer-onder/);
    expect(css).toMatch(/--axe-composer-hoog/);
    expect(css).toMatch(/\.axe-home-rail--mobiel \{[^}]*top: 8px/);
    expect(css).toMatch(/\.axe-home-rail-regel \{[^}]*max-height: 2\.5em/);
    expect(css).toMatch(/\.axe-home-live-regel \{[^}]*max-height: 1\.25em/);
    expect(css).toMatch(/\.axe-kaart-lijf \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/axe-home-rail-tegel-naam/);
    expect(css).toMatch(/axe-home-rail-naam/);
    expect(css).toMatch(/\.axe-ok-chip \{/);
    expect(css).toMatch(/\.axe-home-rail-balk:has\(\[data-axe-ok-chip\]\) \.axe-home-rail-regel \{[^}]*-webkit-line-clamp: 1/);
    expect(css).toMatch(/\.axe-home-live \{[^}]*overflow: hidden/);
    expect(css).toMatch(/\.axe-home-live \{[^}]*pointer-events: none/);
    expect(css).toMatch(/axe-home-rail:not\(\.axe-home-rail--mobiel\)/);
    expect(css).not.toMatch(/grid-template-columns: repeat\(4,/);
    expect(css).not.toMatch(/\.axe-home-live \{[^}]*overflow:\s*auto/);
    expect(css).not.toMatch(/left: calc\(clamp\(16px/);
    expect(css).not.toMatch(/grid-template-rows: 1fr 1fr/);
    expect(css).not.toMatch(/\.axe-home-rail-regel \{[^}]*overflow-wrap: anywhere/);
    expect(css).not.toMatch(/\.axe-home-live-regel \{[^}]*overflow-wrap: anywhere/);
    // 16 nov: in de volle lijst groeit een regel mee, anders ligt regel 2 over de volgende.
    expect(css).toMatch(/\.axe-home-live-lijst \.axe-home-live-regel,[^}]*height: auto/);
  });

  it('de strip leest echte polls en Approve/Decline', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toContain('homeLiveStand');
    expect(dash).toContain('codingSeatsHeartbeat');
    expect(dash).toContain('beslisAgentOk');
    expect(dash).toContain('GoedkeuringActie');
    expect(dash).toMatch(/rijen=\{stand\.goedkeuringen\}/);
    expect(dash).not.toMatch(/rijen=\{stand\.goedkeuringen\}[\s\S]{0,80}chip/);
    expect(dash).toContain('No running tasks or missions right now');
    expect(dash).not.toContain('truncate');
    expect(dash).not.toContain('useLayoutEffect');
  });

  it('command center (25 nov): kopstrook, core in het midden, drie gelijke kaarten', () => {
    const css = bron('homeLive.css');
    const dash = bron('HomeLiveDashboard.tsx');
    const home = bron('../../pages/Home.tsx');
    // Kopstrook rand tot rand tussen dezelfde marges als de rails, zes gelijke tegels.
    expect(css).toMatch(/\.axe-home-kpis \{[^}]*left: var\(--axe-home-rail-inset\)[^}]*right: var\(--axe-home-rail-inset\)/);
    expect(css).toMatch(/--axe-kpi-kolommen: 6/);
    expect(css).toMatch(/grid-template-columns: repeat\(var\(--axe-kpi-kolommen\), minmax\(0, 1fr\)\)/);
    // Niets over de bol: rails en core beginnen onder de kopstrook.
    expect(css).toMatch(/\.axe-home-rail \{[^}]*top: calc\(var\(--axe-home-kpi-onder\)/);
    expect(css).toMatch(/\.axe-home-bolvak \{[^}]*top: calc\(var\(--axe-home-kpi-onder\)/);
    expect(home).toMatch(/axe-home-bolvak/);
    // Drie kaarten op één rij, de middelste even breed als de buitenste.
    expect(dash).toMatch(/data-axe-home-live-cluster="midden"/);
    expect(css).toMatch(/\.axe-home-live-midden\.axe-home-live-cluster \{[^}]*flex: 0 1 var\(--axe-home-live-cluster-breed\)/);
    // Core en bouw staan als tegel in de strook, niet meer los in de hoeken.
    expect(dash).toMatch(/label="Core"/);
    expect(dash).toMatch(/label="Build"/);
    expect(home).toMatch(/\{isMobile && <div className="axe-home-status/);
  });

  it('RECENT biedt Fix voor lint/project-check, niet alleen Retry', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toMatch(/fixDurableTask/);
    expect(dash).toMatch(/actie === 'fix'/);
    expect(dash).toMatch(/taakActieLabel/);
  });
});
