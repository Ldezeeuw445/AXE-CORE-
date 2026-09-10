import { describe, it, expect } from 'vitest';
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';
import {
  pearson, correleerBalken, bouwCorrelatieMatrix, correlatieVoorAgent, MIN_OVERLAP,
} from '@/domain/tradingIntel/correlatie';

const UUR = 3_600_000;

/** Balken op een vast raster, zodat tijdstippen tussen reeksen te delen zijn. */
function balken(sluitingen: number[], startT = 0, stap = UUR): OhlcBar[] {
  return sluitingen.map((c, i) => ({
    t: startT + i * stap, o: c, h: c, l: c, c, v: 0,
  }));
}

/** Genoeg punten om de MIN_OVERLAP-drempel te halen. */
function reeks(n: number, fn: (i: number) => number, startT = 0): OhlcBar[] {
  return balken(Array.from({ length: n }, (_, i) => fn(i)), startT);
}

describe('pearson', () => {
  it('geeft 1 voor een perfect stijgend verband', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
  });

  it('geeft -1 voor een perfect omgekeerd verband', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6);
  });

  it('geeft null zonder spreiding — niet 0', () => {
    // 0 zou lezen als "gemeten, geen verband". Er viel niets te meten.
    expect(pearson([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });

  it('geeft null bij minder dan twee punten', () => {
    expect(pearson([1], [1])).toBeNull();
  });
});

describe('correleerBalken', () => {
  it('correleert op rendement, niet op prijs', () => {
    // Twee reeksen die allebei stijgen maar met tegengestelde stapjes. Op
    // prijs zou dit bijna 1 geven — dat is de trend, niet het instrument.
    const n = MIN_OVERLAP + 10;
    const a = reeks(n, (i) => 100 + i + (i % 2 === 0 ? 0.5 : -0.5));
    const b = reeks(n, (i) => 100 + i + (i % 2 === 0 ? -0.5 : 0.5));

    const { r } = correleerBalken(a, b);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(0);
  });

  it('koppelt op tijdstip en niet op positie', () => {
    // b begint 1000 uur later: geen enkel gedeeld tijdstip, dus niets te
    // correleren — ook al zijn beide reeksen even lang.
    const n = MIN_OVERLAP + 10;
    const a = reeks(n, (i) => 100 + Math.sin(i));
    const b = reeks(n, (i) => 100 + Math.sin(i), 1000 * UUR);

    const { r, punten } = correleerBalken(a, b);
    expect(punten).toBe(0);
    expect(r).toBeNull();
  });

  it('telt alleen de overlap wanneer reeksen deels langs elkaar lopen', () => {
    const a = reeks(60, (i) => 100 + Math.sin(i));
    const b = reeks(60, (i) => 100 + Math.sin(i), 30 * UUR);

    const { punten } = correleerBalken(a, b);
    expect(punten).toBeGreaterThan(0);
    expect(punten).toBeLessThan(60);
  });

  it('weigert een cijfer onder de overlapdrempel', () => {
    const kort = MIN_OVERLAP - 5;
    const a = reeks(kort, (i) => 100 + i);
    const b = reeks(kort, (i) => 100 + i * 2);

    const { r, punten } = correleerBalken(a, b);
    expect(punten).toBeLessThan(MIN_OVERLAP);
    expect(r).toBeNull();
  });
});

describe('bouwCorrelatieMatrix', () => {
  it('laat symbolen zonder bruikbare balken weg', () => {
    const n = MIN_OVERLAP + 5;
    const m = bouwCorrelatieMatrix({
      XAUUSD: reeks(n, (i) => 100 + Math.sin(i)),
      EURUSD: reeks(n, (i) => 1 + Math.cos(i) / 100),
      LEEG: [],
      NIETS: null,
    });

    expect(m.symbolen).toEqual(['EURUSD', 'XAUUSD']);
  });

  it('is symmetrisch met een diagonaal van 1', () => {
    const n = MIN_OVERLAP + 5;
    const m = bouwCorrelatieMatrix({
      A: reeks(n, (i) => 100 + Math.sin(i)),
      B: reeks(n, (i) => 100 + Math.cos(i)),
    });

    expect(m.cellen[0][0]).toBe(1);
    expect(m.cellen[1][1]).toBe(1);
    expect(m.cellen[0][1]).toBe(m.cellen[1][0]);
  });

  it('scheidt "niet gemeten" van "niet gecorreleerd"', () => {
    const m = bouwCorrelatieMatrix({
      A: reeks(MIN_OVERLAP + 5, (i) => 100 + Math.sin(i)),
      B: reeks(5, (i) => 100 + Math.cos(i)),
    });

    expect(m.samenvatting.onvoldoendeData).toHaveLength(1);
    expect(m.samenvatting.meestGecorreleerd).toHaveLength(0);
  });
});

describe('correlatieVoorAgent', () => {
  it('noemt niet-gemeten paren expliciet', () => {
    const m = bouwCorrelatieMatrix({
      A: reeks(MIN_OVERLAP + 5, (i) => 100 + Math.sin(i)),
      B: reeks(5, (i) => 100 + Math.cos(i)),
    });

    const tekst = correlatieVoorAgent(m, 'H1');
    expect(tekst).toContain('Niet berekend');
    expect(tekst).toContain('A~B');
  });

  it('zegt het wanneer spreiding schijn is', () => {
    const n = MIN_OVERLAP + 20;
    const m = bouwCorrelatieMatrix({
      A: reeks(n, (i) => 100 + Math.sin(i)),
      B: reeks(n, (i) => 200 + Math.sin(i) * 2),
    });

    expect(correlatieVoorAgent(m, 'H1')).toContain('geconcentreerd');
  });

  it('valt niet om zonder data', () => {
    expect(correlatieVoorAgent(bouwCorrelatieMatrix({}), 'H1')).toContain('geen data');
  });
});
