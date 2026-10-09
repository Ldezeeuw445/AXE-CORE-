import { describe, it, expect } from 'vitest';
import { afstandMeter, formatAfstand, overpassQuery, plaatsenUitOverpass, plaatsRegel, soortVanVraag } from './plaatsen';

// Luka, 9 okt: "zoek de dichtstbijzijnde elektronicawinkel" en "book een restaurant", met het resultaat op Home.
describe('plaatsen in de buurt', () => {
  it('herkent wat voor plek er gezocht wordt, in het Nederlands en het Engels', () => {
    expect(soortVanVraag('zoek de dichtstbijzijnde elektronicawinkel')?.filters).toContain('shop=electronics');
    expect(soortVanVraag('find a restaurant near the Dam')?.label).toBe('restaurant');
    expect(soortVanVraag('ergens koffie halen')?.label).toBe('café');
    expect(soortVanVraag('waar kan ik tanken')?.filters).toContain('amenity=fuel');
    expect(soortVanVraag('burgers eten')?.label).toBe('fast food');
    expect(soortVanVraag('hoe laat is het')).toBeNull();
  });

  it('afstand: bekende punten kloppen en worden leesbaar', () => {
    const dam = { lat: 52.3731, lng: 4.8932 };
    const centraal = { lat: 52.3791, lng: 4.9003 };
    const m = afstandMeter(dam, centraal);
    expect(m).toBeGreaterThan(700);
    expect(m).toBeLessThan(900);
    expect(afstandMeter(dam, dam)).toBe(0);
    expect(formatAfstand(347)).toBe('350 m');
    expect(formatAfstand(1234)).toBe('1,2 km');
  });

  it('de Overpass-query vraagt knopen en vlakken met een naam binnen de straal', () => {
    const q = overpassQuery(['shop=electronics', 'shop=computer'], 52.37, 4.89, 1500);
    expect(q).toContain('node["shop"="electronics"]["name"](around:1500,52.37,4.89);');
    expect(q).toContain('way["shop"="computer"]["name"](around:1500,52.37,4.89);');
    expect(q.startsWith('[out:json]')).toBe(true);
    expect(q).toContain('out center');
  });

  it('leest het antwoord: sorteert op afstand, voegt dezelfde zaak als knoop en gebouw samen, slaat zonder coördinaat over', () => {
    const json = {
      elements: [
        { type: 'node', id: 1, lat: 52.38, lon: 4.9, tags: { name: 'Ver weg', shop: 'electronics' } },
        { type: 'node', id: 2, lat: 52.3735, lon: 4.8935, tags: { name: 'Dichtbij', shop: 'electronics', 'addr:street': 'Damrak', 'addr:housenumber': '1', 'addr:city': 'Amsterdam', phone: '+31 20 123', opening_hours: 'Mo-Su 09:00-21:00' } },
        { type: 'way', id: 3, center: { lat: 52.3735, lon: 4.8935 }, tags: { name: 'Dichtbij', shop: 'electronics' } },
        { type: 'node', id: 4, tags: { name: 'Zonder plek' } },
        { type: 'node', id: 5, lat: 52.37, lon: 4.89, tags: { shop: 'electronics' } },
      ],
    };
    const lijst = plaatsenUitOverpass(json, { lat: 52.3731, lng: 4.8932 }, 'electronics');
    expect(lijst.map(p => p.naam)).toEqual(['Dichtbij', 'Ver weg']);
    expect(lijst[0]).toMatchObject({ adres: 'Damrak 1, Amsterdam', telefoon: '+31 20 123', openingstijden: 'Mo-Su 09:00-21:00' });
    expect(plaatsRegel(lijst[0])).toMatch(/Dichtbij · \d+ m · Damrak 1, Amsterdam · open Mo-Su 09:00-21:00 · tel \+31 20 123/);
  });
});
