import { describe, expect, it } from 'vitest';
import { grootteTekst, isVoorMij, isWorp, landTekst, opslagPad, veiligeNaam, type PortalRij } from './portal';

const nu = Date.parse('2026-11-19T10:00:00Z');
const rij = (extra: Partial<PortalRij> = {}): PortalRij => ({
  id: 'a', created_at: '2026-11-19T09:59:50Z', van: 'iPhone', naar: 'alle', soort: 'bestand', naam: 'foto.jpg',
  mime: 'image/jpeg', grootte: 10, pad: 'a/foto.jpg', tekst: null, opgehaald_door: null, opgehaald_at: null, ...extra,
});

describe('Portal (18 nov)', () => {
  it('bestandsnamen blijven kaal en veilig, net als in lib.rs', () => {
    expect(veiligeNaam('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(veiligeNaam('.verborgen')).toBe('verborgen');
    expect(veiligeNaam('   ')).toBe('portal-bestand');
    expect(opslagPad('id1', 'IMG 0001.HEIC')).toBe('id1/IMG 0001.HEIC');
  });

  it('naar "waar ik ben" landt alleen op de Mac waar Luka net iets deed', () => {
    expect(isVoorMij(rij(), 'imac', 5, nu)).toBe(true);
    expect(isVoorMij(rij(), 'imac', 600, nu)).toBe(false);
    expect(isVoorMij(rij(), 'imac', null, nu)).toBe(true);
  });

  it('expliciet naar een Mac: alleen die; opgehaald of oud: niemand', () => {
    expect(isVoorMij(rij({ naar: 'mini' }), 'mini', 9999, nu)).toBe(true);
    expect(isVoorMij(rij({ naar: 'mini' }), 'imac', 1, nu)).toBe(false);
    expect(isVoorMij(rij({ opgehaald_at: '2026-11-19T09:59:55Z' }), 'imac', 1, nu)).toBe(false);
    expect(isVoorMij(rij({ created_at: '2026-11-17T09:00:00Z' }), 'imac', 1, nu)).toBe(false);
  });

  it('een worp is ver of snel naar links, niet een tik of naar rechts', () => {
    expect(isWorp(-150, 0)).toBe(true);
    expect(isWorp(-50, -0.9)).toBe(true);
    expect(isWorp(-20, -2)).toBe(false);
    expect(isWorp(200, 1)).toBe(false);
  });

  it('wat de notch zegt', () => {
    expect(landTekst({ soort: 'bestand', naam: 'foto.jpg', tekst: null, van: 'iPhone' })).toEqual({ titel: 'Geland van iPhone', tekst: 'foto.jpg' });
    expect(landTekst({ soort: 'tekst', naam: '', tekst: 'hallo\nwereld', van: '' }).tekst).toBe('hallo wereld');
    expect(grootteTekst(3_500_000)).toBe('3.3 MB');
  });
});
