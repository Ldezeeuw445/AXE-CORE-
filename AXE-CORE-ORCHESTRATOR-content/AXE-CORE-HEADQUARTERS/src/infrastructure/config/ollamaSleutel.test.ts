import { describe, it, expect, beforeEach, vi } from 'vitest';

const opslag = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => { opslag.set(k, v); },
  removeItem: (k: string) => { opslag.delete(k); },
});

const { ollamaHeaders, isExterneOllama } = await import('./ollamaSleutel');

describe('de sleutel voor de Ollama-box', () => {
  beforeEach(() => opslag.clear());

  it('gaat alleen mee naar ollama.axecompanion.com', () => {
    opslag.set('axe_llm_connections', JSON.stringify({ ollama: { key: 'geheim' } }));
    expect(ollamaHeaders('https://ollama.axecompanion.com/api/tags')).toEqual({ Authorization: 'Bearer geheim' });
    expect(ollamaHeaders('http://localhost:11434')).toEqual({});
    expect(ollamaHeaders('https://api.axecompanion.com/proxy/ollama')).toEqual({});
    expect(isExterneOllama('https://ollama.axecompanion.com.kwaadaardig.nl')).toBe(false);
  });

  it('stuurt niets zonder ingevulde sleutel, en overleeft onzin', () => {
    expect(ollamaHeaders('https://ollama.axecompanion.com')).toEqual({});
    opslag.set('axe_llm_connections', 'kapot');
    expect(ollamaHeaders('https://ollama.axecompanion.com')).toEqual({});
    expect(ollamaHeaders('geen url')).toEqual({});
  });
});
