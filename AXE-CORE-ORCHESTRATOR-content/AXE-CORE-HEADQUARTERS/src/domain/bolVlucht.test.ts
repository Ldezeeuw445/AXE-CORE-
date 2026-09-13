import { describe, it, expect } from 'vitest';
import { randPunt, kiesDoel, isZichtbaar, boog, zacht } from './bolVlucht';

const r = { x: 100, y: 100, b: 200, h: 100 };
const venster = { b: 1440, h: 900 };

describe('de vlucht van de bol', () => {
  it('legt punten op de rand, rondom', () => {
    const bijna = (p: { x: number; y: number }, x: number, y: number) => { expect(p.x).toBeCloseTo(x); expect(p.y).toBeCloseTo(y); };
    bijna(randPunt(r, 0, 0), 100, 100);
    bijna(randPunt(r, 200 / 600, 0), 300, 100);
    bijna(randPunt(r, 0.5, 0), 300, 200);
    const q = randPunt(r, 0.25, 0);
    bijna(randPunt(r, 1.25, 0), q.x, q.y);
  });

  it('kiest het eerste zichtbare doel en slaat onzichtbare over', () => {
    const vind = (d: string) => ({ editor: null, verborgen: { x: -500, y: 0, b: 100, h: 100 }, '/memory': r } as Record<string, typeof r | null>)[d] ?? null;
    expect(kiesDoel(['editor', 'verborgen', '/memory'], vind, venster)).toEqual({ doel: '/memory', rect: r });
    expect(kiesDoel(['editor'], vind, venster)).toBeNull();
    expect(isZichtbaar({ x: 10, y: 10, b: 4, h: 40 }, venster)).toBe(false);
  });

  it('begint en eindigt precies op begin en doel', () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 50 };
    expect(boog(a, b, 0, 40)).toEqual(a);
    const eind = boog(a, b, 1, 40);
    expect(eind.x).toBeCloseTo(100); expect(eind.y).toBeCloseTo(50);
    expect(zacht(0.5)).toBeCloseTo(0.5);
  });
});
