import { describe, expect, it } from 'vitest';
import { BASEMAP_MAX_ZOOM } from './basemap';
import { tegelRaster, tegelXY } from './tegels';

/**
 * Tegelrekening tegen bekende punten.
 *
 * Een kaart die er plausibel uitziet maar vijf graden ernaast zit, zie je op
 * een screenshot niet: het is nog steeds een stad. Daarom geen oogcontrole
 * maar bekende tegelnummers — die zijn voor Web Mercator vastgelegd en
 * overal hetzelfde, dus als deze test slaagt staat de kaart echt op de plek
 * waar Luka om vroeg.
 */

describe('welke tegel hoort bij een plek', () => {
  it('nul meridiaan en equator liggen op de grens van de vier middelste tegels', () => {
    // Op zoom 1 is de wereld 2x2 tegels; (0,0) valt op de hoek, dus tegel 1,1.
    expect(tegelXY(0, 0, 1)).toEqual({ x: 1, y: 1 });
  });

  // De getallen hieronder zijn los nagerekend met de andere schrijfwijze van
  // dezelfde formule (asinh(tan φ) in plaats van log(tan φ + 1/cos φ)), zodat
  // ze niet alleen bevestigen wat deze code toevallig doet.
  it('Amsterdam op zoom 13', () => {
    expect(tegelXY(52.3676, 4.9041, 13)).toEqual({ x: 4207, y: 2692 });
  });

  it('Los Angeles op zoom 13 — de westelijke helft, dus een lage x', () => {
    const t = tegelXY(34.0522, -118.2437, 13);
    expect(t).toEqual({ x: 1405, y: 3271 });
    // En een controle op de rekening zelf: westelijk betekent x onder de helft.
    expect(t.x).toBeLessThan(2 ** 13 / 2);
  });

  it('noordelijker is een lagere y', () => {
    expect(tegelXY(60, 5, 10).y).toBeLessThan(tegelXY(40, 5, 10).y);
  });

  it('oostelijker is een hogere x', () => {
    expect(tegelXY(52, 10, 10).x).toBeGreaterThan(tegelXY(52, 4, 10).x);
  });
});

describe('het raster rond een plek', () => {
  it('levert precies kolommen x rijen tegels', () => {
    expect(tegelRaster(52.3676, 4.9041, 13, 3, 2)).toHaveLength(6);
    expect(tegelRaster(52.3676, 4.9041, 13, 5, 5)).toHaveLength(25);
  });

  it('bij een oneven raster staat de plek in de middelste tegel', () => {
    const midden = tegelXY(52.3676, 4.9041, 13);
    const raster = tegelRaster(52.3676, 4.9041, 13, 3, 3);
    expect(raster[4]).toMatchObject({ x: midden.x, y: midden.y });
  });

  it('elke tegel heeft een ondergrond en een laag met namen, met zijn eigen nummers erin', () => {
    const [eerste] = tegelRaster(52.3676, 4.9041, 13, 1, 1);
    expect(eerste.url).toContain(`/${eerste.z}/${eerste.y}/${eerste.x}`);
    expect(eerste.labelUrl).toContain(`/${eerste.z}/${eerste.y}/${eerste.x}`);
    expect(eerste.url).not.toBe(eerste.labelUrl);
    // Geen onvervangen plaatshouders: dan vraagt de browser letterlijk {z} op.
    expect(eerste.url).not.toMatch(/\{[zxy]\}/);
    expect(eerste.labelUrl).not.toMatch(/\{[zxy]\}/);
  });

  it('zoomt niet verder in dan de basiskaart gaat', () => {
    // Esri's canvas stopt bij 16. Verder vragen geeft lege tegels, en een lege
    // tegel ziet eruit als "er is daar niets" in plaats van "te ver ingezoomd".
    expect(tegelRaster(52.3676, 4.9041, 22, 1, 1)[0].z).toBe(BASEMAP_MAX_ZOOM);
    expect(tegelRaster(52.3676, 4.9041, -5, 1, 1)[0].z).toBe(0);
  });

  it('loopt bij de datumgrens om de aarde heen in plaats van naar tegel -1', () => {
    // Fiji ligt op de grens: een raster eromheen vraagt tegels aan beide
    // kanten van 180°. Zonder de modulo wordt dat x = -1 en dus een gat.
    const raster = tegelRaster(-17.7, 179.9, 5, 3, 1);
    expect(raster.every((t) => t.x >= 0 && t.x < 2 ** 5)).toBe(true);
    expect(new Set(raster.map((t) => t.x)).size).toBe(3);
  });

  it('vraagt boven de pool geen tegels die niet bestaan', () => {
    const raster = tegelRaster(85, 0, 3, 3, 3);
    expect(raster.every((t) => t.y >= 0 && t.y < 2 ** 3)).toBe(true);
    expect(raster.length).toBeLessThan(9);
  });
});
