import { describe, expect, it } from 'vitest';
import { gesprekContext, voegChatSamen, type ManagerChatMsg } from './managerChatOpslag';
import { draadVanJob, GESPREK_CONTEXT } from '@/domain/tierRouter/agentDraad';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';

const T = 1_794_000_000_000;
const m = (id: string, role: ManagerChatMsg['role'], text: string, at = T): ManagerChatMsg => ({ id, role, text, at });

describe('gesprek met een manager', () => {
  it('toont een afgekorte taakregel niet naast het volledige bericht', () => {
    const vol = 'Dit is het hele antwoord van de manager met veel meer tekst erachter';
    const uit = voegChatSamen([m('a', 'assistant', vol)], [m('b', 'assistant', 'Dit is het hele antwoord…', T + 1)]);
    expect(uit.map((x) => x.id)).toEqual(['a']);
  });

  it('een eigen zin wordt niet dubbel', () => {
    expect(voegChatSamen([m('a', 'user', 'hoi')], [m('b', 'user', 'hoi', T + 1)])).toHaveLength(1);
  });

  it('de context bevat het gesprek, niet het huidige bericht, en houdt de grenzen', () => {
    const c = gesprekContext('Northsea Desk Manager', [
      m('a', 'user', 'hoe staat de desk?'),
      m('b', 'assistant', 'De desk loopt.'),
      m('c', 'user', 'mooi, ga door'),
    ], 'mooi, ga door');
    expect(c).toContain('Luka: hoe staat de desk?');
    expect(c).toContain('Northsea Desk Manager: De desk loopt.');
    expect(c).not.toContain('Luka: mooi, ga door');
    expect(c).toMatch(/hard limits and approval gates stay/);
  });

  it('in de draad staat alleen wat Luka zei, met een echte tijd, en geen context', () => {
    const job = { id: 'j', agent: 'axon', state: 'done', title: 'x', bron: 'followup', startedAt: T, finishedAt: T + 9, summary: 'Klaar.',
      sourceText: `mijn vraag${GESPREK_CONTEXT}You are AXON`, stappen: [] } as unknown as AxeJob;
    const d = draadVanJob(job);
    expect(d[0]).toMatchObject({ tekst: 'mijn vraag', at: T });
    expect(d[1]).toMatchObject({ soort: 'result', at: T + 9 });
  });
});
