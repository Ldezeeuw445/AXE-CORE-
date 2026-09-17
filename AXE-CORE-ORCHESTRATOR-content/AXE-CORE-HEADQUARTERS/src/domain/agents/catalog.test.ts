import { describe, it, expect } from 'vitest';
import { AGENT_CATALOG, namespaceFor, agentsByKind } from './catalog';

describe('agent catalog (the one force)', () => {
  it('has the six core agents and the eight crew specialists', () => {
    expect(agentsByKind('core').map((a) => a.id).sort())
      .toEqual(['axe', 'code', 'finance', 'northsea', 'trading', 'wingman']);
    // nine specialists minus axe_core (which IS the core orchestrator) = eight
    expect(agentsByKind('crew')).toHaveLength(8);
    expect(agentsByKind('crew').some((a) => a.id === 'axe_core')).toBe(false);
  });

  it('marks Trading OS as an app, not an agent', () => {
    const tos = AGENT_CATALOG.find((a) => a.id === 'trading-os');
    expect(tos?.kind).toBe('app');
    expect(tos?.namespace).toBe(''); // an app has no agent memory of its own
  });

  it('gives every agent (not app) a memory namespace, and AXE the global layer', () => {
    for (const a of AGENT_CATALOG) {
      if (a.kind === 'app') continue;
      expect(a.namespace.length).toBeGreaterThan(0);
    }
    expect(namespaceFor('axe')).toBe('global');
    expect(namespaceFor('trading')).toBe('axe_trader');
  });

  it('never collides two agents onto the same namespace (except the shared global for AXE)', () => {
    const ns = AGENT_CATALOG.filter((a) => a.namespace && a.namespace !== 'global').map((a) => a.namespace);
    expect(new Set(ns).size).toBe(ns.length);
  });

  it('falls back to global for an unknown id', () => {
    expect(namespaceFor('does-not-exist')).toBe('global');
  });
});
