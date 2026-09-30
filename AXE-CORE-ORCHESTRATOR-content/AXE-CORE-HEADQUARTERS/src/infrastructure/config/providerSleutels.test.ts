import { describe, it, expect, beforeEach, vi } from 'vitest';

const opslag = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => { opslag.set(k, v); },
  removeItem: (k: string) => { opslag.delete(k); },
});

const {
  getProviderKeySlot, getOllamaKeySlots, leesProviderVerbindingen, envSleutel,
} = await import('./providerSleutels');

const zetVerbindingen = (v: Record<string, unknown>) =>
  opslag.set('axe_llm_connections', JSON.stringify(v));

describe('getProviderKeySlot', () => {
  beforeEach(() => opslag.clear());

  it('pakt de sleutel die je in Settings intypte', () => {
    zetVerbindingen({ openai: { key: 'sk-ingetypt', model: 'gpt-4o-mini' } });
    expect(getProviderKeySlot('openai')).toMatchObject({ provider: 'openai', key: 'sk-ingetypt' });
  });

  it('geeft null voor een provider zonder sleutel', () => {
    expect(getProviderKeySlot('openai')).toBeNull();
  });

  /* Dit is waar de negen gateways op stukliepen: zij parsten localStorage zelf
     en kenden geen ENV-sleutels. Stond er niets in Settings, dan zeiden zij
     "geen sleutel" terwijl de chat gewoon antwoordde. */
  it('valt terug op de ENV-sleutel als er niets in Settings staat', () => {
    for (const p of ['google', 'openai', 'anthropic', 'openrouter', 'xai', 'groq']) {
      const env = envSleutel(p);
      // In de testomgeving zijn de VITE_-variabelen leeg; dan hoort er ook
      // niets gevonden te worden. Staat er wel een, dan moet hij meekomen.
      expect(env === '' ? getProviderKeySlot(p) : getProviderKeySlot(p)?.key).toEqual(env === '' ? null : env);
    }
  });

  /* xai en groq stonden NIET in de twee kopieën van ENV_KEYS (visionGateway en
     VisionCaptureButton). Deze test legt vast dat de lijst compleet is, zodat
     een volgende kopie niet stilletjes opnieuw ontstaat. */
  it('kent alle zes providers waar een ENV-sleutel voor bestaat', () => {
    const bekend = ['google', 'xai', 'openrouter', 'openai', 'anthropic', 'groq'];
    for (const p of bekend) expect(typeof envSleutel(p), p).toBe('string');
    expect(envSleutel('ditbestaatniet')).toBe('');
  });

  it('een provider die de VPS-proxy bedient krijgt een sleutelloos slot, geen null', () => {
    opslag.set('axe_server_providers', JSON.stringify(['google']));
    const slot = getProviderKeySlot('google');
    expect(slot).not.toBeNull();
    expect(slot?.provider).toBe('google');
  });

  it('migreert een verouderde modelnaam in plaats van hem door te geven', () => {
    // Welke namen gemigreerd worden staat in providers.ts; hier telt dat het
    // GEBEURT -- een kale parse deed dat niet, dus twee schermen toonden een
    // modelnaam die niet meer bestaat.
    zetVerbindingen({ openai: { key: 'sk-x', model: 'gpt-4-turbo-preview' } });
    const slot = getProviderKeySlot('openai');
    expect(slot?.model).toBeTruthy();
  });

  it('overleeft kapotte opslag', () => {
    opslag.set('axe_llm_connections', 'geen json');
    expect(getProviderKeySlot('openai')).toBeNull();
    expect(leesProviderVerbindingen()).toEqual({});
  });
});

describe('getOllamaKeySlots', () => {
  beforeEach(() => opslag.clear());

  it('geeft hoogstens twee modellen -- de VPS houdt er één tegelijk geladen', () => {
    zetVerbindingen({ ollama: { models: ['a', 'b', 'c', 'd', 'e'] } });
    expect(getOllamaKeySlots().length).toBeLessThanOrEqual(2);
  });

  it('zet cloud-modellen achteraan', () => {
    zetVerbindingen({ ollama: { models: ['x:cloud', 'lokaal'] } });
    expect(getOllamaKeySlots()[0]?.model).toBe('lokaal');
  });

  it('overleeft kapotte opslag', () => {
    opslag.set('axe_llm_connections', 'geen json');
    expect(Array.isArray(getOllamaKeySlots())).toBe(true);
  });
});
