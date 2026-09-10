import { describe, it, expect } from 'vitest';
import { balkDuurMs, minutenNodig, vouwBalken } from '@/domain/tradingIntel/candleAggregation';
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';

const UUR = 3_600_000;
/** Minuutbalken vanaf een heel uur. */
function minuten(vanaf: number, n: number, prijs: (i: number) => number): OhlcBar[] {
  return Array.from({ length: n }, (_, i) => ({
    t: vanaf + i * 60_000,
    o: prijs(i), h: prijs(i) + 1, l: prijs(i) - 1, c: prijs(i) + 0.5, v: 2,
  }));
}

describe('minuutbalken vouwen', () => {
  it('neemt open van de eerste, close van de laatste, high en low van alles', () => {
    const uit = vouwBalken(minuten(UUR, 60, i => 100 + i), 'h1');
    expect(uit).toHaveLength(1);
    expect(uit[0].o).toBe(100);
    expect(uit[0].c).toBe(159.5);
    expect(uit[0].h).toBe(160);
    expect(uit[0].l).toBe(99);
    expect(uit[0].v).toBe(120);
  });

  it('legt de emmers op de klok, niet op de eerste rij', () => {
    // Begin halverwege een uur: de eerste balk hoort nog steeds op het hele
    // uur te beginnen. Anders geeft dezelfde data een andere grafiek zodra je
    // een minuut eerder begint op te halen.
    const uit = vouwBalken(minuten(UUR + 30 * 60_000, 60, () => 100), 'h1');
    expect(uit[0].t).toBe(UUR);
    expect(uit[1].t).toBe(UUR * 2);
  });

  it('vouwt ongesorteerde data toch goed', () => {
    const bars = minuten(UUR, 5, i => 100 + i);
    const doorelkaar = [bars[3], bars[0], bars[4], bars[1], bars[2]];
    const uit = vouwBalken(doorelkaar, 'h1');
    expect(uit[0].o).toBe(100);
    expect(uit[0].c).toBe(104.5);
  });

  it('laat balken met rust die al even lang zijn', () => {
    const bars = minuten(UUR, 3, () => 100);
    expect(vouwBalken(bars, 'm1')).toEqual(bars);
  });

  it('geeft een lege lijst terug op lege invoer', () => {
    expect(vouwBalken([], 'h1')).toEqual([]);
  });
});

describe('hoeveel minuten je moet ophalen', () => {
  it('rekent per balk, met marge voor gaten in de markt', () => {
    // Zonder marge kom je bij d1 structureel balken tekort: weekenden en uren
    // zonder handel leveren geen rijen.
    expect(minutenNodig(10, 'h1')).toBe(840);
    expect(minutenNodig(60, 'm1')).toBe(84);
  });

  it('houdt het binnen wat een verzoek aankan', () => {
    expect(minutenNodig(500, 'd1')).toBeLessThanOrEqual(20_000);
  });

  it('kent de gewone timeframes en valt terug op een uur', () => {
    expect(balkDuurMs('d1')).toBe(86_400_000);
    expect(balkDuurMs('onzin')).toBe(UUR);
  });
});
