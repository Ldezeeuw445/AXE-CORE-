import { describe, expect, it } from 'vitest';
import {
  LICHT_INKT, STAP, TEL_KERN, TEL_RING, TEL_SCHIL, TEL_STOF,
  bolStand, canvasMaat, deeltjesMaat, dotRijen, hoogteKleur, lichtKleur, lichtMaat,
  maakLichteSchil, maakRijenBol, maakTelefoonBol, pixelRaster,
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

// Luka, 2 okt: de telefoon-sphere vlijmscherp, met meer en kleinere deeltjes,
// en in het midden van zijn vak. Goedgekeurd in de artifact "AXE Core Sphere".
describe('de telefoon-sphere', () => {
  it('heeft ruim twee keer zoveel deeltjes als AxeCoreSphere telefoon', () => {
    const bol = maakTelefoonBol();
    expect(bol.schil.length).toBe(TEL_SCHIL * STAP);
    expect(bol.kern.length).toBe(TEL_KERN * STAP);
    expect(bol.ring.length).toBe(TEL_RING * STAP);
    expect(bol.stof.length).toBe(TEL_STOF * STAP);
    expect(TEL_SCHIL + TEL_KERN + TEL_RING).toBeGreaterThan(2 * (2600 + 900 + 180));
  });

  it('ziet er bij elke start hetzelfde uit', () => {
    expect(maakTelefoonBol().schil).toEqual(maakTelefoonBol().schil);
  });

  it('legt de schil dun maar met diepte net onder de eenheidsbol, en het stof erbuiten', () => {
    const { schil, stof } = maakTelefoonBol();
    const straal = (a: Float32Array, i: number) => Math.hypot(a[i * STAP], a[i * STAP + 1], a[i * STAP + 2]);
    const schilStralen = Array.from({ length: TEL_SCHIL }, (_, i) => straal(schil, i));
    expect(Math.min(...schilStralen)).toBeGreaterThanOrEqual(0.964);
    expect(Math.max(...schilStralen)).toBeLessThanOrEqual(1.0001);
    const stofStralen = Array.from({ length: TEL_STOF }, (_, i) => straal(stof, i));
    expect(Math.min(...stofStralen)).toBeGreaterThan(1.04);
  });

  it('houdt het kleurverloop van de huidige bol: groen boven, blauw onder', () => {
    const [rb, gb, bb] = hoogteKleur(-1);
    const [ro, go, bo] = hoogteKleur(1);
    expect(gb).toBeGreaterThan(bb);
    expect(bo).toBeGreaterThan(go);
    expect(bo).toBeGreaterThan(ro);
    expect(rb).toBeCloseTo(150);
  });

  it('staat in het midden van zijn vak, niet op 36% zoals op de plaat', () => {
    expect(bolStand(714, 537)).toEqual({ cx: 357, cy: 268.5, R: 537 * 0.34 });
  });

  it('tekent een deeltje vooraan als een halve punt op een 3x-iPhone, en nooit onzichtbaar klein', () => {
    // Luka's iPhone: vak 238 x 179 pt, op 3x.
    const { R } = bolStand(238 * 3, 179 * 3);
    const m = deeltjesMaat(R, 1, 0.9);
    expect(m.schil[1] * 2 / 3).toBeGreaterThan(0.9);
    expect(m.schil[1] * 2 / 3).toBeLessThan(1.4);
    for (const [achter, voor] of [m.schil, m.kern, m.ring, m.stof]) {
      expect(achter).toBeGreaterThanOrEqual(0.62);
      expect(voor).toBeGreaterThanOrEqual(achter);
    }
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

// Luka, 3 okt: op donker de AXE-sphere zoals hij is, op licht dezelfde bol in
// de stippen en kleuren van Dot Wave -- "die zie je wel goed op light mode".
describe('de telefoon-sphere op de lichte plaat', () => {
  // De lichte plaat is #D5E6F4 (de LICHT-lucht van MobileGlass).
  const plaat = [213, 230, 244];

  it('legt een stip om de ~7 schermpixels, met een onder- en bovengrens', () => {
    const { R } = bolStand(660, 585); // Luka's iPhone, canvas op 3x
    expect(dotRijen(R)).toBe(89);
    expect(dotRijen(10)).toBe(48);
    expect(dotRijen(5000)).toBe(160);
  });

  it('legt de schil in rijen op de eenheidsbol, in het formaat van de donkere bol', () => {
    const rijen = 89;
    const schil = maakLichteSchil(rijen);
    expect(schil).toEqual(maakLichteSchil(rijen));
    const n = schil.length / STAP;
    expect(n).toBeGreaterThan(0.95 * (4 / Math.PI) * rijen * rijen);
    expect(n).toBeLessThan(1.05 * (4 / Math.PI) * rijen * rijen);
    for (let i = 0; i < n; i += 97) {
      expect(Math.hypot(schil[i * STAP], schil[i * STAP + 1], schil[i * STAP + 2])).toBeCloseTo(1, 5);
    }
    expect(maakRijenBol(48, () => [255, 255, 255]).length % STAP).toBe(0);
  });

  it('kleurt van bijna zwart bovenaan naar goud onderaan, zoals Dot Wave light', () => {
    expect(lichtKleur(-1)).toEqual([...LICHT_INKT.boven]);
    const [r, g, b] = lichtKleur(1);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('steekt af tegen de lichte plaat: elke inkt, en de stippen zijn groot genoeg', () => {
    for (const y of [-1, -0.5, 0, 0.5, 1]) expect(contrast(lichtKleur(y), plaat)).toBeGreaterThan(2.4);
    for (const k of [LICHT_INKT.cyaan, LICHT_INKT.cyaanAchter, LICHT_INKT.goudAchter, LICHT_INKT.goudVoor]) {
      expect(contrast(k, plaat)).toBeGreaterThan(2.4);
    }
    const { R } = bolStand(660, 585);
    const voor = (lichtMaat(R, dotRijen(R)) * 2) / 3; // in punten
    expect(voor).toBeGreaterThan(1.1);
    expect(voor).toBeLessThan(1.8);
    expect(lichtMaat(1, 160)).toBe(0.75);
  });
});
