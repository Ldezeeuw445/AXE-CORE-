import { beforeEach, describe, expect, it, vi } from 'vitest';

// Node-omgeving zonder DOM, zoals de rest van deze testsuite: een geheugen-shim
// is genoeg en scheelt jsdom voor één bestand.
const geheugen = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => geheugen.get(k) ?? null,
  setItem: (k: string, v: string) => { geheugen.set(k, v); },
  removeItem: (k: string) => { geheugen.delete(k); },
  clear: () => geheugen.clear(),
});

const {
  OPENAI_STEMMEN, STANDAARD_STEM, AXE_SPEECH_INSTRUCTIONS,
  buildOpenAiSpeechRequest, getOpenAiStem, isOpenAiTtsConfigured, setOpenAiStem,
} = await import('./openAiTtsService');

beforeEach(() => geheugen.clear());

describe('OpenAI-stemmen', () => {
  it('voert de API-lijst en NIET de app-stemmen van ChatGPT', () => {
    // Arbor en gezelschap zijn app-only. Ze hier aanbieden zou een stem beloven
    // die met een sleutel nooit op te halen is.
    for (const app of ['arbor', 'breeze', 'juniper', 'cove', 'ember']) {
      expect(OPENAI_STEMMEN).not.toContain(app);
    }
    expect(OPENAI_STEMMEN).toContain('marin');
    expect(OPENAI_STEMMEN).toContain('cedar');
  });

  it('valt terug op OpenAI\'s eigen aanbeveling en weigert onzin', () => {
    expect(getOpenAiStem()).toBe(STANDAARD_STEM);
    localStorage.setItem('axe_openai_stem', 'arbor');
    expect(getOpenAiStem()).toBe(STANDAARD_STEM);
    setOpenAiStem('cedar');
    expect(getOpenAiStem()).toBe('cedar');
  });

  it('stuurt de vaste rustige AXE-cadans mee naar gpt-4o-mini-tts', () => {
    const req = buildOpenAiSpeechRequest('Goedemorgen.', 'cedar');
    expect(req).toMatchObject({
      model: 'gpt-4o-mini-tts',
      voice: 'cedar',
      input: 'Goedemorgen.',
      instructions: AXE_SPEECH_INSTRUCTIONS,
      response_format: 'mp3',
    });
    expect(AXE_SPEECH_INSTRUCTIONS).toContain('calm');
    expect(AXE_SPEECH_INSTRUCTIONS).toContain('moderately slow');
    expect(AXE_SPEECH_INSTRUCTIONS).toContain('Avoid announcer cadence');
  });

  it('zonder sleutel meldt hij dat, in plaats van stil te blijven', () => {
    expect(isOpenAiTtsConfigured()).toBe(false);
    localStorage.setItem('axe_llm_connections', JSON.stringify({ openai: { key: 'sk-test' } }));
    expect(isOpenAiTtsConfigured()).toBe(true);
  });
});
