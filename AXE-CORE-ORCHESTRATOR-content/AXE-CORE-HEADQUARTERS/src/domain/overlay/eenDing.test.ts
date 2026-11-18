import { describe, expect, it } from 'vitest';
import { datumSleutel, EEN_DING_SLEUTEL, kiesEenDing } from './eenDing';

const nu = new Date(2026, 10, 19, 9, 0);

describe('Eén ding vandaag (18 nov)', () => {
  it('wat Luka zelf vastzet wint, ook als het af is; van gisteren telt niet', () => {
    const eigen = { datum: '2026-11-19', tekst: ' Offerte Shell af ', klaar: false };
    expect(kiesEenDing(eigen, [{ titel: 'x', status: 'pending', sinds: '2026-11-01' }], 3, nu))
      .toMatchObject({ bron: 'eigen', tekst: 'Offerte Shell af', klaar: false });
    expect(kiesEenDing({ ...eigen, klaar: true }, [], 0, nu)).toMatchObject({ klaar: true, uitleg: 'Gedaan — de rest is bonus' });
    expect(kiesEenDing({ ...eigen, datum: '2026-11-18' }, [], 0, nu).bron).toBe('rust');
  });

  it('anders de oudste stap waar Luka aan de beurt is, zonder goedkeuringen', () => {
    const d = kiesEenDing(null, [
      { titel: 'Keur mail goed', status: 'waiting_approval', sinds: '2026-11-01T08:00:00Z' },
      { titel: 'Bel Rotterdam', status: 'pending', sinds: '2026-11-16T08:00:00Z' },
      { titel: 'Nieuw', status: 'pending', sinds: '2026-11-19T07:00:00Z' },
    ], 1, nu);
    expect(d).toMatchObject({ bron: 'stap', tekst: 'Bel Rotterdam', uitleg: 'Al 3 dagen open · nog 1 daarna' });
  });

  it('dan goedkeuringen, dan rust', () => {
    expect(kiesEenDing(null, [], 2, nu)).toMatchObject({ bron: 'goedkeuring', tekst: '2 dingen goedkeuren', tab: 'approvals' });
    expect(kiesEenDing(null, [], 0, nu)).toMatchObject({ bron: 'rust', tekst: 'Niets moet vandaag' });
    expect(kiesEenDing(null, [], 0, nu, false).tekst).toBe('Kies zelf je ene ding');
  });

  it('de dag is Luka\'s eigen dag, niet UTC', () => {
    expect(datumSleutel(new Date(2026, 10, 19, 0, 30))).toBe('2026-11-19');
    expect(EEN_DING_SLEUTEL(nu)).toBe('axe_een_ding_2026-11-19');
  });
});
