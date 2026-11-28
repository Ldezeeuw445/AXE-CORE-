import { describe, expect, it } from 'vitest';
import { knippertOoit, volgendeBlik, volgendeKnipper } from './gezichtLeven';

function reeks(seed = 7) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

describe('gezichtLeven (Luka 27 nov t78u: realistischer, geen loop)', () => {
  it('knippert onregelmatig binnen menselijke grenzen, soms dubbel', () => {
    const r = reeks();
    const k = Array.from({ length: 400 }, () => volgendeKnipper('rust', r));
    const over = k.map((x) => x.over);
    expect(Math.min(...over)).toBeGreaterThanOrEqual(2400);
    expect(Math.max(...over)).toBeLessThanOrEqual(6800);
    expect(new Set(over).size).toBeGreaterThan(200); // geen vaste klok
    const dubbel = k.filter((x) => x.dubbel).length / k.length;
    expect(dubbel).toBeGreaterThan(0.08);
    expect(dubbel).toBeLessThan(0.3);
    for (const x of k) { expect(x.dicht).toBeGreaterThanOrEqual(70); expect(x.dicht).toBeLessThanOrEqual(110); }
  });

  it('wachten knippert vaker dan werken', () => {
    const r = reeks(3);
    const gem = (s: 'wacht' | 'werkt') => Array.from({ length: 300 }, () => volgendeKnipper(s, r).over).reduce((a, b) => a + b) / 300;
    expect(gem('wacht')).toBeLessThan(gem('werkt'));
  });

  it('bij een fout geen knipper en geen blik: de ogen hangen', () => {
    expect(knippertOoit('fout')).toBe(false);
    expect(knippertOoit('rust')).toBe(true);
    expect(volgendeBlik('fout')).toBeNull();
  });

  it('blikken blijven klein, werken kijkt sneller en vaker', () => {
    const r = reeks(11);
    const rust = Array.from({ length: 300 }, () => volgendeBlik('rust', r)!);
    const werkt = Array.from({ length: 300 }, () => volgendeBlik('werkt', r)!);
    for (const b of [...rust, ...werkt]) { expect(Math.abs(b.x)).toBeLessThanOrEqual(2.6); expect(Math.abs(b.y)).toBeLessThanOrEqual(1); }
    const gem = (l: { over: number }[]) => l.reduce((a, b) => a + b.over, 0) / l.length;
    expect(gem(werkt)).toBeLessThan(gem(rust));
    // In rust kijkt hij regelmatig weer recht vooruit.
    expect(rust.filter((b) => b.x === 0 && b.y === 0).length).toBeGreaterThan(60);
  });
});
