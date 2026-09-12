import { describe, expect, it } from 'vitest';
import { BOL_MAX, BOL_MIN, bolCanvas, bolDoorsnee, bolStandaardPlek, bolZweverMaat } from './bolPlek';
import { leesPx, schilMaten } from './schilMaten';

describe('de bol past in de marge naast de band', () => {
  it('is op 1728 breed 271 en staat gecentreerd in de marge, zonder de band te raken', () => {
    const venster = { b: 1728, h: 1080 };
    const bandRechts = 1441;
    const d = bolDoorsnee(venster.b - bandRechts);
    expect(d).toBe(271);
    const maat = bolZweverMaat(d);
    const p = bolStandaardPlek(venster, bandRechts, maat);
    expect(p.y).toBe(96);
    expect(p.x).toBeGreaterThanOrEqual(bandRechts);
    expect(p.x + maat.b).toBeLessThanOrEqual(venster.b - 8);
    // midden van de marge is 1584,5
    expect(p.x + maat.b / 2).toBeCloseTo(1584.5, -1);
  });

  it('krimpt mee met een smalle marge, maar niet onder 180', () => {
    expect(bolDoorsnee(190)).toBe(BOL_MIN);
    expect(bolDoorsnee(120)).toBe(BOL_MIN);
    expect(bolDoorsnee(600)).toBe(BOL_MAX);
  });

  it('heeft een canvas van bol / 0,57 en een zwever van bol + 40', () => {
    expect(bolCanvas(271)).toBe(475);
    expect(bolZweverMaat(271)).toEqual({ b: 271, h: 311 });
  });

  it('blijft binnen het venster als de marge kleiner is dan de bol', () => {
    const venster = { b: 1300, h: 800 };
    const maat = bolZweverMaat(bolDoorsnee(150));
    const p = bolStandaardPlek(venster, 1150, maat);
    expect(p.x + maat.b).toBeLessThanOrEqual(venster.b - 8);
  });
});

describe('de maten van de schil', () => {
  it('leest px-tokens en valt terug op de gemeten waarden', () => {
    expect(leesPx('287px', 100)).toBe(287);
    expect(leesPx('', 100)).toBe(100);
    expect(leesPx(null, 100)).toBe(100);
    expect(leesPx('abc', 100)).toBe(100);
  });

  it('rekent de rechterkant van de band uit de rechtermarge', () => {
    const m = schilMaten({ b: 1728, h: 1080 }, { chatLinks: '287px', chatRechts: '287px', railOnder: '204px' });
    expect(m).toEqual({ venster: { b: 1728, h: 1080 }, bandLinks: 287, bandRechts: 1441, onderChroom: 204 });
  });
});
