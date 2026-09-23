import { describe, expect, it } from 'vitest';
import { neighbors } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import wereld50m from 'world-atlas/countries-50m.json';
import { DROGE_LANDEN, LAND_PALET, klimaat, landKleuren, vastelandMidden, wereldkaart } from './kaartGeo';
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

describe('de landkleuren', () => {
  const { landen, kleuren } = wereldkaart();
  const topo = wereld50m as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const buren = neighbors(topo.objects.countries.geometries);

  it('geeft elk land een kleur', () => {
    expect(kleuren).toHaveLength(landen.features.length);
    expect(kleuren.every(Boolean)).toBe(true);
  });

  it('twee buren hebben nooit dezelfde tint', () => {
    const botsingen = buren.flatMap((bs, i) => bs.filter(j => kleuren[i] === kleuren[j])
      .map(j => `${landen.features[i].properties.name}/${landen.features[j].properties.name}`));
    expect(botsingen).toEqual([]);
  });

  it('elke naam in de woestijnlijst bestaat in de kaart', () => {
    // Een tikfout maakt de Sahara stil groen in plaats van een fout te geven.
    const namen = new Set(landen.features.map(f => f.properties.name));
    expect([...DROGE_LANDEN].filter(n => !namen.has(n))).toEqual([]);
  });

  it('kiest het palet op klimaat', () => {
    expect(klimaat('Antarctica', [0, -80])).toBe('ijs');
    expect(klimaat('Egypt', [30, 26])).toBe('droog');
    expect(klimaat('India', [79, 22])).toBe('groen');
  });

  it('valt terug op een tint uit het palet als alle tinten bezet zijn', () => {
    const zes = [0, 1, 2, 3, 4, 5];
    const k = landKleuren(zes.map(() => 'groen' as const), zes.map(i => zes.filter(j => j !== i)));
    expect(k.every(c => LAND_PALET.groen.includes(c))).toBe(true);
  });
});
