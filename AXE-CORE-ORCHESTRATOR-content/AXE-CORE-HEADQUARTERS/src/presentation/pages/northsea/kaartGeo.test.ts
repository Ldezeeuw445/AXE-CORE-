import { describe, expect, it } from 'vitest';
import { vastelandMidden, wereldkaart } from './kaartGeo';
import { LAND_ALIAS, PLAATSEN } from '@/domain/northsea/plaatsen';

/**
 * De landvormen en hun middelpunten.
 *
 * Met de echte world-atlas-data en niet nagebootst: de fout waar dit tegen
 * beschermt zit juist in die data. geoCentroid over alle delen van een land
 * zet Frankrijk in de Atlantische Oceaan (Frans-Guyana telt mee) en de
 * Verenigde Staten richting Alaska. Een deal met een Franse koper kreeg dan een
 * stip in zee.
 */
const binnen = ([lon, lat]: [number, number], [west, zuid, oost, noord]: [number, number, number, number]) =>
  lon >= west && lon <= oost && lat >= zuid && lat <= noord;

describe('de wereldkaart', () => {
  const { landen, land, middelpunten } = wereldkaart();

  it('laadt alle landen en de kustlijn', () => {
    expect(landen.features.length).toBeGreaterThan(200);
    expect(land.features.length).toBeGreaterThan(0);
  });

  it('legt het midden van Frankrijk op het vasteland, niet in zee', () => {
    const frankrijk = landen.features.find(f => f.properties.name === 'France')!;
    expect(binnen(vastelandMidden(frankrijk), [-5, 41, 9.6, 51.2])).toBe(true);
    expect(binnen(middelpunten.get('France')!, [-5, 41, 9.6, 51.2])).toBe(true);
  });

  it('legt het midden van de Verenigde Staten in de aaneengesloten staten', () => {
    expect(binnen(middelpunten.get('United States of America')!, [-125, 24, -66, 50])).toBe(true);
  });

  it('kent elk land waar een haven of stad uit de data in ligt', () => {
    // Een tikfout hier laat een haven niet crashen maar stil van de kaart vallen.
    const ontbreekt = [...new Set([...PLAATSEN.values()].map(p => p.land))].filter(l => !middelpunten.has(l));
    expect(ontbreekt).toEqual([]);
  });

  it('elke schrijfwijze van een land wijst naar een land dat bestaat', () => {
    const ontbreekt = [...new Set(LAND_ALIAS.values())].filter(l => !middelpunten.has(l));
    expect(ontbreekt).toEqual([]);
  });
});
