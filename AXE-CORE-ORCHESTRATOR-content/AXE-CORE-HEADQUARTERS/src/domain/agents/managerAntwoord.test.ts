import { describe, expect, it } from 'vitest';
import { bouwManagerBerichten, splitsAntwoord } from './managerAntwoord';
import type { ManagerChatMsg } from './managerChatOpslag';

const m = (role: ManagerChatMsg['role'], text: string, extra: Partial<ManagerChatMsg> = {}): ManagerChatMsg =>
  ({ id: text, role, text, at: 1_794_000_000_000, ...extra });

describe('manager antwoordt als collega', () => {
  it('stuurt het gesprek mee, zonder relay of fout, en de vraag één keer', () => {
    const b = bouwManagerBerichten({ naam: 'Northsea Desk Manager', rol: 'Owns NorthSea Desk' }, [
      m('assistant', 'Wat ik verder zie: 76 wachten op jouw ok.'),
      m('system', 'Bericht gestuurd', { kind: 'relay' }),
      m('assistant', 'oeps', { error: true }),
      m('user', 'welke zijn oud?'),
    ], 'welke zijn oud?');
    expect(b[0].role).toBe('system');
    expect(b[0].content).toMatch(/never send mail, approve/);
    expect(b.slice(1).map((x) => x.content)).toEqual(['Wat ik verder zie: 76 wachten op jouw ok.', 'welke zijn oud?']);
  });

  it('haalt ACTIE-regels eruit en zegt wat hij uitzet', () => {
    const { tekst, acties } = splitsAntwoord('Klopt, de meeste zijn van september.\n\nACTIE: Archiveer de chase-items ouder dan 30 dagen\n- **ACTIE:** Maak een lijst van de 5 nieuwste');
    expect(acties).toEqual(['Archiveer de chase-items ouder dan 30 dagen', 'Maak een lijst van de 5 nieuwste']);
    expect(tekst).toMatch(/^Klopt, de meeste zijn van september\./);
    expect(tekst).toMatch(/Ik zet dit nu uit:\n- Archiveer/);
  });

  it('zonder acties blijft het antwoord zoals het is', () => {
    expect(splitsAntwoord('Alles loopt.')).toEqual({ tekst: 'Alles loopt.', acties: [] });
  });
});
