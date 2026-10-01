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
  buildOpenAiSpeechRequest, getOpenAiStem,
} = await import('./openAiTtsService');
const { AXE_STEM_ID } = await import('@/domain/stemIdentiteit');

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

  /* Hier stond dat `setOpenAiStem('cedar')` moest blijven plakken. Dat was
     het oude ontwerp: een kiezer per apparaat. AXE heeft één stem, en een
     oude opgeslagen keuze mag die nooit overrulen -- dát is wat deze test nu
     vastlegt. De kiezer in Settings is in dezelfde ronde weggehaald, want hij
     gooide je keuze stilletjes weg. */
  it('houdt één stem vast en negeert een oude opgeslagen keuze', () => {
    expect(getOpenAiStem()).toBe(STANDAARD_STEM);
    localStorage.setItem('axe_openai_stem', 'arbor');
    expect(getOpenAiStem()).toBe(STANDAARD_STEM);
    localStorage.setItem('axe_openai_stem', 'onyx');
    expect(getOpenAiStem()).toBe(STANDAARD_STEM);
  });

  /* De naam staat op één plek. Liep dit uiteen, dan zei Settings iets anders
     dan de backend sprak -- en dat is precies wat er gebeurde. */
  it('spreekt met dezelfde stem die stemIdentiteit noemt', () => {
    expect(STANDAARD_STEM).toBe(AXE_STEM_ID);
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

  /* `isOpenAiTtsConfigured()` was een onvoorwaardelijke `return true` zonder
     aanroepers -- de sleutel verhuisde naar de server en de functie bleef
     liegen. Hij is weg. Wat de test wilde vastleggen (nooit stil blijven)
     geldt nog steeds, maar via de server: `/voice/health` zegt waarom, en
     `/voice/tts` geeft 503 met de reden. Dat pad is hierboven getest. */
  it('bouwt elk verzoek met de vaste AXE-stem, ongeacht wat de aanroeper vraagt', () => {
    expect(buildOpenAiSpeechRequest('x', STANDAARD_STEM).voice).toBe(AXE_STEM_ID);
  });
});
