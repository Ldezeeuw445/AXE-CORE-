import { describe, expect, it } from 'vitest';
import { koppelServerBerichten, teVersturen } from './managerDraad';
import type { ManagerChatMsg } from './managerChatOpslag';

const m = (id: string, role: ManagerChatMsg['role'], at: number, extra: Partial<ManagerChatMsg> = {}): ManagerChatMsg =>
  ({ id, role, text: `tekst ${id}`, at, ...extra });

describe('gedeelde managerdraad', () => {
  it('stuurt alleen nieuwe gewone berichten omhoog', () => {
    const chat = [
      m('oud', 'user', 50),
      m('a', 'user', 200),
      m('b', 'assistant', 210),
      m('r', 'system', 220, { kind: 'relay' }),
      m('e', 'assistant', 230, { error: true }),
      m('s-9', 'assistant', 240),
      m('c', 'user', 250),
    ];
    expect(teVersturen(chat, { c: '77' }, 100).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('zet een managerbericht één keer in de chat, op tijd', () => {
    const chat = [m('a', 'user', Date.parse('2026-11-09T20:00:00Z'))];
    const server = [
      { id: '77', agent: 'northseamgr', role: 'user' as const, text: 'eigen', at: '2026-11-09T20:00:01Z' },
      { id: '78', agent: 'northseamgr', role: 'assistant' as const, text: 'Wat ik gedaan heb: ...', at: '2026-11-09T19:59:00Z' },
    ];
    const na = koppelServerBerichten(chat, server, { a: '77' });
    expect(na.map((x) => x.id)).toEqual(['s-78', 'a']);
    expect(koppelServerBerichten(na, server, { a: '77' })).toBe(na);
  });
});
