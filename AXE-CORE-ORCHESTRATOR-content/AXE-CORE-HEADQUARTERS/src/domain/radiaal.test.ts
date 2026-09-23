import { describe, it, expect } from 'vitest';
import { radiaalPosities } from '@/domain/radiaal';

const bijna = (a: number, b: number) => Math.abs(a - b) < 0.01;

describe('radiale posities', () => {
  it('legt één item op de starthoek, niet in het midden', () => {
    // Delen door (aantal - 1) geeft hier 0/0. Zonder deze tak landt de enige
    // knop op het middelpunt en lijkt hij te ontbreken.
    const [p] = radiaalPosities(1, { straal: 100 });
    expect(bijna(p.x, 0)).toBe(true);
    expect(bijna(p.y, -100)).toBe(true);
  });

  it('nul graden is BOVEN', () => {
    // Niet de wiskundige afspraak, en met opzet: "de eerste staat bovenaan" is
    // hoe een mens een menu beschrijft.
    const [p] = radiaalPosities(4, { straal: 50 });
    expect(bijna(p.y, -50)).toBe(true);
  });

  it('loopt met de klok mee', () => {
    const [, tweede] = radiaalPosities(4, { straal: 50 });
    expect(tweede.x).toBeGreaterThan(0);
    expect(bijna(tweede.y, 0)).toBe(true);
  });

  it('verdeelt een volle ring door n en niet door n-1', () => {
    // Anders vallen de eerste en de laatste op hetzelfde punt: 0 en 360 graden
    // zijn dezelfde plek.
    const p = radiaalPosities(4, { straal: 50 });
    expect(p.map(x => x.hoek)).toEqual([0, 90, 180, 270]);
  });

  it('verdeelt een halve boog wél door n-1, zodat begin en eind erbij horen', () => {
    const p = radiaalPosities(3, { straal: 10, boog: 180 });
    expect(p.map(x => x.hoek)).toEqual([0, 90, 180]);
  });

  it('respecteert een starthoek', () => {
    const p = radiaalPosities(2, { straal: 10, startHoek: 45, boog: 90 });
    expect(p.map(x => x.hoek)).toEqual([45, 135]);
  });

  it('geeft een lege lijst bij nul of negatief', () => {
    expect(radiaalPosities(0, { straal: 10 })).toEqual([]);
    expect(radiaalPosities(-3, { straal: 10 })).toEqual([]);
  });

  it('houdt elk punt op de straal', () => {
    for (const p of radiaalPosities(7, { straal: 80 })) {
      expect(bijna(Math.hypot(p.x, p.y), 80)).toBe(true);
    }
  });
});
