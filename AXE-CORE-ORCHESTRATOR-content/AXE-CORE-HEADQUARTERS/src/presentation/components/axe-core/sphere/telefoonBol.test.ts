import { describe, expect, it } from 'vitest';
import {
  DOT_INKT, STAP,
  bolStand, canvasMaat, dotMaat, dotRijen, maakDotWave, pixelRaster,
} from './telefoonBol';

/** WCAG-contrast tussen twee sRGB-kleuren (0..255). */
function contrast(a: readonly number[], b: readonly number[]) {
  const lum = (k: readonly number[]) => {
    const [r, g, bl] = k.map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Luka, 2 okt: Dot Wave op de telefoon-Home, gekozen in "AXE Sphere Studio".
describe('de telefoon-sphere (Dot Wave)', () => {
  it('legt een stip om de ~7 schermpixels, met een onder- en bovengrens', () => {
    // Luka's iPhone: canvas 660 x 585 op 3x, straal 0.34 van de korte kant.
    const { R } = bolStand(660, 585);
    expect(dotRijen(R)).toBe(89);
    expect(dotRijen(10)).toBe(48);
    expect(dotRijen(5000)).toBe(160);
  });

  it('ligt op de eenheidsbol, in rijen, en ziet er bij elke start hetzelfde uit', () => {
    const rijen = 89;
    const dots = maakDotWave(rijen);
    expect(dots).toEqual(maakDotWave(rijen));
    const n = dots.length / STAP;
    // Een bol van rijen: ~ (4/pi) * rijen^2 stippen.
    expect(n).toBeGreaterThan(0.95 * (4 / Math.PI) * rijen * rijen);
    expect(n).toBeLessThan(1.05 * (4 / Math.PI) * rijen * rijen);
    for (let i = 0; i < n; i += 97) {
      expect(Math.hypot(dots[i * STAP], dots[i * STAP + 1], dots[i * STAP + 2])).toBeCloseTo(1, 5);
    }
  });

  it('tekent een stip vooraan rond een punt breed op een 3x-iPhone, en op licht groter', () => {
    const { R } = bolStand(660, 585);
    const rijen = dotRijen(R);
    const donker = (dotMaat(R, rijen, 'donker') * 2) / 3;
    const licht = (dotMaat(R, rijen, 'licht') * 2) / 3;
    expect(donker).toBeGreaterThan(0.8);
    expect(donker).toBeLessThan(1.3);
    expect(licht).toBeGreaterThan(donker);
    expect(dotMaat(1, 160, 'donker')).toBe(0.75);
  });

  // "Op light mode zie je hem niet zo goed" (Luka, 2 okt). De lichte plaat is
  // #D5E6F4 (de LICHT-lucht van MobileGlass); elke inktkleur moet daar tegen
  // afsteken, en de achterkant moet dichter zijn dan op donker.
  it('steekt op de lichte plaat af: inkt in plaats van licht', () => {
    const plaat = [213, 230, 244];
    const { boven, onder, rand, top, alfa } = DOT_INKT.licht;
    for (const k of [boven, onder, rand, top]) expect(contrast(k, plaat)).toBeGreaterThan(2.4);
    expect(contrast(boven, plaat)).toBeGreaterThan(10);
    expect(alfa[0]).toBeGreaterThan(DOT_INKT.donker.alfa[0]);
    // Op donker blijft het licht: elke kleur ruim boven de zwarte plaat.
    for (const k of [DOT_INKT.donker.boven, DOT_INKT.donker.onder]) expect(contrast(k, [0, 0, 0])).toBeGreaterThan(5);
  });

  it('staat in het midden van zijn vak, niet op 36% zoals op de plaat', () => {
    expect(bolStand(714, 537)).toEqual({ cx: 357, cy: 268.5, R: 537 * 0.34 });
  });

  it('geeft het canvas precies één pixel per schermpixel', () => {
    expect(canvasMaat(237.4, 179.2, 3)).toEqual({ W: 712, H: 537, cssW: 712 / 3, cssH: 179 });
  });

  it('schuift het canvas terug op het pixelraster als het vak op een halve pixel begint', () => {
    expect(pixelRaster(84.5, 96, 3)).toEqual({ x: -0.5 / 3, y: 0 });
    expect(pixelRaster(84, 96, 3)).toEqual({ x: 0, y: 0 });
    const s = pixelRaster(84.2, 96.7, 3);
    expect(((84.2 + s.x) * 3) % 1).toBeCloseTo(0, 6);
    expect(((96.7 + s.y) * 3) % 1).toBeCloseTo(0, 6);
  });
});
