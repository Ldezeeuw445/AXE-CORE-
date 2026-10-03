import { describe, expect, it } from 'vitest';
import {
  LICHT_INKT, STAP, STIP_AFSTAND, TEL_RING,
  bolStand, canvasMaat, dotRijen, hoogteKleur, lichtKleur, maakBinnenbol, maakRijenBol,
  maakRing, maakSchil, pixelRaster, ringMaat, stipMaat,
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

const straal = (a: Float32Array, i: number) => Math.hypot(a[i * STAP], a[i * STAP + 1], a[i * STAP + 2]);

// Luka, 2 okt: de telefoon-sphere vlijmscherp en in het midden van zijn vak.
// 3 okt: op beide platen dezelfde bol, strak rond, in rijen zoals Dot Wave;
// donker in de kleuren van altijd, licht in goud.
describe('de telefoon-sphere', () => {
  // 3 okt: "meer ruimte, zodat het niet een waas is maar echt een bol van
  // particles". Op Luka's iPhone ~4.100 stippen in de schil in plaats van ~10.000.
  it('legt een stip om de 11 schermpixels, met een onder- en bovengrens', () => {
    const { R } = bolStand(660, 585); // Luka's iPhone, canvas op 3x
    expect(STIP_AFSTAND).toBe(11);
    expect(dotRijen(R)).toBe(57);
    expect((Math.PI * R) / dotRijen(R)).toBeGreaterThan(10.5);
    // De binnenbol krijgt dezelfde lucht: geen ondergrens die hem weer dicht maakt.
    const kernR = R * 0.46;
    expect((Math.PI * kernR) / dotRijen(kernR)).toBeGreaterThan(10.5);
    expect(dotRijen(10)).toBe(24);
    expect(dotRijen(5000)).toBe(160);
  });

  it('legt schil en binnenbol strak op de eenheidsbol, in rijen, op beide platen even veel', () => {
    const rijen = 57;
    for (const plaat of ['donker', 'licht'] as const) {
      const schil = maakSchil(rijen, plaat);
      expect(schil).toEqual(maakSchil(rijen, plaat));
      const n = schil.length / STAP;
      expect(n).toBeGreaterThan(0.95 * (4 / Math.PI) * rijen * rijen);
      expect(n).toBeLessThan(1.05 * (4 / Math.PI) * rijen * rijen);
      // Strak rond: geen dikte meer, elke stip precies op de bol.
      for (let i = 0; i < n; i += 97) expect(straal(schil, i)).toBeCloseTo(1, 5);
    }
    expect(maakSchil(rijen, 'donker').length).toBe(maakSchil(rijen, 'licht').length);
    const kern = maakBinnenbol(48);
    for (let i = 0; i < kern.length / STAP; i += 31) expect(straal(kern, i)).toBeCloseTo(1, 5);
    expect(maakRijenBol(48, () => [255, 255, 255]).length % STAP).toBe(0);
  });

  it('houdt op donker het kleurverloop van de bol: groen boven, blauw onder', () => {
    const [rb, gb, bb] = hoogteKleur(-1);
    const [ro, go, bo] = hoogteKleur(1);
    expect(gb).toBeGreaterThan(bb);
    expect(bo).toBeGreaterThan(go);
    expect(bo).toBeGreaterThan(ro);
    expect(rb).toBeCloseTo(150);
    // En de schil gebruikt het ook: de bovenste rij groener dan blauw.
    const schil = maakSchil(57, 'donker');
    const boven = Array.from({ length: 40 }, (_, i) => i * STAP);
    const groen = boven.filter((o) => schil[o + 4] > schil[o + 5]).length;
    expect(groen).toBeGreaterThan(30);
  });

  it('kleurt op licht van bijna zwart bovenaan naar goud onderaan, zoals Dot Wave light', () => {
    expect(lichtKleur(-1)).toEqual([...LICHT_INKT.boven]);
    const [r, g, b] = lichtKleur(1);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  // De lichte plaat is #D5E6F4 (de LICHT-lucht van MobileGlass).
  it('steekt op de lichte plaat af: elke inkt', () => {
    const plaat = [213, 230, 244];
    for (const y of [-1, -0.5, 0, 0.5, 1]) expect(contrast(lichtKleur(y), plaat)).toBeGreaterThan(2.4);
    for (const k of [LICHT_INKT.cyaan, LICHT_INKT.cyaanAchter, LICHT_INKT.goudAchter, LICHT_INKT.goudVoor]) {
      expect(contrast(k, plaat)).toBeGreaterThan(2.4);
    }
  });

  it('legt de ring als een fijne ketting om de evenaar', () => {
    const ring = maakRing();
    expect(ring.length).toBe(TEL_RING * STAP);
    expect(ring).toEqual(maakRing());
    for (let i = 0; i < TEL_RING; i += 7) {
      expect(Math.abs(straal(ring, i) - 1)).toBeLessThan(0.03);
      expect(Math.abs(ring[i * STAP + 1])).toBeLessThanOrEqual(0.01);
    }
  });

  it('tekent een stip vooraan rond een punt breed op een 3x-iPhone, met ruimte eromheen', () => {
    const { R } = bolStand(660, 585);
    const rijen = dotRijen(R);
    const voor = (stipMaat(R, rijen) * 2) / 3; // in punten
    expect(voor).toBeGreaterThan(1.1);
    expect(voor).toBeLessThan(1.8);
    // Een stip beslaat hooguit 40% van de afstand tot de volgende: er is lucht.
    expect((stipMaat(R, rijen) * 2) / ((Math.PI * R) / rijen)).toBeLessThan(0.4);
    expect(stipMaat(1, 160)).toBe(0.75);
    const [achter, voorRing] = ringMaat(R);
    expect(achter).toBeGreaterThanOrEqual(0.8);
    expect(voorRing).toBeGreaterThan(achter);
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
