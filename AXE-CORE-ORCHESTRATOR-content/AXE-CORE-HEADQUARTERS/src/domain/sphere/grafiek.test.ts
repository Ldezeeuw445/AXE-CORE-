import { describe, expect, it } from 'vitest';
import { leesCandles, mooieStap, prijsAs, prijsTekst, verandering } from './grafiek';

describe('grafiek in het vak: schaal die klopt', () => {
  it('mooie stappen', () => {
    expect(mooieStap(1000)).toBe(250);
    expect(mooieStap(3)).toBe(1);
    expect(mooieStap(0.07)).toBe(0.02);
  });

  it('een koers rond 95k met 1% beweging schaalt van laag tot hoog, niet vanaf 0', () => {
    const as = prijsAs(94_600, 95_550);
    expect(as.min).toBeGreaterThan(90_000);
    expect(as.min).toBeLessThanOrEqual(94_600);
    expect(as.max).toBeGreaterThanOrEqual(95_550);
    expect(as.ticks.length).toBeGreaterThanOrEqual(3);
    expect(as.ticks[0]).toBe(as.min);
  });

  it('prijs leesbaar met de juiste decimalen', () => {
    expect(prijsTekst(95120.4)).toBe('$95,120');
    expect(prijsTekst(142.37)).toBe('$142.4');
    expect(prijsTekst(0.23411)).toBe('$0.2341');
  });

  it('verandering over het venster en alleen complete candles', () => {
    const c = leesCandles([{ t: 1, o: 100, h: 112, l: 98, c: 110 }, { t: 2, o: 110, h: 111, l: 101 }, 'x']);
    expect(c).toHaveLength(1);
    expect(verandering(c)).toEqual({ laatste: 110, pct: 10, hoog: 112, laag: 98 });
    expect(verandering([])).toBeNull();
  });
});
