import { describe, it, expect } from 'vitest';
import { AXE_AGENTS, agentById, delegateFor, type AxeAgentId } from './roster';

describe('AXE agent roster', () => {
  it('has exactly the six agents, AXE first', () => {
    expect(AXE_AGENTS).toHaveLength(6);
    expect(AXE_AGENTS[0].id).toBe('axe');
    const ids = AXE_AGENTS.map((a) => a.id).sort();
    expect(ids).toEqual(['axe', 'code', 'finance', 'northsea', 'trading', 'wingman']);
  });

  it('resolves ids and falls back to AXE for the unknown', () => {
    expect(agentById('wingman').name).toBe('Wingman');
    expect(agentById('nope' as AxeAgentId).id).toBe('axe');
  });

  describe('delegateFor', () => {
    it('sends real code work to the Code agent', () => {
      expect(delegateFor('code', 'fix the bug in voiceStore').agent).toBe('code');
    });

    it('keeps plain conversation with AXE', () => {
      expect(delegateFor('fast', 'hey, how are you today?').agent).toBe('axe');
    });

    it('delegates on a single clear domain signal', () => {
      expect(delegateFor('fast', 'what is my open MT5 position?').agent).toBe('trading');
      expect(delegateFor('fast', 'draft outreach to the copper supplier').agent).toBe('northsea');
      expect(delegateFor('fast', 'how many credits are left on my subscription?').agent).toBe('finance');
      expect(delegateFor('fast', 'run a marketing crew for the launch').agent).toBe('wingman');
    });

    it('holds ambiguous multi-domain work with AXE rather than mis-routing', () => {
      // trading + finance signals together → AXE keeps it.
      expect(delegateFor('fast', 'compare the trading budget against subscription spend').agent).toBe('axe');
    });
  });
});
