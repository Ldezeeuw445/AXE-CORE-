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
    expect(css).toMatch(/grid-template-rows: 1fr 1fr/);
    expect(css).toMatch(/--axe-home-rail-gap: clamp\(8px, 1\.1vh, 12px\)/);
    expect(css).toMatch(/--axe-home-stack-gap: clamp\(8px, 1\.1vh, 12px\)/);
    expect(css).toMatch(/--axe-home-rail-top: calc\(var\(--axe-kop-h/);
    expect(css).toMatch(/top: var\(--axe-home-rail-top\)/);
    expect(css).toMatch(/--axe-composer-onder/);
    expect(css).toMatch(/--axe-composer-hoog/);
    expect(css).toMatch(/\.axe-home-rail--mobiel \{[^}]*top: 8px/);
    expect(css).toMatch(/\.axe-home-rail-regel \{[^}]*max-height: 2\.5em/);
    expect(css).toMatch(/\.axe-home-live-regel \{[^}]*max-height: 1\.25em/);
    expect(css).toMatch(/\.axe-kaart-lijf \{[^}]*height: 2\.5em/);
    expect(css).toMatch(/axe-home-rail-tegel-naam/);
    expect(css).toMatch(/nth-child\(n \+ 3\)/);
    expect(css).toMatch(/\.axe-home-live \{[^}]*overflow: hidden/);
    expect(css).toMatch(/\.axe-home-live \{[^}]*pointer-events: none/);
    expect(css).not.toMatch(/grid-template-columns: repeat\(4,/);
    expect(css).not.toMatch(/\.axe-home-live \{[^}]*overflow:\s*auto/);
    expect(css).not.toMatch(/left: calc\(clamp\(16px/);
    expect(css).not.toMatch(/\.axe-home-live-cluster \{[^}]*grid-template-columns: 1fr 1fr/);
    expect(css).not.toMatch(/\.axe-home-rail-regel \{[^}]*overflow-wrap: anywhere/);
    expect(css).not.toMatch(/\.axe-home-live-regel \{[^}]*overflow-wrap: anywhere/);
  });

  it('de strip leest echte polls en Approve/Decline', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toContain('homeLiveStand');
    expect(dash).toContain('codingSeatsHeartbeat');
    expect(dash).toContain('beslisAgentOk');
    expect(dash).toContain('GoedkeuringActie');
    expect(dash).toContain('No running tasks or missions right now');
    expect(dash).toContain('and ${n} more');
    expect(dash).toContain('kaartRegels');
    expect(dash).not.toContain('truncate');
    expect(dash).not.toContain('useLayoutEffect');
  });
});
