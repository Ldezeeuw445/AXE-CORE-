import { describe, expect, it } from 'vitest';
import { allesZin, isAllesGoedkeuren } from './allesGoedkeuren';

describe('keur alles goed in het gesprek (18 nov)', () => {
  it('herkent Luka\'s opdracht', () => {
    for (const t of ['ok alles', 'keur alles goed', 'je mag ze allemaal approven', 'ja verstuur alles', 'approve all']) {
      expect(isAllesGoedkeuren(t), t).toBe(true);
    }
  });
  it('een vraag of een nee is geen opdracht', () => {
    for (const t of ['mag ik alles goedkeuren?', 'niet alles versturen', 'wat wacht er allemaal', 'ok']) {
      expect(isAllesGoedkeuren(t), t).toBe(false);
    }
  });
  it('zegt in gewone taal wat er gebeurde', () => {
    expect(allesZin({ verstuurd: 29, axeGoedgekeurd: 1, mislukt: [], overgeslagen: 15 }))
      .toContain('29 mails van NorthSea verstuurd en 1 vraag in AXE goedgekeurd');
  });
});
