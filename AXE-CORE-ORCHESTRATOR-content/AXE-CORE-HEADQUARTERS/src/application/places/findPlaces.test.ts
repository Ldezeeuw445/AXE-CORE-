import { describe, it, expect, vi, beforeEach } from 'vitest';

const nearby = vi.fn();
const overpass = vi.fn();
const geocode = vi.fn();
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  placesNearby: (...a: unknown[]) => nearby(...a),
  placesOverpass: (...a: unknown[]) => overpass(...a),
  placesGeocode: (...a: unknown[]) => geocode(...a),
}));
vi.mock('@/infrastructure/gateways/locatieService', () => ({
  huidigeLocatie: async () => ({ lat: 51.44, lng: 5.47, bron: 'toestel', naam: 'Eindhoven' }),
}));

import { zoekPlaatsen } from './findPlaces';

const el = (id: number, naam: string, lat: number, lon: number) => ({ type: 'node', id, lat, lon, tags: { name: naam, shop: 'electronics', opening_hours: 'Mo-Fr 09:00-18:00' } });

beforeEach(() => { nearby.mockReset(); overpass.mockReset(); geocode.mockReset(); });

describe('zoekPlaatsen', () => {
  it('neemt de snelle bron en sorteert op afstand, met uren erbij', async () => {
    nearby.mockResolvedValue({ elements: [el(2, 'Ver', 51.46, 5.5), el(1, 'Dichtbij', 51.4405, 5.4705), el(3, 'Midden', 51.45, 5.48)] });
    const r = await zoekPlaatsen({ wat: 'nearest electronics store' });
    if ('fout' in r) throw new Error(r.fout);
    expect(r.plaatsen.map(p => p.naam)).toEqual(['Dichtbij', 'Midden', 'Ver']);
    expect(r.plaatsen[0].openingstijden).toBe('Mo-Fr 09:00-18:00');
    expect(overpass).not.toHaveBeenCalled();
    expect(r.midden.bron).toBe('your device location');
  });

  it('valt terug op Overpass als de snelle bron stuk is', async () => {
    nearby.mockRejectedValue(new Error('502'));
    overpass.mockResolvedValue({ elements: [el(1, 'A', 51.441, 5.47), el(2, 'B', 51.442, 5.471), el(3, 'C', 51.443, 5.472)] });
    const r = await zoekPlaatsen({ wat: 'electronics' });
    if ('fout' in r) throw new Error(r.fout);
    expect(r.plaatsen).toHaveLength(3);
    expect(overpass).toHaveBeenCalledTimes(1);
  });

  it('zegt dat de kaartdienst niet antwoordde als beide stuk zijn, en verzint niets', async () => {
    nearby.mockRejectedValue(new Error('502'));
    overpass.mockRejectedValue(new Error('502'));
    const r = await zoekPlaatsen({ wat: 'electronics' });
    expect(r).toEqual({ fout: expect.stringContaining('did not answer') });
  });

  it('een leeg antwoord is geen storing: het zoekt ruimer en vindt dan wel iets', async () => {
    nearby.mockResolvedValueOnce({ elements: [] }).mockResolvedValue({ elements: [el(1, 'A', 51.45, 5.48), el(2, 'B', 51.46, 5.49), el(3, 'C', 51.47, 5.5)] });
    overpass.mockRejectedValue(new Error('504'));
    const r = await zoekPlaatsen({ wat: 'electronics' });
    if ('fout' in r) throw new Error(r.fout);
    expect(r.plaatsen).toHaveLength(3);
    expect(r.straalM).toBeGreaterThan(1500);
  });

  it('snapt een soort die het niet kent, in plaats van naar de server te gaan', async () => {
    const r = await zoekPlaatsen({ wat: 'blorpfrobnitz' });
    expect('fout' in r).toBe(true);
    expect(nearby).not.toHaveBeenCalled();
  });

  it('zoekt rond een genoemde plek en zegt dat het die plek was', async () => {
    geocode.mockResolvedValue([{ lat: '52.37', lon: '4.89', display_name: 'Dam, Amsterdam, Nederland' }]);
    nearby.mockResolvedValue({ elements: [el(1, 'X', 52.371, 4.891)] });
    const r = await zoekPlaatsen({ wat: 'electronics', nabij: 'Dam' });
    if ('fout' in r) throw new Error(r.fout);
    expect(nearby).toHaveBeenCalledWith(expect.any(Array), 52.37, 4.89, 1500);
    expect(r.midden.bron).toBe('the place you named');
  });
});
