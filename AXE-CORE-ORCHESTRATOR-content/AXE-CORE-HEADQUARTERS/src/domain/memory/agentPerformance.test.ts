import { describe, it, expect } from 'vitest';
import { volgendePrestatie, vertrouwenVan } from './agentPerformance';

describe('volgendePrestatie', () => {
  it('telt door over meerdere metingen', () => {
    // Dit was de bug: de spread van de oude waarde stond achteraan, dus de
    // opgehoogde teller werd meteen weer overschreven en total bleef staan.
    let p = volgendePrestatie(null, true, 100);
    expect(p.total).toBe(1);

    p = volgendePrestatie(p, true, 120);
    expect(p.total).toBe(2);

    p = volgendePrestatie(p, false, 140);
    expect(p.total).toBe(3);
    expect(p.successes).toBe(2);
  });

  it('bewaart velden die wij niet kennen', () => {
    const p = volgendePrestatie({ total: 1, successes: 1, latency: 10, notitie: 'blijft' }, true, 20);
    expect(p.notitie).toBe('blijft');
    expect(p.total).toBe(2);
  });

  it('laat een onbekend veld de tellers niet overschrijven', () => {
    const p = volgendePrestatie({ total: 5, successes: 5, latency: 1 }, false, 30);
    expect(p.total).toBe(6);
    expect(p.successes).toBe(5);
    expect(p.latency).toBe(30);
  });

  it('overleeft een kapotte vorige waarde', () => {
    const p = volgendePrestatie({ total: 'kapot', successes: null, latency: undefined }, true, 50);
    expect(p.total).toBe(1);
    expect(p.successes).toBe(1);
  });
});

describe('vertrouwenVan', () => {
  it('geeft bij de eerste meting een startwaarde, geen 0 of 1', () => {
    // Eén mislukking maakt een agent niet waardeloos.
    expect(vertrouwenVan({ total: 1, successes: 0, latency: 0 }, false)).toBe(0.3);
    expect(vertrouwenVan({ total: 1, successes: 1, latency: 0 }, true)).toBe(0.7);
  });

  it('is daarna gewoon het slaagpercentage', () => {
    expect(vertrouwenVan({ total: 4, successes: 3, latency: 0 }, true)).toBe(0.75);
  });
});
