import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
});

const geopend: Array<{ agent: string; subject: string; memoryIds?: string[]; memoryKeys?: string[] }> = [];
const gesloten: Array<{ id: string; verdict: string }> = [];
let episodeSeq = 0;
let openGeeft: string | null | 'throw' = 'id';
vi.mock('@/infrastructure/persistence/agentFeedbackService', () => ({
  openEpisode: (i: { agent: string; subject: string; memoryIds?: string[]; memoryKeys?: string[] }) => {
    geopend.push(i);
    if (openGeeft === 'throw') return Promise.reject(new Error('offline'));
    if (openGeeft === null) return Promise.resolve(null);
    episodeSeq += 1;
    return Promise.resolve(`ep-${episodeSeq}`);
  },
  closeEpisode: (id: string, verdict: string) => {
    gesloten.push({ id, verdict });
    return Promise.resolve(true);
  },
}));

import {
  noteRetrieval, noteTurnOutcome, noteTurnOutcomeByQuery, noteOwnerOutcome,
  loopAgentVoor, wisUitgesteldOordeel, latestOpenTurnId,
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
  openGeeft = 'id';
  wisUitgesteldOordeel();
});

async function wachtOpEpisode(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('een beurt legt ook een episode vast', () => {
  it('opent er een voor een agent die de lus kent', async () => {
    noteRetrieval('waar staat mijn sleutel', ['m1'], ['k1'], 'chat');
    await wachtOpEpisode();
    expect(geopend).toHaveLength(1);
    expect(geopend[0].agent).toBe('chat');
    expect(geopend[0].subject).toBe('waar staat mijn sleutel');
    expect(geopend[0].memoryIds).toEqual(['m1']);
    expect(geopend[0].memoryKeys).toEqual(['k1']);
  });

  it('opent er ook een zonder herinneringen', async () => {
    // Anders blijft een chatbericht onzichtbaar wanneer RAG niets teruggeeft.
    noteRetrieval('hoi, hoe gaat het', [], [], 'chat');
    await wachtOpEpisode();
    expect(geopend).toHaveLength(1);
    expect(geopend[0].agent).toBe('chat');
    expect(geopend[0].memoryIds).toEqual([]);
  });

  it('sluit hem met dezelfde uitslag', async () => {
    const id = noteRetrieval('iets', ['m1'], [], 'browser');
    await wachtOpEpisode();
    noteTurnOutcome(id, 'good');
    expect(gesloten).toEqual([{ id: 'ep-1', verdict: 'good' }]);
  });

  it('sluit hem ook als het oordeel er is vóór het episode-id', async () => {
    // openEpisode is async; het chatantwoord is synchroon. Zonder deze
    // koppeling blijft de episode op unknown staan -- gemeten: 2 chat-rijen,
    // 0 gesloten.
    const id = noteRetrieval('iets', ['m1'], [], 'chat');
    noteTurnOutcome(id, 'good');
    expect(gesloten).toHaveLength(0);
    await wachtOpEpisode();
    expect(gesloten).toEqual([{ id: 'ep-1', verdict: 'good' }]);
  });

  it('sluit hem ook als het oordeel er is vóór het ophalen', async () => {
    // voiceStore geeft geheugen 500ms; het antwoord wint die race vaak.
    noteOwnerOutcome('global', 'good');
    expect(latestOpenTurnId('global')).toBeNull();
    noteRetrieval('dezelfde vraag na het antwoord', ['m1'], [], 'global');
    await wachtOpEpisode();
    expect(gesloten).toEqual([{ id: 'ep-1', verdict: 'good' }]);
  });

  it('blijft de beurt zelf werken als openEpisode null geeft', async () => {
    openGeeft = null;
    const id = noteRetrieval('offline of geen sessie', ['m1'], [], 'chat');
    await wachtOpEpisode();
    expect(() => noteTurnOutcome(id, 'good')).not.toThrow();
    expect(gesloten).toHaveLength(0);
    expect(latestOpenTurnId('chat')).toBeNull();
    const raw = JSON.parse(store.get('axe_memory_feedback_v1') || '[]');
    expect(raw[0].verdict).toBe('good');
    expect(raw[0].episodeId).toBeUndefined();
  });

  it('blijft de beurt zelf werken als openEpisode gooit', async () => {
    openGeeft = 'throw';
    const id = noteRetrieval('netwerk weg', ['m1'], [], 'browser');
    await wachtOpEpisode();
    expect(() => noteTurnOutcome(id, 'poor')).not.toThrow();
    expect(gesloten).toHaveLength(0);
    const raw = JSON.parse(store.get('axe_memory_feedback_v1') || '[]');
    expect(raw[0].verdict).toBe('poor');
  });

  it('sluit ook de duurzame episode wanneer de latere review op vraagtekst oordeelt', async () => {
    noteRetrieval('dezelfde concrete vraag voor review', ['m1'], [], 'global');
    await wachtOpEpisode();

    expect(noteTurnOutcomeByQuery('dezelfde concrete vraag voor review', 'good')).toBe(1);
    expect(gesloten).toEqual([{ id: 'ep-1', verdict: 'good' }]);
  });

  it('sluit bij herhaalde vraag alleen de nog openstaande episode', async () => {
    const eerste = noteRetrieval('herhaalde concrete vraag', ['m1'], [], 'global');
    await wachtOpEpisode();
    noteTurnOutcome(eerste, 'poor');

    noteRetrieval('herhaalde concrete vraag', ['m2'], [], 'global');
    await wachtOpEpisode();
    expect(noteTurnOutcomeByQuery('herhaalde concrete vraag', 'good')).toBe(1);

    expect(gesloten).toEqual([
      { id: 'ep-1', verdict: 'poor' },
      { id: 'ep-2', verdict: 'good' },
    ]);
  });

  it('opent er GEEN zonder eigenaar', async () => {
    // Een episode met een verzonnen agent vervuilt de tellingen.
    noteRetrieval('iets', ['m1'], []);
    await wachtOpEpisode();
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
    expect(loopAgentVoor('axe_core')).toBe('chat');
    expect(loopAgentVoor('axe_algo')).toBe('trading');
    expect(loopAgentVoor('code_agent')).toBe('code-editor');
    expect(loopAgentVoor('browser_agent')).toBe('browser');
    expect(loopAgentVoor('crewai_manager')).toBe('wingman');
  });
});
