import { describe, it, expect } from 'vitest';
import { bouwStroom, stroomTijd, type StroomRegel } from './aiCoreStroom';
import type { ConversationMessage, RoutingEvent } from '@/presentation/store/voiceStore';

const T0 = new Date(2026, 8, 23, 14, 0, 0).getTime();

const gesprek: ConversationMessage[] = [
  { role: 'user', text: 'hoe staat EURUSD', timestamp: T0 },
  { role: 'axe', text: 'Vlak, geen positie.', timestamp: T0 + 4000, provider: 'gemini', model: 'google/gemini-2.5-flash:free' },
];

function evt(over: Partial<RoutingEvent>): RoutingEvent {
  return { id: 'e1', ts: T0 + 1000, query: 'q', capability: 'trading', slotOrder: [], attempts: [], via: 'langgraph', ...over };
}

describe('bouwStroom — de stroom uit wat er al bewaard is', () => {
  it('toont een geladen gesprek meteen, met het model vóór het antwoord', () => {
    const s = bouwStroom(gesprek, []);
    expect(s.map(r => [r.type, r.text])).toEqual([
      ['in', 'hoe staat EURUSD'],
      ['route', 'model · gemini/gemini-2.5-flash'],
      ['out', 'Vlak, geen positie.'],
    ]);
  });

  it('is leeg als er geen gesprek is -- geen verzonnen opstartregels', () => {
    expect(bouwStroom([], [evt({ delegate: 'trading' })])).toEqual([]);
  });

  it('toont een overdracht aan een specialist op zijn tijd, maar niet wat AXE zelf deed', () => {
    const s = bouwStroom(gesprek, [
      evt({ id: 'a', delegate: 'trading', winner: 'openai', winnerModel: 'gpt-5:latest', count: 3 }),
      evt({ id: 'b', ts: T0 + 2000 }), // AXE zelf: geen regel
    ]);
    expect(s.map(r => r.text)).toEqual([
      'hoe staat EURUSD',
      'AXE → Trading Agent  · via LangGraph  ×3',
      'Trading Agent · openai/gpt-5',
      'model · gemini/gemini-2.5-flash',
      'Vlak, geen positie.',
    ]);
  });

  it('laat routering van vóór de eerste beurt weg (een ander gesprek)', () => {
    const s = bouwStroom(gesprek, [evt({ ts: T0 - 60_000, delegate: 'browser' })]);
    expect(s.some(r => r.text.includes('Browser'))).toBe(false);
  });

  it('mengt losse live-regels op tijd, ontdubbelt op id, en knipt op sinds en max', () => {
    const los: StroomRegel[] = [
      { id: 'p1', at: T0 + 2000, type: 'sys', text: '⟳ AXE thinking…' },
      { id: 'p1', at: T0 + 2000, type: 'sys', text: '⟳ AXE thinking…' },
    ];
    const s = bouwStroom(gesprek, [], los);
    expect(s.map(r => r.type)).toEqual(['in', 'sys', 'route', 'out']);
    expect(bouwStroom(gesprek, [], los, { sinds: T0 + 3000 }).map(r => r.type)).toEqual(['route', 'out']);
    expect(bouwStroom(gesprek, [], los, { max: 1 }).map(r => r.type)).toEqual(['out']);
  });
});

describe('stroomTijd', () => {
  it('toont van vandaag alleen de klok, ouder met de datum erbij', () => {
    const nu = T0 + 60_000;
    expect(stroomTijd(T0, nu)).toBe('14:00:00');
    expect(stroomTijd(T0 - 24 * 3600_000, nu)).toBe('Sep 22 14:00');
  });
});
