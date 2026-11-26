import { describe, expect, it } from 'vitest';
import { RAAD, raadBlok, raadVraag } from './raad';

const STUK = 'NorthSea Trade levert EN590 vanuit Rotterdam binnen tien dagen, met SGS-inspectie en betaling via LC.';

describe('De Raad', () => {
  it('heeft acht leden', () => {
    expect(RAAD).toHaveLength(8);
    expect(new Set(RAAD.map((l) => l.naam)).size).toBe(8);
  });

  it('herkent de vraag en pakt het stuk', () => {
    expect(raadVraag(`laat de raad kijken naar: ${STUK}`)).toEqual({ stuk: STUK });
    expect(raadVraag(`Vraag de raad: ${STUK}`)).toEqual({ stuk: STUK });
    expect(raadVraag(`council review - ${STUK}`)).toEqual({ stuk: STUK });
    expect(raadVraag('wat vindt de gemeenteraad ervan')).toBeNull();
    expect(raadVraag('schrijf een mail')).toBeNull();
  });

  it('review alleen met een echt stuk', () => {
    expect(raadBlok('wat is het weer')).toBe('');
    const blok = raadBlok(`laat de raad kijken naar: ${STUK}`);
    expect(blok).toContain('The Sceptic');
    expect(blok).toContain('Score: N/10');
    expect(raadBlok('laat de raad kijken naar de homepage')).toContain('Do not invent a review');
  });
});
