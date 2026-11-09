/**
 * Van een plek naar de tegels die je moet ophalen.
 *
 * De Web-Mercator-rekening stond als privé-functie in `MapProjection.tsx`, dus
 * elke tweede kaart in de app zou hem opnieuw moeten schrijven — en dat is
 * precies hoe twee kaarten op dezelfde coördinaten op twee plekken belanden.
 * Hier staat hij één keer, zonder DOM, en dus te toetsen tegen bekende
 * coördinaten in plaats van tegen een screenshot.
 *
 * De ondergrond komt uit `basemap.ts`: Esri Dark Gray, gratis en zonder
 * sleutel, met een aparte laag voor de plaatsnamen. Niet de lichte
 * OSM-tegels die `MapProjection` nog gebruikt en daarna met een CSS-filter
 * donker moet maken — dat is een kaart die vecht met zijn eigen scherm.
 */
import { BASEMAP_DARK_LABELS, BASEMAP_DARK_TILES, BASEMAP_MAX_ZOOM } from './basemap';

export interface Tegel {
  x: number;
  y: number;
  z: number;
  /** De ondergrond: wegen en water, zonder namen. */
  url: string;
  /** De laag met plaatsnamen, hierboven te leggen. */
  labelUrl: string;
}

/** Welke tegel bevat dit punt, op dit zoomniveau. */
export function tegelXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function vul(template: string, x: number, y: number, z: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

/**
 * Een raster tegels rond een punt, van linksboven naar rechtsonder.
 *
 * `kolommen` en `rijen` zijn het aantal tegels, niet pixels: een notchstrookje
 * wil 3×2, een groot portaal 5×5. Oneven aantallen zetten de plek precies in
 * het midden; bij een even aantal valt hij een halve tegel links/boven, want
 * er is dan geen middelste tegel. Beter dat dan stilletjes afronden naar een
 * kaart die net niet laat zien waar je om vroeg.
 */
export function tegelRaster(
  lat: number,
  lng: number,
  zoom: number,
  kolommen: number,
  rijen: number,
): Tegel[] {
  const z = Math.max(0, Math.min(BASEMAP_MAX_ZOOM, Math.round(zoom)));
  const { x: cx, y: cy } = tegelXY(lat, lng, z);
  const n = 2 ** z;
  const uit: Tegel[] = [];
  const dx0 = -Math.floor((kolommen - 1) / 2);
  const dy0 = -Math.floor((rijen - 1) / 2);
  for (let r = 0; r < rijen; r += 1) {
    for (let k = 0; k < kolommen; k += 1) {
      // X loopt rond de aardbol, Y niet: boven de noordpool bestaat geen tegel.
      const x = ((cx + dx0 + k) % n + n) % n;
      const y = cy + dy0 + r;
      if (y < 0 || y >= n) continue;
      uit.push({
        x,
        y,
        z,
        url: vul(BASEMAP_DARK_TILES[0], x, y, z),
        labelUrl: vul(BASEMAP_DARK_LABELS[0], x, y, z),
      });
    }
  }
  return uit;
}
