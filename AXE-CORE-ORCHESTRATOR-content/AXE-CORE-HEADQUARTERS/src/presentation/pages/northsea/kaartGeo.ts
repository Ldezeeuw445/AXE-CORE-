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
import { feature } from 'topojson-client';
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
  cache = { landen, land, middelpunten };
  return cache;
}
