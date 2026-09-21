import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
});

const geopend: Array<{ agent: string; subject: string }> = [];
const gesloten: Array<{ id: string; verdict: string }> = [];
let episodeSeq = 0;
vi.mock('@/infrastructure/persistence/agentFeedbackService', () => ({
  openEpisode: (i: { agent: string; subject: string }) => {
    geopend.push(i);
    episodeSeq += 1;
    return Promise.resolve(`ep-${episodeSeq}`);
  },
  closeEpisode: (id: string, verdict: string) => {
    gesloten.push({ id, verdict });
    return Promise.resolve(true);
  },
}));

import {
  noteRetrieval, noteTurnOutcome, noteTurnOutcomeByQuery, loopAgentVoor,
} from './memoryFeedbackService';

/**
 * Wat de chat, de browser en de code-agent leren moet ergens landen.
 *
 * Ze legden hun beurten vast in localStorage -- per apparaat, en na 45 minuten
 * weg. applyAgentReinforcement leest alleen episodes uit Supabase, dus alles
 * wat ze leerden werd opgeschreven en daarna nergens voor gebruikt. Gemeten
 * 9 september: 1099 episodes, allemaal van trading, de rest nul.
 */
beforeEach(() => {
  store.clear();
  geopend.length = 0;
  gesloten.length = 0;
  episodeSeq = 0;
});

describe('een beurt legt ook een episode vast', () => {
  it('opent er een voor een agent die de lus kent', async () => {
    noteRetrieval('waar staat mijn sleutel', ['m1'], ['k1'], 'chat');
    await Promise.resolve();
    expect(geopend).toHaveLength(1);
    expect(geopend[0].agent).toBe('chat');
    expect(geopend[0].subject).toBe('waar staat mijn sleutel');
  });

  it('sluit hem met dezelfde uitslag', async () => {
    const id = noteRetrieval('iets', ['m1'], [], 'browser');
    await Promise.resolve(); await Promise.resolve();
    noteTurnOutcome(id, 'good');
    expect(gesloten).toEqual([{ id: 'ep-1', verdict: 'good' }]);
  });

  it('sluit ook de duurzame episode wanneer de latere review op vraagtekst oordeelt', async () => {
    noteRetrieval('dezelfde concrete vraag voor review', ['m1'], [], 'global');
    await Promise.resolve(); await Promise.resolve();

    expect(noteTurnOutcomeByQuery('dezelfde concrete vraag voor review', 'good')).toBe(1);
    expect(gesloten).toEqual([{ id: 'ep-1', verdict: 'good' }]);
  });

  it('sluit bij herhaalde vraag alleen de nog openstaande episode', async () => {
    const eerste = noteRetrieval('herhaalde concrete vraag', ['m1'], [], 'global');
    await Promise.resolve(); await Promise.resolve();
    noteTurnOutcome(eerste, 'poor');

    noteRetrieval('herhaalde concrete vraag', ['m2'], [], 'global');
    await Promise.resolve(); await Promise.resolve();
    expect(noteTurnOutcomeByQuery('herhaalde concrete vraag', 'good')).toBe(1);

    expect(gesloten).toEqual([
      { id: 'ep-1', verdict: 'poor' },
      { id: 'ep-2', verdict: 'good' },
    ]);
  });

  it('opent er GEEN zonder eigenaar', async () => {
    // Een episode met een verzonnen agent vervuilt de tellingen.
    noteRetrieval('iets', ['m1'], []);
    await Promise.resolve();
    expect(geopend).toHaveLength(0);
  });
});

describe('welke agent hoort bij welke eigenaar', () => {
  it('local-code valt onder code-editor', () => {
    // Dezelfde agent, alleen het lokale model. Ze delen wat ze leren.
    expect(loopAgentVoor('local-code')).toBe('code-editor');
  });

  it('een onbekende eigenaar geeft niets', () => {
    expect(loopAgentVoor('agentic')).toBeNull();
    expect(loopAgentVoor(undefined)).toBeNull();
  });

  it('de bekende namen komen ongewijzigd terug', () => {
    for (const naam of ['chat', 'browser', 'code-editor', 'trading', 'research', 'intel', 'companion'] as const) {
      expect(loopAgentVoor(naam)).toBe(naam);
    }
  });

  it('vertaalt de namespaces die de actuele router werkelijk doorgeeft', () => {
    expect(loopAgentVoor('global')).toBe('chat');
    expect(loopAgentVoor('axe_trader')).toBe('trading');
    expect(loopAgentVoor('axe_intel')).toBe('intel');
    expect(loopAgentVoor('axe_companion')).toBe('companion');
    expect(loopAgentVoor('axe_browser')).toBe('browser');
  });
});
