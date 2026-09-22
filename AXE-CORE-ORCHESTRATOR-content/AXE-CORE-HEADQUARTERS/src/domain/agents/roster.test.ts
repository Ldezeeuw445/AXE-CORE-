import { describe, it, expect } from 'vitest';
import { AXE_AGENTS, agentById, agentsByTier, delegateFor, type AxeAgentId } from './roster';

describe('AXE agent roster', () => {
  it('has AXE plus the tiered agents, AXE first', () => {
    // Was 13 (AXE + twelve) until 'apps' (App Manager) got a real action —
    // health-check/restart via axeCoreApiService.ts — the same day 'finance'
    // did. See roster.ts's 'apps' entry and LOOP_AGENTS in agentLoop.ts.
    expect(AXE_AGENTS).toHaveLength(14);
    expect(AXE_AGENTS[0].id).toBe('axe');
    const ids = AXE_AGENTS.map((a) => a.id).sort();
    expect(ids).toEqual([
      'apps', 'axe',
      'browser', 'companion', 'cron', 'developer', 'finance',
      'intel', 'memory', 'northsea', 'task', 'thinktank', 'trading', 'wingman',
    ]);
  });

  it('groups agents into the three confirmed tiers', () => {
    expect(agentsByTier('tier1').map((a) => a.id).sort())
      .toEqual(['developer', 'northsea', 'thinktank', 'trading', 'wingman']);
    expect(agentsByTier('tier2').map((a) => a.id).sort())
      .toEqual(['apps', 'browser', 'cron', 'finance', 'memory', 'task']);
    expect(agentsByTier('tier3').map((a) => a.id).sort())
      .toEqual(['companion', 'intel']);
  });

  it('gives each tier the dropdown scope Luka confirmed', () => {
    expect(AXE_AGENTS.find((a) => a.id === 'axe')?.dropdownScope).toBe('fast-smart');
    for (const a of agentsByTier('tier1')) expect(a.dropdownScope).toBe('subscription');
    for (const a of agentsByTier('tier2')) expect(a.dropdownScope).toBe('auto-route');
    for (const a of agentsByTier('tier3')) expect(a.dropdownScope).toBe('paid-api');
  });

  it('resolves ids and falls back to AXE for the unknown', () => {
    expect(agentById('wingman').name).toBe('Wingman');
    expect(agentById('nope' as AxeAgentId).id).toBe('axe');
  });

  describe('delegateFor', () => {
    it('sends real code work to the AXE Developer agent', () => {
      expect(delegateFor('code', 'fix the bug in voiceStore').agent).toBe('developer');
    });

    it('keeps plain conversation with AXE', () => {
      expect(delegateFor('fast', 'hey, how are you today?').agent).toBe('axe');
    });

    it('delegates on a single clear domain signal', () => {
      expect(delegateFor('fast', 'what is my open MT5 position?').agent).toBe('trading');
      expect(delegateFor('fast', 'draft outreach to the copper supplier').agent).toBe('northsea');
      expect(delegateFor('fast', 'how many credits are left on my subscription?').agent).toBe('finance');
      expect(delegateFor('fast', 'run a marketing crew for the launch').agent).toBe('wingman');
      expect(delegateFor('fast', 'score this thinktank idea for me').agent).toBe('thinktank');
      expect(delegateFor('fast', 'open the url and scrape the pricing page').agent).toBe('browser');
      expect(delegateFor('fast', 'the cron manager should run this hourly').agent).toBe('cron');
      expect(delegateFor('fast', 'is axe core up right now?').agent).toBe('apps');
      expect(delegateFor('fast', 'restart the api on the vps').agent).toBe('apps');
    });

    it('holds ambiguous multi-domain work with AXE rather than mis-routing', () => {
      // trading + finance signals together → AXE keeps it.
      expect(delegateFor('fast', 'compare the trading budget against subscription spend').agent).toBe('axe');
    });
  });
});
