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
vi.mock('@/infrastructure/persistence/agentFeedbackService', () => ({
  openEpisode: (i: { agent: string; subject: string }) => {
    geopend.push(i);
    return Promise.resolve('ep-1');
  },
  closeEpisode: (id: string, verdict: string) => {
    gesloten.push({ id, verdict });
    return Promise.resolve(true);
  },
}));

import { noteRetrieval, noteTurnOutcome, loopAgentVoor } from './memoryFeedbackService';

/**
 * Wat de chat, de browser en de code-agent leren moet ergens landen.
 *
 * Ze legden hun beurten vast in localStorage -- per apparaat, en na 45 minuten
 * weg. applyAgentReinforcement leest alleen episodes uit Supabase, dus alles
 * wat ze leerden werd opgeschreven en daarna nergens voor gebruikt. Gemeten
 * 9 september: 1099 episodes, allemaal van trading, de rest nul.
 */
beforeEach(() => { store.clear(); geopend.length = 0; gesloten.length = 0; });

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
    for (const naam of ['chat', 'browser', 'code-editor', 'trading', 'research'] as const) {
      expect(loopAgentVoor(naam)).toBe(naam);
    }
  });
});
