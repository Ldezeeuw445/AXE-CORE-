/**
 * "De lus draait" is een getal dat je moet geloven zolang je niet kunt zien
 * WAT er in een beslissing ging.
 *
 * De ids stonden er al; de inhoud erbij zoeken is het enige dat ontbrak. Waar
 * het bij zoiets misgaat is niet het gelukkige pad maar het ongelukkige: een
 * database die er niet is, of een query die faalt. Komt dat terug als lege
 * inhoud, dan leest een beurt met vijf herinneringen als een beurt waarin
 * alles verdwenen is -- een geldig ogend, leeg antwoord. Daar gaan de meeste
 * tests hieronder over.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let supabaseImpl: unknown = null;
const getSupabase = vi.fn(() => supabaseImpl);
vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ getSupabase }));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
});

const { noteRetrieval, noteTurnOutcome, turnDossiers } = await import('./memoryFeedbackService');

/** Een client die precies de rijen teruggeeft die hij kent. */
function clientMet(rijen: Array<{ id: string; content: string; importance: number | null }>) {
  return {
    from: () => ({
      select: () => ({
        in: (_kolom: string, ids: string[]) => Promise.resolve({
          data: rijen.filter(r => ids.includes(r.id)),
          error: null,
        }),
      }),
    }),
  };
}

/** Een client waarvan de query stukloopt. */
function stukkeClient() {
  return {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
      }),
    }),
  };
}

beforeEach(() => {
  localStorage.clear();
  supabaseImpl = null;
  getSupabase.mockClear();
});

describe('wat ging er in een beslissing, en wat is ermee gebeurd', () => {
  it('geeft de vraag, de eigenaar en de inhoud van elke herinnering terug', async () => {
    supabaseImpl = clientMet([
      { id: 'm1', content: 'de sleutel staat in 1Password', importance: 7 },
      { id: 'm2', content: 'Luka werkt met vier sessies tegelijk', importance: 4 },
    ]);
    const id = noteRetrieval('waar staat mijn sleutel', ['m1', 'm2'], [], 'browser');
    noteTurnOutcome(id, 'good');

    const [beurt] = await turnDossiers();

    expect(beurt.owner).toBe('browser');
    expect(beurt.query).toBe('waar staat mijn sleutel');
    expect(beurt.verdict).toBe('good');
    expect(beurt.lookup).toBe('resolved');
    expect(beurt.memories.map(m => m.content)).toEqual([
      'de sleutel staat in 1Password',
      'Luka werkt met vier sessies tegelijk',
    ]);
    expect(beurt.memories[0].importance).toBe(7);
  });

  it('nieuwste beurt eerst', async () => {
    supabaseImpl = clientMet([]);
    noteRetrieval('de eerste', ['a'], [], 'chat');
    noteRetrieval('de tweede', ['b'], [], 'chat');

    const beurten = await turnDossiers();

    expect(beurten.map(b => b.query)).toEqual(['de tweede', 'de eerste']);
  });

  it('een herinnering die sindsdien is opgeruimd, telt als verdwenen', async () => {
    // m2 bestaat niet meer -- vervallen of opgeruimd sinds deze beurt.
    supabaseImpl = clientMet([{ id: 'm1', content: 'nog steeds hier', importance: 5 }]);
    noteRetrieval('iets', ['m1', 'm2'], [], 'code-editor');

    const [beurt] = await turnDossiers();

    expect(beurt.lookup).toBe('resolved');
    expect(beurt.vanished).toBe(1);
    expect(beurt.memories.find(m => m.id === 'm2')?.content).toBeNull();
  });

  it('zonder database zegt hij dat hij niet gekeken heeft, niet dat alles weg is', async () => {
    supabaseImpl = null;
    noteRetrieval('iets', ['m1', 'm2'], [], 'browser');

    const [beurt] = await turnDossiers();

    // Dit is het hele punt: vijf ids en geen inhoud mag nooit lezen als
    // "verdwenen" wanneer er simpelweg niet is opgezocht.
    expect(beurt.lookup).toBe('unavailable');
    expect(beurt.vanished).toBe(0);
    expect(beurt.memories).toHaveLength(2);
  });

  it('een mislukte query maakt het hele beeld onbetrouwbaar, niet half waar', async () => {
    supabaseImpl = stukkeClient();
    noteRetrieval('iets', ['m1'], [], 'browser');

    const [beurt] = await turnDossiers();

    expect(beurt.lookup).toBe('unavailable');
    expect(beurt.vanished).toBe(0);
  });

  it('een beurt zonder herinneringen is een compleet antwoord, geen ontbrekende database', async () => {
    supabaseImpl = null;
    noteRetrieval('niets opgehaald', [], [], 'chat');

    const [beurt] = await turnDossiers();

    // Er viel niets op te zoeken, dus er ontbreekt ook niets.
    expect(beurt.lookup).toBe('resolved');
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it('toont of de versterking ook echt is uitgevoerd, niet alleen verdiend', async () => {
    supabaseImpl = clientMet([{ id: 'm1', content: 'x', importance: 5 }]);
    const id = noteRetrieval('iets', ['m1'], [], 'browser');
    noteTurnOutcome(id, 'good');

    const [voor] = await turnDossiers();
    // Goed afgelopen, maar applyReinforcement heeft nog niet gedraaid.
    expect(voor.verdict).toBe('good');
    expect(voor.applied).toBe(false);
  });

  it('een beurt uit een oudere versie zonder eigenaar breekt niets', async () => {
    supabaseImpl = clientMet([]);
    localStorage.setItem('axe_memory_feedback_v1', JSON.stringify([
      { id: 'oud', at: Date.now(), query: 'x', memoryIds: [], memoryKeys: [], verdict: 'unknown' },
    ]));

    const [beurt] = await turnDossiers();

    expect(beurt.owner).toBeNull();
  });
});
