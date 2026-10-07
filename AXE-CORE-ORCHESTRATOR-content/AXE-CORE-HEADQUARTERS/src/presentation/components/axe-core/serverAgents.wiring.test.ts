/**
 * Home leest de server-status echt in (val 2 uit AGENTS.md: een geteste
 * functie bewijst niet dat iemand hem aanroept). De regel zelf staat in
 * domain/agents/serverStatus.test.ts; hier staat dat de kolom en het venster
 * hem gebruiken, en dat "idle" alleen nog verschijnt als de server zwijgt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const bron = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe('Home toont de server-status', () => {
  it('de kolom pollt /agents/activity en geeft elke rij zijn server-agent', () => {
    const t = bron('AgentVensters.tsx');
    expect(t).toContain('useServerAgents()');
    expect(t).toContain('server={server.agents[rij.agent.id]}');
    expect(t).toContain("serverStand ? serverStand.label : 'idle'");
  });

  it('het venster toont missie, computer en tijdlijn, en kan pauzeren/hervatten', () => {
    const t = bron('ManagerChat.tsx');
    expect(t).toContain('server.dax_computer');
    expect(t).toContain('server.events.slice(0, 6)');
    expect(t).toContain("pauzeerbaar ? 'pause' : 'resume'");
    expect(bron('AgentVensters.tsx')).toMatch(/pauseMission\(id\) : resumeMission\(id\)/);
  });

  it('de poll gaat naar de echte endpoint', () => {
    expect(bron('useServerAgents.ts')).toContain('getAgentActivity(');
    expect(bron('../../../infrastructure/gateways/axeCoreApiService.ts')).toContain('`/agents/activity?events=');
  });
});
