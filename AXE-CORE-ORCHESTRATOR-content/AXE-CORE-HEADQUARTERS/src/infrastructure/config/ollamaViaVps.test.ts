import { describe, it, expect, beforeEach, vi } from 'vitest';

const opslag = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => { opslag.set(k, v); },
  removeItem: (k: string) => { opslag.delete(k); },
});
// De AXE-sleutel zoals de Android-schil hem geeft; per test aan of uit.
let axeSleutel: string | null = null;
vi.stubGlobal('window', { __AXE_ANDROID__: { axeCoreApiKey: () => axeSleutel } });

const { ollamaUrl, ollamaHeaders, OLLAMA_VIA_VPS } = await import('./ollamaSleutel');
const { heeftModel } = await import('@/application/system/vpsProviderMeting');

describe('de modelbox zonder sleutel op het toestel (30 okt)', () => {
  beforeEach(() => { opslag.clear(); axeSleutel = null; });

  it('gaat via de VPS als dit toestel de AXE-sleutel heeft maar geen Ollama-sleutel', () => {
    axeSleutel = 'axe-sleutel';
    expect(ollamaUrl('https://ollama.axecompanion.com')).toBe(OLLAMA_VIA_VPS);
    expect(ollamaUrl('https://ollama.axecompanion.com/api/chat')).toBe(`${OLLAMA_VIA_VPS}/api/chat`);
    expect(ollamaUrl('https://ollama.axecompanion.com/v1/chat/completions?x=1')).toBe(`${OLLAMA_VIA_VPS}/v1/chat/completions?x=1`);
    // En daar gaat de AXE-sleutel mee, nooit een Ollama-sleutel.
    expect(ollamaHeaders(`${OLLAMA_VIA_VPS}/api/tags`)).toEqual({ Authorization: 'Bearer axe-sleutel' });
    expect(ollamaHeaders(OLLAMA_VIA_VPS)).toEqual({ Authorization: 'Bearer axe-sleutel' });
  });

  it('een eigen Ollama-sleutel blijft rechtstreeks gaan, zoals voorheen', () => {
    axeSleutel = 'axe-sleutel';
    opslag.set('axe_llm_connections', JSON.stringify({ ollama: { key: 'box-sleutel' } }));
    expect(ollamaUrl('https://ollama.axecompanion.com/api/chat')).toBe('https://ollama.axecompanion.com/api/chat');
    expect(ollamaHeaders('https://ollama.axecompanion.com/api/chat')).toEqual({ Authorization: 'Bearer box-sleutel' });
  });

  it('zonder AXE-sleutel (de webapp) verandert er niets', () => {
    expect(ollamaUrl('https://ollama.axecompanion.com/api/chat')).toBe('https://ollama.axecompanion.com/api/chat');
  });

  it('andere adressen blijven waar ze zijn', () => {
    axeSleutel = 'axe-sleutel';
    for (const url of ['http://localhost:11434/api/chat', 'https://api.openai.com/v1/chat/completions', `${OLLAMA_VIA_VPS}/api/tags`]) {
      expect(ollamaUrl(url)).toBe(url);
    }
    expect(ollamaHeaders('https://api.openai.com/v1')).toEqual({});
  });
});

describe('heeftModel', () => {
  it('kent :latest en hoofdletters, en zonder model telt elk model', () => {
    expect(heeftModel(['hermes3:8b', 'gemma4:latest'], 'Hermes3:8b')).toBe(true);
    expect(heeftModel(['gemma4:latest'], 'gemma4')).toBe(true);
    expect(heeftModel(['gemma4'], 'gemma4:latest')).toBe(true);
    expect(heeftModel(['gemma4:latest'], 'hermes3:8b')).toBe(false);
    expect(heeftModel(['x'], '')).toBe(true);
    expect(heeftModel([], '')).toBe(false);
  });
});

/* Elke plek die de box via ollamaHeaders aanspreekt, kiest ook de weg via ollamaUrl.
   Anders wordt hij de plek die als enige nog rood staat op een toestel zonder sleutel. */
describe('elke aanroep naar de box kiest zijn weg', () => {
  it('geen bestand gebruikt ollamaHeaders zonder ollamaUrl', async () => {
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const bestanden: string[] = [];
    const loop = (map: string) => {
      for (const naam of readdirSync(map)) {
        const pad = join(map, naam);
        if (statSync(pad).isDirectory()) loop(pad);
        else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) bestanden.push(pad);
      }
    };
    loop('src');
    const zonderWeg = bestanden.filter((pad) => {
      if (pad.includes('ollamaSleutel') || pad.includes('embeddingService')) return false;
      const bron = readFileSync(pad, 'utf8');
      return bron.includes('ollamaHeaders(') && !bron.includes('ollamaUrl(');
    });
    expect(zonderWeg).toEqual([]);
  });
});
