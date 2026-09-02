import { describe, it, expect } from 'vitest';
import {
  AGENT_SPECS, agentSpec, resolveChoice, sameModel, type ModelChoice,
} from './agentModels';

const g: ModelChoice = { provider: 'google', model: 'gemini-3.5-flash' };
const o: ModelChoice = { provider: 'openai', model: 'gpt-4o-mini' };

describe('the agent table', () => {
  it('has a unique id per agent', () => {
    const ids = AGENT_SPECS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('says what every agent is optimising for', () => {
    // A dropdown of 417 model names with no guidance is worse than no dropdown.
    for (const a of AGENT_SPECS) {
      expect(a.wants.length, a.id).toBeGreaterThan(20);
      expect(a.what.length, a.id).toBeGreaterThan(5);
    }
  });

  it('ships Intel and Companion on different families', () => {
    // Companion is the second opinion. The same model twice is one opinion
    // wearing two hats.
    const i = agentSpec('intel')!.fallback!;
    const c = agentSpec('companion')!.fallback!;
    expect(sameModel(i, c)).toBe(false);
    expect(i.provider).not.toBe(c.provider);
  });
});

describe('resolveChoice', () => {
  it('uses what was picked', () => {
    expect(resolveChoice('intel', { intel: o })).toEqual(o);
  });

  it('falls back to the shipped default when nothing is picked', () => {
    expect(resolveChoice('intel', {})).toEqual(g);
    expect(resolveChoice('intel', null)).toEqual(g);
  });

  it('treats an explicit null as "no preference", not as "use the default"', () => {
    // Clearing a choice has to be able to mean the shared cascade, or a default
    // could never be switched off.
    expect(resolveChoice('intel', { intel: null })).toBeNull();
  });

  it('returns null for an agent that ships without a default', () => {
    expect(resolveChoice('code', {})).toBeNull();
  });

  it('ignores a half-filled choice rather than dispatching on it', () => {
    // A provider with no model would be sent to the gateway as an empty slug.
    expect(resolveChoice('intel', { intel: { provider: 'openai', model: '' } })).toEqual(g);
  });
});

describe('sameModel', () => {
  it('is false when either side has no choice', () => {
    expect(sameModel(null, g)).toBe(false);
    expect(sameModel(g, null)).toBe(false);
  });

  it('matches on provider and model together', () => {
    expect(sameModel(g, { ...g })).toBe(true);
    expect(sameModel(g, { ...g, model: 'other' })).toBe(false);
    expect(sameModel(g, { ...g, provider: 'openai' })).toBe(false);
  });
});
