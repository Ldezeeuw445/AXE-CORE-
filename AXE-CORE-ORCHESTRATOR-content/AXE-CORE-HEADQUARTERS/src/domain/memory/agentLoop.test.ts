import { describe, it, expect } from 'vitest';
import {
  reinforcedImportance, pendingForReinforcement, tallyHits, loopHealth,
  isLoopAgent, MAX_IMPORTANCE, type Episode,
} from './agentLoop';

function ep(over: Partial<Episode> = {}): Episode {
  return {
    id: 'e1', agent: 'trading', subject: 'XAUUSD',
    memoryIds: ['m1'], memoryKeys: [], verdict: 'unknown',
    applied: false, openedAt: 0, ...over,
  };
}

describe('reinforcedImportance', () => {
  it('tilt op per treffer', () => {
    expect(reinforcedImportance(5, 1)).toBe(6);
    expect(reinforcedImportance(5, 3)).toBe(8);
  });

  it('loopt niet door het plafond', () => {
    // Zonder plafond wordt elke vaak opgehaalde herinnering uiteindelijk
    // belangrijker dan alles wat zeldzaam maar cruciaal is.
    expect(reinforcedImportance(9, 5)).toBe(MAX_IMPORTANCE);
  });

  it('valt terug op het midden als het gewicht onzin is', () => {
    expect(reinforcedImportance(NaN, 1)).toBe(6);
  });
});

describe('pendingForReinforcement', () => {
  it('neemt alleen goed afgelopen, nog niet toegepaste episodes', () => {
    const set = [
      ep({ id: 'a', verdict: 'good' }),
      ep({ id: 'b', verdict: 'poor' }),
      ep({ id: 'c', verdict: 'unknown' }),
      ep({ id: 'd', verdict: 'good', applied: true }),
    ];
    expect(pendingForReinforcement(set).map(e => e.id)).toEqual(['a']);
  });

  it('slaat een episode zonder herinneringen over', () => {
    // Een agent die niets ophaalde en het goed deed, bewijst niets over het
    // geheugen -- daar valt niets aan te versterken.
    const set = [ep({ verdict: 'good', memoryIds: [], memoryKeys: [] })];
    expect(pendingForReinforcement(set)).toHaveLength(0);
  });
});

describe('tallyHits', () => {
  it('telt per episode, niet per vermelding', () => {
    // Dezelfde les drie keer in één context is geen drie keer zoveel bewijs.
    const hits = tallyHits([ep({ memoryIds: ['m1', 'm1', 'm1'] })]);
    expect(hits.get('m1')).toBe(1);
  });

  it('telt over episodes heen op', () => {
    const hits = tallyHits([
      ep({ id: 'a', memoryIds: ['m1', 'm2'] }),
      ep({ id: 'b', memoryIds: ['m1'] }),
    ]);
    expect(hits.get('m1')).toBe(2);
    expect(hits.get('m2')).toBe(1);
  });
});

describe('loopHealth', () => {
  it('legt een agent bloot die opent maar nooit sluit', () => {
    // Dit is de storing waar het om gaat: er staan rijen, er lijkt iets te
    // gebeuren, en er verandert nooit een gewicht.
    const h = loopHealth('browser', [
      ep({ agent: 'browser' }), ep({ agent: 'browser' }), ep({ agent: 'browser' }),
    ]);
    expect(h.opened).toBe(3);
    expect(h.closed).toBe(0);
    expect(h.closeRate).toBe(0);
  });

  it('telt alleen zijn eigen episodes', () => {
    const h = loopHealth('trading', [
      ep({ agent: 'trading', verdict: 'good' }),
      ep({ agent: 'browser', verdict: 'good' }),
    ]);
    expect(h.opened).toBe(1);
    expect(h.good).toBe(1);
  });

  it('geeft 0 en geen NaN als er niets is', () => {
    expect(loopHealth('code-editor', []).closeRate).toBe(0);
  });
});

describe('isLoopAgent', () => {
  it('kent de agents die meedoen', () => {
    expect(isLoopAgent('trading')).toBe(true);
    expect(isLoopAgent('Trading')).toBe(false);
    expect(isLoopAgent('verzonnen')).toBe(false);
    expect(isLoopAgent(null)).toBe(false);
  });
});
