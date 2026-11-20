import { describe, expect, it } from 'vitest';
import type { Afspraak } from '@/domain/agenda/afspraken';
import { aankomend, focusStand, geordend, hervat, nieuweFocus, overTekst, pauzeer, vergaderLink, voegToe, weerWoord } from './notchWidgets';

const afspraak = (x: Partial<Afspraak>): Afspraak => ({
  id: 'a', titel: 'Call', datum: '2026-11-20', tijd: '14:00', duurMin: 30, status: 'gepland', bron: 'luka', aangemaakt: '', ...x,
});

describe('focus-timer', () => {
  it('telt af, pauzeert en hervat', () => {
    const f = nieuweFocus(25, 0);
    expect(focusStand(f, 60_000)?.tekst).toBe('24:00');
    const p = pauzeer(f, 60_000);
    expect(focusStand(p, 600_000)?.tekst).toBe('24:00');
    expect(focusStand(p, 600_000)?.loopt).toBe(false);
    const h = hervat(p, 600_000);
    expect(focusStand(h, 660_000)?.tekst).toBe('23:00');
    expect(focusStand(h, 99_000_000)?.klaar).toBe(true);
  });
});

describe('join-kaart', () => {
  it('vindt de vergaderlink en wordt groot 4 min vooraf', () => {
    const a = afspraak({ notitie: 'agenda https://example.com/doc en https://meet.google.com/abc-defg-hij' });
    expect(vergaderLink(a)).toBe('https://meet.google.com/abc-defg-hij');
    const vroeg = aankomend([a], new Date(2026, 10, 20, 13, 30));
    expect(vroeg?.nu).toBe(false);
    expect(vroeg?.over).toBe(30);
    const bijna = aankomend([a], new Date(2026, 10, 20, 13, 57));
    expect(bijna?.nu).toBe(true);
    expect(bijna?.link).toContain('meet.google.com');
  });
  it('slaat voorbij, geannuleerd en andere dagen over', () => {
    const lijst = [
      afspraak({ id: 'oud', tijd: '09:00' }),
      afspraak({ id: 'weg', tijd: '15:00', status: 'geannuleerd' }),
      afspraak({ id: 'morgen', datum: '2026-11-21' }),
      afspraak({ id: 'ja', tijd: '16:00' }),
    ];
    expect(aankomend(lijst, new Date(2026, 10, 20, 13, 0))?.id).toBe('ja');
  });
  it('tekst', () => {
    expect(overTekst(5)).toBe('in 5 min');
    expect(overTekst(90)).toBe('in 1h 30m');
    expect(overTekst(-3)).toBe('started 3 min ago');
  });
});

describe('weer en taken', () => {
  it('weer in één woord', () => {
    expect(weerWoord(0).woord).toBe('Clear');
    expect(weerWoord(63).woord).toBe('Rain');
  });
  it('taken: leeg telt niet, open eerst', () => {
    let l = voegToe([], '  ', '1');
    expect(l).toHaveLength(0);
    l = voegToe(voegToe(l, 'a', '1'), 'b', '2');
    l[0] = { ...l[0], af: true };
    expect(geordend(l).map((t) => t.tekst)).toEqual(['b', 'a']);
  });
});
