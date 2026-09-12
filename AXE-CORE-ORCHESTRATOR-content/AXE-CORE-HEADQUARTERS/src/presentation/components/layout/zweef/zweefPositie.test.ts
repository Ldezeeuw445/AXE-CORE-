import { describe, it, expect } from 'vitest';
import {
  MARGE, ankerNaarPunt, beginPositie, bewaarPositie, bewaarVerborgen, klem,
  laadPositie, laadVerborgen, sleutelVan, vergeetPositie,
} from './zweefPositie';

/** Een localStorage zonder browser. */
function opslag(vooraf: Record<string, string> = {}) {
  const m = new Map(Object.entries(vooraf));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

const venster = { b: 1728, h: 1080 };
const telefoon = { b: 204, h: 486 };

describe('klemmen binnen het venster', () => {
  it('laat een plek die past met rust', () => {
    expect(klem({ x: 100, y: 200 }, telefoon, venster)).toEqual({ x: 100, y: 200 });
  });

  it('trekt een zwever die buiten beeld staat terug tot de marge', () => {
    expect(klem({ x: -50, y: -9 }, telefoon, venster)).toEqual({ x: MARGE, y: MARGE });
    expect(klem({ x: 5000, y: 5000 }, telefoon, venster)).toEqual({
      x: venster.b - telefoon.b - MARGE,
      y: venster.h - telefoon.h - MARGE,
    });
  });

  it('een venster kleiner dan de zwever geeft de marge, geen negatief getal', () => {
    expect(klem({ x: 40, y: 40 }, telefoon, { b: 100, h: 100 })).toEqual({ x: MARGE, y: MARGE });
  });

  it('rondt af op hele pixels', () => {
    expect(klem({ x: 10.4, y: 20.6 }, telefoon, venster)).toEqual({ x: 10, y: 21 });
  });
});

describe('het anker', () => {
  it('rekent vanaf de rand die je noemt', () => {
    expect(ankerNaarPunt({ links: 28, onder: 26 }, telefoon, venster)).toEqual({ x: 28, y: 1080 - 486 - 26 });
    expect(ankerNaarPunt({ rechts: 34, boven: 96 }, { b: 232, h: 258 }, venster)).toEqual({ x: 1728 - 232 - 34, y: 96 });
  });

  it('valt zonder anker terug op de marge', () => {
    expect(ankerNaarPunt({}, telefoon, venster)).toEqual({ x: MARGE, y: MARGE });
  });
});

describe('bewaren en terugzetten', () => {
  it('schrijft per sleutel, zodat twee zwevers elkaar niet overschrijven', () => {
    const o = opslag();
    bewaarPositie('telefoon', { x: 28, y: 568 }, o);
    bewaarPositie('bol', { x: 1462, y: 96 }, o);
    expect(laadPositie('telefoon', o)).toEqual({ x: 28, y: 568 });
    expect(laadPositie('bol', o)).toEqual({ x: 1462, y: 96 });
    expect(Object.keys(o.dump())).toEqual([sleutelVan('telefoon'), sleutelVan('bol')]);
  });

  it('geeft niets terug bij rommel in de opslag in plaats van te gooien', () => {
    const o = opslag({
      [sleutelVan('kapot')]: '{niet json',
      [sleutelVan('half')]: JSON.stringify({ x: 'links', y: 3 }),
      [sleutelVan('oneindig')]: JSON.stringify({ x: 1, y: null }),
    });
    expect(laadPositie('kapot', o)).toBeNull();
    expect(laadPositie('half', o)).toBeNull();
    expect(laadPositie('oneindig', o)).toBeNull();
    expect(laadPositie('bestaat-niet', o)).toBeNull();
  });

  it('vergeten haalt alleen die ene sleutel weg', () => {
    const o = opslag();
    bewaarPositie('a', { x: 1, y: 1 }, o);
    bewaarPositie('b', { x: 2, y: 2 }, o);
    vergeetPositie('a', o);
    expect(laadPositie('a', o)).toBeNull();
    expect(laadPositie('b', o)).toEqual({ x: 2, y: 2 });
  });

  it('verborgen is los van de plek: terughalen zet hem waar hij stond', () => {
    const o = opslag();
    bewaarPositie('telefoon', { x: 300, y: 400 }, o);
    bewaarVerborgen('telefoon', true, o);
    expect(laadVerborgen('telefoon', o)).toBe(true);
    expect(laadPositie('telefoon', o)).toEqual({ x: 300, y: 400 });
    bewaarVerborgen('telefoon', false, o);
    expect(laadVerborgen('telefoon', o)).toBe(false);
    expect(laadVerborgen('bol', o)).toBe(false);
  });
});

describe('de beginplek', () => {
  it('neemt wat er bewaard is, en klemt het als het venster kleiner werd', () => {
    const o = opslag();
    bewaarPositie('telefoon', { x: 1400, y: 500 }, o);
    // op een laptop van 1280x800 past 1400 niet meer
    expect(beginPositie('telefoon', { links: 28, onder: 26 }, telefoon, { b: 1280, h: 800 }, o))
      .toEqual({ x: 1280 - 204 - MARGE, y: 800 - 486 - MARGE });
  });

  it('valt zonder opslag terug op het anker', () => {
    expect(beginPositie('telefoon', { links: 28, onder: 26 }, telefoon, venster, opslag()))
      .toEqual({ x: 28, y: 1080 - 486 - 26 });
  });

  it('?reset=1 negeert wat er bewaard is', () => {
    const o = opslag();
    bewaarPositie('telefoon', { x: 900, y: 300 }, o);
    expect(beginPositie('telefoon', { links: 28, onder: 26 }, telefoon, venster, o, true))
      .toEqual({ x: 28, y: 1080 - 486 - 26 });
  });
});
