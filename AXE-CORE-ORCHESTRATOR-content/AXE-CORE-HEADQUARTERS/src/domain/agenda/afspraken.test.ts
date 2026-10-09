import { describe, it, expect } from 'vitest';
import {
  botsingen, datumUitWoord, komend, leesAfspraken, maakAfspraak, naarRoosterItem, tijdUitWoord, vindAfspraak,
  type Afspraak,
} from './afspraken';

// Vrijdag 9 oktober 2026, 14:00 lokale tijd.
const NU = new Date(2026, 9, 9, 14, 0);

function af(inv: Partial<Afspraak> & { id: string }): Afspraak {
  return {
    titel: 'Diner', datum: '2026-10-10', tijd: '19:30', duurMin: 90, status: 'gepland', bron: 'axe',
    aangemaakt: NU.toISOString(), ...inv,
  };
}

describe('datumUitWoord', () => {
  it('leest woorden en echte datums', () => {
    expect(datumUitWoord('vandaag', NU)).toBe('2026-10-09');
    expect(datumUitWoord('morgen', NU)).toBe('2026-10-10');
    expect(datumUitWoord('overmorgen', NU)).toBe('2026-10-11');
    expect(datumUitWoord('2026-12-31', NU)).toBe('2026-12-31');
  });
  it('zet een weekdag op de eerstvolgende, en vrijdag op een vrijdag op volgende week', () => {
    expect(datumUitWoord('maandag', NU)).toBe('2026-10-12');
    expect(datumUitWoord('next monday', NU)).toBe('2026-10-12');
    expect(datumUitWoord('zaterdag', NU)).toBe('2026-10-10');
    expect(datumUitWoord('vrijdag', NU)).toBe('2026-10-16');
  });
  it('gokt niet: een onmogelijke of onbekende datum is null', () => {
    expect(datumUitWoord('2026-02-30', NU)).toBeNull();
    expect(datumUitWoord('ooit', NU)).toBeNull();
  });
});

describe('tijdUitWoord', () => {
  it('leest de gangbare schrijfwijzen', () => {
    expect(tijdUitWoord('19:30')).toBe('19:30');
    expect(tijdUitWoord('7:05')).toBe('07:05');
    expect(tijdUitWoord('19.30')).toBe('19:30');
    expect(tijdUitWoord('1930')).toBe('19:30');
  });
  it('weigert wat geen tijd is', () => {
    expect(tijdUitWoord('25:00')).toBeNull();
    expect(tijdUitWoord('avond')).toBeNull();
  });
});

describe('maakAfspraak', () => {
  it('maakt een geplande afspraak, nooit meteen een bevestigde', () => {
    const a = maakAfspraak({ titel: ' Tafel bij Rijsel ', datum: 'zaterdag', tijd: '19.30', plaats: 'Rijsel, Amsterdam' }, NU);
    if ('fout' in a) throw new Error(a.fout);
    expect(a).toMatchObject({ titel: 'Tafel bij Rijsel', datum: '2026-10-10', tijd: '19:30', duurMin: 60, status: 'gepland', bron: 'axe' });
  });
  it('zegt wat er mis is in plaats van iets in te plannen', () => {
    expect('fout' in maakAfspraak({ titel: '', datum: 'morgen', tijd: '10:00' }, NU)).toBe(true);
    expect('fout' in maakAfspraak({ titel: 'x', datum: 'ooit', tijd: '10:00' }, NU)).toBe(true);
    expect('fout' in maakAfspraak({ titel: 'x', datum: 'morgen', tijd: 'avond' }, NU)).toBe(true);
    expect('fout' in maakAfspraak({ titel: 'x', datum: 'morgen', tijd: '10:00', duurMin: 1 }, NU)).toBe(true);
  });
});

describe('botsingen', () => {
  const lijst = [af({ id: 'a', tijd: '19:00', duurMin: 60 }), af({ id: 'b', datum: '2026-10-11' }), af({ id: 'c', tijd: '19:00', status: 'geannuleerd' })];
  it('vindt overlap op dezelfde dag', () => {
    expect(botsingen(lijst, { id: 'n', datum: '2026-10-10', tijd: '19:30', duurMin: 60 }).map(a => a.id)).toEqual(['a']);
  });
  it('telt aansluiten niet als botsen, en geannuleerd of een andere dag ook niet', () => {
    expect(botsingen(lijst, { id: 'n', datum: '2026-10-10', tijd: '20:00', duurMin: 60 })).toEqual([]);
    expect(botsingen(lijst, { id: 'n', datum: '2026-10-12', tijd: '19:00', duurMin: 60 })).toEqual([]);
  });
});

describe('komend', () => {
  it('geeft op volgorde alleen wat nog aankomt', () => {
    const lijst = [
      af({ id: 'laat', datum: '2026-10-10', tijd: '21:00' }),
      af({ id: 'voorbij', datum: '2026-10-09', tijd: '09:00', duurMin: 60 }),
      af({ id: 'nog', datum: '2026-10-09', tijd: '15:00' }),
      af({ id: 'weg', datum: '2026-10-09', tijd: '16:00', status: 'geannuleerd' }),
      af({ id: 'ver', datum: '2027-01-01' }),
    ];
    expect(komend(lijst, NU).map(a => a.id)).toEqual(['nog', 'laat']);
  });
});

describe('vindAfspraak', () => {
  const lijst = [af({ id: 'x1', titel: 'Tafel bij Rijsel' }), af({ id: 'x2', titel: 'Tandarts' }), af({ id: 'x3', titel: 'Tafel bij Zoldering' })];
  it('vindt op id of op een eenduidig stuk titel', () => {
    expect(vindAfspraak(lijst, 'x2')).toMatchObject({ gevonden: { id: 'x2' } });
    expect(vindAfspraak(lijst, 'tand')).toMatchObject({ gevonden: { id: 'x2' } });
  });
  it('kiest niet als het twee kan zijn, en zegt welke', () => {
    const r = vindAfspraak(lijst, 'tafel');
    expect('fout' in r && r.fout).toContain('x1');
    expect('fout' in r && r.fout).toContain('x3');
  });
  it('zegt dat er niets past', () => {
    expect('fout' in vindAfspraak(lijst, 'kapper')).toBe(true);
  });
});

describe('leesAfspraken', () => {
  it('houdt alleen echte afspraken over en repareert wat kan', () => {
    const l = leesAfspraken([
      { id: 'ok', titel: 'A', datum: '2026-10-10', tijd: '10:00', duurMin: 30, status: 'bevestigd' },
      { id: 'geen-datum', titel: 'B', datum: 'morgen', tijd: '10:00' },
      { id: 'geen-tijd', titel: 'C', datum: '2026-10-10', tijd: 'laat' },
      null, 'tekst', { titel: 'zonder id', datum: '2026-10-10', tijd: '10:00' },
      { id: 'kaal', titel: 'D', datum: '2026-10-10', tijd: '10:00', status: 'vreemd' },
    ]);
    expect(l.map(a => a.id)).toEqual(['ok', 'kaal']);
    expect(l[1]).toMatchObject({ status: 'gepland', duurMin: 60 });
    expect(leesAfspraken('niets')).toEqual([]);
  });
});

describe('naarRoosterItem', () => {
  it('zet "unconfirmed" bij wat nog niet bevestigd is, zodat de agenda niet liegt', () => {
    expect(naarRoosterItem(af({ id: 'g' })).titel).toBe('Diner (unconfirmed)');
    expect(naarRoosterItem(af({ id: 'b', status: 'bevestigd' })).titel).toBe('Diner');
  });
});
