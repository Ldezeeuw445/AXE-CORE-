import { describe, it, expect } from 'vitest';
import { AXE_AGENTS } from './roster';
import { AGENT_WORKSPACES, rosterZonderWorkspace, workspaceVoor } from './workspace';

describe('agent-werkplek', () => {
  it('elke roster-agent heeft een werkplek die de lus kan laden', () => {
    expect(rosterZonderWorkspace()).toEqual([]);
    for (const agent of AXE_AGENTS) {
      const ws = workspaceVoor(agent.id);
      expect(ws.agent).toBe(agent.id);
      expect(ws.role.length).toBeGreaterThan(2);
      expect(ws.systemPrompt.length).toBeGreaterThan(60);
      expect(ws.tools.includes('finish')).toBe(true);
      expect(['agent', 'task', 'global']).toContain(ws.memoryScope);
    }
  });

  it('wie een crew heeft, mag run_crew; NorthSea blijft zonder crew en zonder schrijven', () => {
    expect(AGENT_WORKSPACES.wingman.crew.length).toBeGreaterThan(0);
    expect(AGENT_WORKSPACES.wingman.tools).toContain('run_crew');
    expect(AGENT_WORKSPACES.trading.crew).toEqual(['dollar_bill', 'intel']);
    expect(AGENT_WORKSPACES.northsea.crew).toEqual([]);
    expect(AGENT_WORKSPACES.northsea.tools).not.toContain('write_file');
    expect(AGENT_WORKSPACES.northsea.tools).not.toContain('run_crew');
  });

  it('een onbekende agent heeft geen werkplek — de lus mag hem niet stilletjes als AXE draaien', () => {
    expect(() => workspaceVoor('ghost' as never)).toThrow(/no workspace/);
  });
});
