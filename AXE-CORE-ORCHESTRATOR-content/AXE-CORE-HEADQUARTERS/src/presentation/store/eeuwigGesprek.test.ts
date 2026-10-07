/**
 * Test A: het eeuwige AXE-gesprek, op de echte store.
 *
 * Stuur een bericht, "herlaad de app" (module opnieuw laden, zelfde opslag),
 * en kijk: hetzelfde gesprek, geen nieuw gesprek-id, niets leeggemaakt. Ook
 * met een oude gesprek-pointer in localStorage, en ook na een klik op de oude
 * "nieuw gesprek"-knop. De begroetingsregel zelf staat in
 * domain/chat/hoofdgesprek.test.ts; hier wordt bewezen dat de store hem volgt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AXE_HOOFDGESPREK_ID, magBegroeten } from '@/domain/chat/hoofdgesprek';

const opslag = new Map<string, string>();
const localStorageNep = {
  getItem: (k: string) => (opslag.has(k) ? opslag.get(k)! : null),
  setItem: (k: string, v: string) => { opslag.set(k, String(v)); },
  removeItem: (k: string) => { opslag.delete(k); },
  clear: () => opslag.clear(),
  key: (i: number) => [...opslag.keys()][i] ?? null,
  get length() { return opslag.size; },
};

/** Wat de server teruggeeft voor het hoofdgesprek: de draad over oude id's heen. */
const serverDraad = vi.fn();

vi.mock('@/infrastructure/persistence/chatPersistence', async (orig) => {
  const echt = await orig<typeof import('@/infrastructure/persistence/chatPersistence')>();
  return {
    ...echt,
    loadMessages: (id: string) => serverDraad(id),
    saveMessage: vi.fn(async () => undefined),
    loadAllConversations: vi.fn(async () => []),
  };
});

async function startApp() {
  vi.resetModules();
  const mod = await import('@/presentation/store/voiceStore');
  return mod.useVoiceStore;
}

describe('Test A — eeuwig gesprek', () => {
  beforeEach(() => {
    opslag.clear();
    vi.stubGlobal('localStorage', localStorageNep);
    serverDraad.mockReset();
  });

  it('openen hervat altijd hetzelfde gesprek, ook met een oude pointer', async () => {
    opslag.set('axe_chat_session_axe-core', '11111111-2222-4333-8444-555555555555');
    const store = await startApp();
    expect(store.getState().sessionId).toBe(AXE_HOOFDGESPREK_ID);
  });

  it('bericht → herladen → zelfde draad, geen nieuw gesprek, geen tweede begroeting', async () => {
    const t0 = Date.now() - 10 * 60_000;
    const draad = [
      { role: 'axe', text: 'Goedemorgen, Luka. Developer is klaar met de build.', timestamp: t0 },
      { role: 'user', text: 'Top. Hoe gaat NorthSea?', timestamp: t0 + 60_000 },
    ];
    serverDraad.mockResolvedValue(draad);

    let store = await startApp();
    await store.getState().loadConversation();
    expect(serverDraad).toHaveBeenCalledWith(AXE_HOOFDGESPREK_ID);
    expect(store.getState().conversation.map((m) => m.text)).toEqual(draad.map((m) => m.text));

    // App dicht en weer open.
    store = await startApp();
    expect(store.getState().sessionId).toBe(AXE_HOOFDGESPREK_ID);
    await store.getState().loadConversation();
    expect(store.getState().conversation).toHaveLength(2);
    // Er is vandaag al begroet en het gesprek loopt: geen nieuwe begroeting.
    expect(magBegroeten(store.getState().conversation, Date.now())).toBe(false);
  });

  it('de oude "nieuw gesprek"-actie maakt geen nieuw gesprek en wist niets', async () => {
    serverDraad.mockResolvedValue([{ role: 'user', text: 'hoi', timestamp: Date.now() }]);
    const store = await startApp();
    await store.getState().loadConversation();
    store.getState().startNewConversation();
    expect(store.getState().sessionId).toBe(AXE_HOOFDGESPREK_ID);
    expect(store.getState().conversation).toHaveLength(1);
    expect(opslag.get('axe_chat_session_axe-core')).toBe(AXE_HOOFDGESPREK_ID);
  });
});
