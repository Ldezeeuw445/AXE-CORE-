import { describe, expect, it } from 'vitest';
import { lijstAntwoord, plekUitSleutel, stemBlok, stemOpdracht, volgendePlek, wilStem } from './stem';

const LANG = 'Hoi, korte update van mij. We hebben de lading in Rotterdam binnen en ik wil vandaag nog weten wie er tekent.';

describe('Jouw stem', () => {
  it('herkent leren, te kort en de lijst', () => {
    expect(stemOpdracht(`leer mijn stem: ${LANG}`)).toEqual({ soort: 'leer', tekst: LANG });
    expect(stemOpdracht(`AXE, dit is mijn stem - ${LANG}`)).toMatchObject({ soort: 'leer' });
    expect(stemOpdracht('leer mijn stem: hoi')).toEqual({ soort: 'te-kort', tekens: 3 });
    expect(stemOpdracht('mijn stem')).toEqual({ soort: 'lijst' });
    expect(stemOpdracht('toon mijn stem')).toEqual({ soort: 'lijst' });
    expect(stemOpdracht('schrijf een mail in mijn stem aan Jan')).toBeNull();
    expect(stemOpdracht('wat vind je van mijn stem in die opname van gisteren')).toBeNull();
  });

  it('weet wanneer de stem mee moet', () => {
    expect(wilStem('schrijf een LinkedIn-post in mijn stem over de deal')).toBe(true);
    expect(wilStem('review dit in my voice: ...')).toBe(true);
    expect(wilStem('schrijf het zoals ik het zou zeggen')).toBe(true);
    expect(wilStem('schrijf een mail aan Jan')).toBe(false);
  });

  it('vult vrije plekken en vervangt daarna de oudste', () => {
    expect(volgendePlek([])).toBe(1);
    expect(volgendePlek([{ plek: 1, tekst: 'a', op: 1 }, { plek: 3, tekst: 'c', op: 3 }])).toBe(2);
    const vol = [1, 2, 3, 4, 5].map((p) => ({ plek: p, tekst: 't', op: p === 4 ? 0 : 10 + p }));
    expect(volgendePlek(vol)).toBe(4);
    expect(plekUitSleutel('stem:5')).toBe(5);
    expect(plekUitSleutel('stem:6')).toBeNull();
    expect(plekUitSleutel('profiel:werk')).toBeNull();
  });

  it('zet de voorbeelden alleen in de prompt als erom gevraagd wordt', () => {
    const v = [{ plek: 1, tekst: LANG, op: 1 }];
    expect(stemBlok(v, 'wat is het weer')).toBe('');
    const blok = stemBlok(v, 'schrijf een mail in mijn stem');
    expect(blok).toContain('Rotterdam');
    expect(blok).toContain('REVIEW');
    expect(stemBlok([], 'schrijf een mail in mijn stem')).toContain('no samples of his writing');
  });

  it('lijst is eerlijk als er niets is', () => {
    expect(lijstAntwoord([])).toContain('nog geen teksten');
    expect(lijstAntwoord([{ plek: 2, tekst: LANG, op: 1 }])).toContain('2. Hoi, korte update');
  });
});
