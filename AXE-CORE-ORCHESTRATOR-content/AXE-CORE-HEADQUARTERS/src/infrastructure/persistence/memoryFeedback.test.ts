import { describe, it, expect, beforeEach, vi } from 'vitest';

// De testomgeving is node, dus localStorage bestaat niet. Dezelfde stub als
// axonMemoryBridge.test gebruikt, met removeItem/clear erbij voor deze test.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
});

import { noteRetrieval, latestOpenTurnId, noteTurnOutcome } from './memoryFeedbackService';

/**
 * Elke agent haalt geheugen op en pakt daarna "de laatste openstaande beurt".
 * Dat werkt zolang niemand ertussen komt -- maar het ophalen is asynchroon, en
 * terwijl de code-editor op zijn antwoord wacht kan de chat zijn eigen beurt
 * openen. Dan velt de code-editor zijn oordeel over de herinneringen van de
 * chat.
 *
 * Zeldzaam, en juist daarom vervelend: het gaat meestal goed, dus je ziet het
 * niet, en ondertussen wordt het verkeerde versterkt.
 */
beforeEach(() => {
  localStorage.clear();
});

describe('een beurt hoort bij wie hem opende', () => {
  it('zonder eigenaar pakt een agent de beurt van een ander', () => {
    // De code-editor haalt op...
    noteRetrieval('een bestand aanpassen', ['mem-code']  , [], 'code-editor');
    // ...en terwijl hij op het model wacht, doet de chat zijn eigen ronde.
    const vanDeChat = noteRetrieval('waar staat mijn sleutel', ['mem-chat'], [], 'chat');

    // De oude manier: "de laatste openstaande beurt".
    expect(latestOpenTurnId()).toBe(vanDeChat);
  });

  it('met eigenaar vindt hij zijn eigen beurt terug', () => {
    const vanDeEditor = noteRetrieval('een bestand aanpassen', ['mem-code'], [], 'code-editor');
    noteRetrieval('waar staat mijn sleutel', ['mem-chat'], [], 'chat');

    expect(latestOpenTurnId('code-editor')).toBe(vanDeEditor);
  });

  it('geen eigen beurt betekent null, niet die van een ander', () => {
    noteRetrieval('waar staat mijn sleutel', ['mem-chat'], [], 'chat');
    // Een agent die niets ophaalde hoort niets te mogen beoordelen.
    expect(latestOpenTurnId('browser')).toBeNull();
  });

  it('een gesloten beurt telt niet meer als openstaand', () => {
    const id = noteRetrieval('iets', ['m'], [], 'chat');
    noteTurnOutcome(id, 'good');
    expect(latestOpenTurnId('chat')).toBeNull();
  });

  it('beurten uit een oudere versie zonder eigenaar blokkeren niets', () => {
    // localStorage overleeft een update; wat er ligt heeft het veld niet.
    localStorage.setItem('axe_memory_feedback_v1', JSON.stringify([
      { id: 'oud', at: Date.now(), query: 'x', memoryIds: [], memoryKeys: [], verdict: 'unknown' },
    ]));
    // Zonder eigenaar gevraagd: gewoon vindbaar, zoals voorheen.
    expect(latestOpenTurnId()).toBe('oud');
    // Met eigenaar gevraagd: hij is van niemand, dus niet van jou.
    expect(latestOpenTurnId('chat')).toBeNull();
  });
});
