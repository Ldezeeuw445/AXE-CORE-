import { describe, it, expect, beforeEach } from 'vitest';
import { leesOverrides, zetOverride } from './agentEngineOverrides';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
  // window.dispatchEvent is also reached for by zetOverride().
  globalThis.window = { dispatchEvent: () => true } as unknown as Window & typeof globalThis;
});

describe('tier-2/tier-3 engine overrides', () => {

  it('begint leeg', () => {
    expect(leesOverrides()).toEqual({});
  });

  it('onthoudt een pin per agent', () => {
    zetOverride('browser', { provider: 'google', model: 'gemini-3.5-flash' });
    zetOverride('intel', { provider: 'openai', model: 'gpt-4o-mini' });
    expect(leesOverrides()).toEqual({
      browser: { provider: 'google', model: 'gemini-3.5-flash' },
      intel: { provider: 'openai', model: 'gpt-4o-mini' },
    });
  });

  it('een agent mag dezelfde provider delen met een andere -- geen uitsluiting', () => {
    zetOverride('browser', { provider: 'google', model: 'gemini-3.5-flash' });
    zetOverride('memory', { provider: 'google', model: 'gemini-3.5-flash' });
    expect(leesOverrides().browser).toEqual(leesOverrides().memory);
  });

  it('null haalt de pin weg (terug naar auto/geen keuze)', () => {
    zetOverride('cron', { provider: 'groq', model: 'openai/gpt-oss-120b' });
    zetOverride('cron', null);
    expect(leesOverrides().cron).toBeUndefined();
  });

  it('overleeft kapotte opslag', () => {
    localStorage.setItem('axe_agent_engine_overrides_v1', '{niet json');
    expect(leesOverrides()).toEqual({});
  });
});
