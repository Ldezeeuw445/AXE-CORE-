/**
 * De landvormen voor de NorthSea-kaart, en het middelpunt van elk land.
 *
 * ## Waarom niet gewoon geoCentroid
 *
 * geoCentroid neemt het gewogen midden van ALLE delen van een land. Voor
 * Frankrijk telt Frans-Guyana mee, voor de Verenigde Staten Alaska en Hawaï.
 * Het "midden" van Frankrijk ligt dan in de Atlantische Oceaan, en een deal
 * met een Franse koper krijgt een stip in zee. Daarom het midden van het
 * GROOTSTE deel: het vasteland.
 *
 * ## Waarom 50m
 *
 * 110m (105 KB) is te grof voor de look die Luka voor ogen heeft: kustlijnen
 * worden hoekig. 10m (3,5 MB) is voor een wereldkaart op één scherm verspild.
 * 50m (739 KB) laadt alleen als de Maps-tab opent, want die pagina is lazy.
 */
import { feature, neighbors } from 'topojson-client';
import { geoArea, geoCentroid } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import wereld50m from 'world-atlas/countries-50m.json';
import type { Middelpunten } from '@/domain/northsea/kaart';

export type Land = Feature<Geometry, { name: string }>;

export interface Wereld {
  landen: FeatureCollection<Geometry, { name: string }>;
  /** Alle land als één vorm: de kustlijn, iets helderder getekend dan de grenzen. */
  land: FeatureCollection<Geometry>;
  middelpunten: Middelpunten;
  /** Per land (zelfde volgorde als `landen`) de vulkleur. */
  kleuren: string[];
}

/*
 * ## De kleuren van het land
 *
 * Luka wil dat je landen uit elkaar houdt én dat het een beetje echt oogt. Dat
 * zijn twee regels:
 *
 * 1. Het klimaat kiest het PALET. Ijs is grijsblauw, woestijn zandbruin, de rest
 *    gedempt groen. Grof, maar een wereldkaart met een groene Sahara leest als
 *    speelgoed. Droog is een lijst namen en geen breedtegraad-band: op
 *    breedtegraad zou India een woestijn worden en Libië niet.
 * 2. De buren kiezen de TINT. Twee landen die aan elkaar grenzen krijgen binnen
 *    hun palet nooit dezelfde tint (gretig kleuren, drukste landen eerst), zodat
 *    een grens ook zonder lijn te zien is.
 *
 * Donker en gedempt, want het ligt op de plaat en de deals zijn het signaal.
 */
export type Klimaat = 'ijs' | 'droog' | 'groen';

export const LAND_PALET: Record<Klimaat, readonly string[]> = {
  groen: ['#2D4A36', '#3A5A40', '#47694A', '#33533C', '#527251'],
  droog: ['#6B5A3E', '#7B6848', '#8A7753', '#5F5038', '#96815A'],
  ijs: ['#7C8994', '#8D99A3', '#9EA9B1', '#6D7A86', '#B0B9C0'],
};

export const DROGE_LANDEN: ReadonlySet<string> = new Set([
  'Algeria', 'Libya', 'Egypt', 'Mauritania', 'Mali', 'Niger', 'Chad', 'Sudan', 'W. Sahara', 'Morocco', 'Tunisia',
  'Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain', 'Iraq', 'Iran', 'Jordan',
  'Syria', 'Israel', 'Afghanistan', 'Pakistan', 'Turkmenistan', 'Uzbekistan', 'Kazakhstan', 'Mongolia',
  'Australia', 'Namibia', 'Botswana', 'Somalia', 'Djibouti', 'Eritrea',
]);

export function klimaat(naam: string, [, lat]: [number, number]): Klimaat {
  if (naam === 'Antarctica' || naam === 'Greenland' || Math.abs(lat) >= 64) return 'ijs';
  return DROGE_LANDEN.has(naam) ? 'droog' : 'groen';
}

export function landKleuren(soorten: readonly Klimaat[], buren: readonly (readonly number[])[]): string[] {
  const kleur: (string | undefined)[] = new Array(soorten.length);
  const volgorde = soorten.map((_, i) => i).sort((a, b) => (buren[b]?.length ?? 0) - (buren[a]?.length ?? 0));
  for (const i of volgorde) {
    const palet = LAND_PALET[soorten[i]];
    const bezet = new Set((buren[i] ?? []).map(j => kleur[j]));
    kleur[i] = palet.find(c => !bezet.has(c)) ?? palet[i % palet.length];
  }
  return kleur as string[];
}

let cache: Wereld | null = null;

/** Het midden van het grootste deel van een (multi)polygoon. */
export function vastelandMidden(f: Feature<Geometry>): [number, number] {
  const g = f.geometry;
  if (g?.type === 'MultiPolygon') {
    const delen = (g as MultiPolygon).coordinates.map(ringen => ({ type: 'Polygon', coordinates: ringen }) as Polygon);
    const grootste = delen.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
    return geoCentroid(grootste) as [number, number];
  }
  return geoCentroid(f) as [number, number];
}

export function wereldkaart(): Wereld {
  if (cache) return cache;
  const topo = wereld50m as unknown as Topology<{ countries: GeometryCollection<{ name: string }>; land: GeometryCollection }>;
  const landen = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  const land = feature(topo, topo.objects.land) as FeatureCollection<Geometry>;
  const middelpunten = new Map<string, [number, number]>();
  for (const f of landen.features) {
    const naam = f.properties?.name;
    if (naam) middelpunten.set(naam, vastelandMidden(f));
  }
  const soorten = landen.features.map(f => klimaat(f.properties?.name ?? '', vastelandMidden(f)));
  const kleuren = landKleuren(soorten, neighbors(topo.objects.countries.geometries));
  cache = { landen, land, middelpunten, kleuren };
  return cache;
}
