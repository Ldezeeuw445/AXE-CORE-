import { describe, expect, it } from 'vitest';
import { agentTierRegel, agentTierRij, type AgentTierKaart } from './agentTiers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const kaart: AgentTierKaart = {
  agents: {
    developer: { kind: 'main', tier: 1, model: 'claude opus/sonnet via Mac-stoel; codex gpt-5-codex tweede', seat_family: 'claude' },
    northsea: { kind: 'main', tier: 2, model: 'groq + claude-sonnet seat', seat_family: 'claude' },
    cron: { kind: 'main', tier: 3, model: 'groq / cerebras / ollama', seat_family: null },
  },
};

describe('agentTierRegel', () => {
  it('zet tier en model op één regel', () => {
    expect(agentTierRegel(kaart, 'developer')).toMatch(/^T1 · claude opus/);
    expect(agentTierRegel(kaart, 'northsea')).toBe('T2 · groq + claude-sonnet seat');
    expect(agentTierRegel(kaart, 'cron')).toBe('T3 · groq / cerebras / ollama');
    expect(agentTierRegel(kaart, 'onbekend')).toBe('');
    expect(agentTierRij(kaart, 'cron')?.seat_family).toBeNull();
  });
});

describe('Home leest GET /agent-tiers', () => {
  it('de poll en de rail gebruiken dezelfde endpoint', () => {
    const hq = join(__dirname, '../../');
    const api = readFileSync(join(hq, 'infrastructure/gateways/axeCoreApiService.ts'), 'utf8');
    expect(api).toContain("'/agent-tiers'");
    const poll = readFileSync(join(hq, 'presentation/components/axe-core/useServerAgents.ts'), 'utf8');
    expect(poll).toContain('listAgentTiers');
    const vensters = readFileSync(join(hq, 'presentation/components/axe-core/AgentVensters.tsx'), 'utf8');
    expect(vensters).toContain('agentTierRegel');
    const chat = readFileSync(join(hq, 'presentation/components/axe-core/ManagerChat.tsx'), 'utf8');
    expect(chat).toContain('tierRegel');
  });
});
