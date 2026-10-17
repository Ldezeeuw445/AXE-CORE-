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
    expect(css).toContain('.axe-home-rail--rechts');
    expect(css).toMatch(/left: calc\(var\(--axe-home-rail-inset\) \+ var\(--axe-home-rail-breed\)/);
    expect(css).toMatch(/right: calc\(var\(--axe-home-rail-inset\) \+ var\(--axe-home-rail-breed\)/);
    expect(css).toMatch(/grid-template-columns: repeat\(4,/);
    expect(css).toMatch(/\.axe-home-live \{[^}]*overflow: hidden/);
    expect(css).not.toMatch(/\.axe-home-live \{[^}]*overflow:\s*auto/);
    expect(css).not.toMatch(/left: calc\(clamp\(16px/);
  });

  it('de strip leest echte polls en Approve/Decline', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toContain('homeLiveStand');
    expect(dash).toContain('codingSeatsHeartbeat');
    expect(dash).toContain('beslisAgentOk');
    expect(dash).toContain('GoedkeuringActie');
    expect(dash).toContain('No running tasks or missions right now');
    expect(dash).toContain('and ${n} more');
    expect(dash).not.toContain('truncate');
  });
});
