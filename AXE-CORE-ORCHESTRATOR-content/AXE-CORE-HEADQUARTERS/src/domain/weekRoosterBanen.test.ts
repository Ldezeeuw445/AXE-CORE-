import { describe, it, expect } from 'vitest';
import { banenVoor, type Blokje } from './weekRooster';

const b = (van: number, hoog: number): Blokje => ({
  item: { id: `${van}-${hoog}`, titel: '', datum: '2026-09-25', tijd: '00:00', duurMin: 30, kleur: '', soort: '' },
  vanUur: van, hoogUur: hoog,
});

describe('banenVoor', () => {
  it('geeft een los blokje de hele breedte', () => {
    expect(banenVoor([b(9, 1)])).toMatchObject([{ baan: 0, banen: 1 }]);
  });
  it('zet drie gelijktijdige blokjes naast elkaar', () => {
    expect(banenVoor([b(9, 0.5), b(9, 0.5), b(9, 0.5)])).toMatchObject([
      { baan: 0, banen: 3 }, { baan: 1, banen: 3 }, { baan: 2, banen: 3 },
    ]);
  });
  it('hergebruikt een baan zodra die vrij is, en scheidt losse groepen', () => {
    expect(banenVoor([b(9, 1), b(9.5, 1), b(10, 0.5), b(12, 0.5)])).toMatchObject([
      { baan: 0, banen: 2 }, { baan: 1, banen: 2 }, { baan: 0, banen: 2 }, { baan: 0, banen: 1 },
    ]);
  });
});
