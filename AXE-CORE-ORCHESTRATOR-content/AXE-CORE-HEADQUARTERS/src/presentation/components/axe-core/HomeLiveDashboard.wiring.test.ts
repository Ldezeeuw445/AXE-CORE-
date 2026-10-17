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
  });

  it('de strip leest echte polls en Approve/Decline', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toContain('homeLiveStand');
    expect(dash).toContain('codingSeatsHeartbeat');
    expect(dash).toContain('beslisAgentOk');
    expect(dash).toContain('GoedkeuringActie');
    expect(dash).toContain('No running tasks or missions right now');
  });
});
