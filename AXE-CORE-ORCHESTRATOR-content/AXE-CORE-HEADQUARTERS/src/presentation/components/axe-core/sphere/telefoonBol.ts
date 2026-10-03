/**
 * De rekenkant van de telefoon-sphere: stippen, kleuren, maten, pixelraster.
 *
 * Los van TelefoonSphere.tsx, omdat dit is wat je wilt kunnen nameten zonder
 * WebGL: hoeveel stippen, hoe groot op een 3x-scherm, welke kleur op welke
 * plaat, waar het midden zit, en of het canvas op het pixelraster valt.
 *
 * De bol: een schil, een binnenbol, een gouden ring om de evenaar en een hart.
 * Schil en binnenbol liggen in rijen stippen op breedtegraden, zoals Dot Wave
 * -- strak rond, geen korrel (Luka, 3 okt). Daarvoor lag de schil als een
 * geschudde spiraal met dikte en een laagje stof erbuiten; op donker oogde dat
 * korrelig naast de lichte bol.
 *
 * Eén bol, twee platen:
 *   donker  de kleuren die hij altijd had: groen boven, cyaan, blauw onder,
 *           een koelwitte binnenbol, gouden ring, wit heet hart, licht dat gloeit
 *   licht   inkt: bijna zwart naar goud, een cyaan binnenbol en een gouden ring
 *           (Dot Wave light, waar Luka hem goed zag). Zie LICHT_INKT.
 */

/** Per stip: x y z, r g b (0..1), zaadje (0..1). */
export const STAP = 7;

/** De ring: een fijne ketting van zoveel stippen om de evenaar. */
export const TEL_RING = 480;

export type Plaat = 'donker' | 'licht';

type Rgb = readonly [number, number, number];

/** Vaste reeks, zodat de bol er bij elke start hetzelfde uitziet. */
function zaadReeks(zaad = 0x5eed1234): () => number {
  let s = zaad | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dezelfde afwijkers als AxeCoreSphere: vooral koelwit, een vleug kleur. */
const PALET: ReadonlyArray<Rgb> = [
  ...Array<Rgb>(64).fill([214, 228, 255]),
  ...Array<Rgb>(12).fill([34, 211, 238]),
  ...Array<Rgb>(5).fill([59, 130, 246]),
  ...Array<Rgb>(4).fill([167, 139, 250]),
  ...Array<Rgb>(3).fill([20, 184, 166]),
  ...Array<Rgb>(2).fill([245, 159, 36]),
];

/**
 * Het hoogteverloop van AxeCoreSphere: groen boven, cyaan midden, blauw onder.
 * y groeit naar beneden (schermrichting), dus y = +1 is de onderkant.
 */
export function hoogteKleur(y: number): [number, number, number] {
  const g = (1 + y) / 2;
  return g < 0.42
    ? [150 - g * 90, 230 - g * 40, 120 + g * 250]
    : [60 - (g - 0.42) * 40, 200 - (g - 0.42) * 150, 240 - (g - 0.42) * 30];
}

/**
 * Inkt op de lichte plaat, uit Dot Wave light (2 okt): de schil van bijna
 * zwart bovenaan naar goud en geel onderaan, de binnenbol cyaan, de ring goud.
 * Achter- en voorkleur per laag, zoals de tint van de donkere bol.
 */
export const LICHT_INKT = {
  boven: [22, 34, 54] as Rgb,
  onder: [161, 98, 7] as Rgb,
  rand: [194, 136, 15] as Rgb,
  cyaan: [8, 145, 178] as Rgb,
  cyaanAchter: [14, 116, 144] as Rgb,
  goudAchter: [161, 98, 7] as Rgb,
  goudVoor: [194, 136, 15] as Rgb,
};

const glad = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const meng = (a: Rgb, b: Rgb, t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Het verloop van Dot Wave light. y groeit naar beneden: +1 is de onderkant. */
export function lichtKleur(y: number): [number, number, number] {
  const g = (1 + y) / 2;
  const c = meng(LICHT_INKT.boven, LICHT_INKT.onder, glad(0.3, 0.78, g));
  return meng(c, LICHT_INKT.rand, glad(0.74, 1, g) * 0.85);
}

/**
 * Afstand tussen twee stippen langs een meridiaan, in schermpixels. Was 7
 * (Dot Wave): op de telefoon las de bol dan als een waas, de rijen van voor- en
 * achterkant liepen in elkaar (Luka, 3 okt: "meer ruimte, zodat het echt een
 * bol van particles is"). Op 11 heeft elke stip lucht om zich heen.
 */
export const STIP_AFSTAND = 11;

/**
 * Hoeveel rijen bij een straal van R schermpixels: een stip om de
 * STIP_AFSTAND pixels, wat de maat ook is. De ondergrens is laag genoeg dat ook
 * de binnenbol (0,46 van de straal) die lucht krijgt.
 */
export function dotRijen(R: number): number {
  return Math.round(Math.min(160, Math.max(24, (Math.PI * R) / STIP_AFSTAND)));
}

/**
 * Een bol van rijen stippen op breedtegraden, om en om een halve stap
 * verschoven: het rasterbeeld van Dot Wave, strak op de eenheidsbol.
 */
export function maakRijenBol(rijen: number, kleur: (y: number) => Rgb, zaad?: number): Float32Array {
  const rnd = zaadReeks(zaad);
  const uit: number[] = [];
  for (let i = 0; i < rijen; i++) {
    const lat = -Math.PI / 2 + (Math.PI * (i + 0.5)) / rijen;
    const c = Math.cos(lat);
    const y = Math.sin(lat);
    const n = Math.max(3, Math.round(2 * rijen * c));
    const verschuif = ((i % 2) * Math.PI) / n;
    for (let k = 0; k < n; k++) {
      const a = verschuif + (k * 2 * Math.PI) / n;
      const [r, g, b] = kleur(y);
      uit.push(c * Math.cos(a), y, c * Math.sin(a), r / 255, g / 255, b / 255, rnd());
    }
  }
  return new Float32Array(uit);
}

/** De schil per plaat, in dezelfde rijen. */
export function maakSchil(rijen: number, plaat: Plaat): Float32Array {
  if (plaat === 'licht') {
    // Het Dot Wave-verloop, met een vleug cyaan (5%) erdoorheen.
    const rnd = zaadReeks(0x11c47);
    return maakRijenBol(rijen, (y) => (rnd() < 0.05 ? LICHT_INKT.cyaan : lichtKleur(y)));
  }
  // De kleuren van altijd: het hoogteverloop, een fractie lichter of donkerder
  // per stip, en 6% afwijkers uit het palet.
  const rnd = zaadReeks(0xd0c4e1);
  return maakRijenBol(rijen, (y) => {
    if (rnd() < 0.06) return PALET[Math.floor(rnd() * PALET.length)];
    const c = hoogteKleur(y);
    const k = 0.93 + rnd() * 0.14;
    return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  });
}

/** De binnenbol: wit, zijn kleur komt in de shader (achter- en voorkleur). */
export function maakBinnenbol(rijen: number): Float32Array {
  return maakRijenBol(rijen, () => [255, 255, 255], 0xb177e1);
}

/** De ring: een fijne ketting om de evenaar, met een smalle band in breedte en hoogte. */
export function maakRing(): Float32Array {
  const rnd = zaadReeks(0x417e);
  const ring = new Float32Array(TEL_RING * STAP);
  for (let i = 0; i < TEL_RING; i++) {
    const a = (i / TEL_RING) * Math.PI * 2 + (rnd() - 0.5) * 0.006;
    const rr = 1 + (rnd() - 0.5) * 0.035;
    const o = i * STAP;
    ring[o] = Math.cos(a) * rr; ring[o + 1] = (rnd() - 0.5) * 0.02; ring[o + 2] = Math.sin(a) * rr;
    ring[o + 3] = 1; ring[o + 4] = 1; ring[o + 5] = 1; ring[o + 6] = rnd();
  }
  return ring;
}

/**
 * Straal van een stip vooraan, in schermpixels: 0,19 van de rijafstand, nooit
 * onzichtbaar. Op 11 pixels afstand is dat ~2 pixels, net als eerst: de stip
 * blijft even groot, alleen de ruimte eromheen groeit.
 */
export function stipMaat(R: number, rijen: number): number {
  return Math.max(0.75, ((Math.PI * R) / rijen) * 0.19);
}

/** Straal van een ringstip achteraan en vooraan, op de onderlinge afstand geschaald. */
export function ringMaat(R: number): Bereik {
  const afstand = (R * 0.74 * Math.PI * 2) / TEL_RING;
  return [Math.max(0.8, afstand * 0.55), Math.max(0.97, afstand * 0.83)];
}

/**
 * Midden en straal, in canvaspixels.
 *
 * In het MIDDEN van zijn vak (Luka, 2 okt): op de telefoon staat het label
 * "AXE CORE · ONLINE" onder het vak van de bol, niet erin, dus er is geen
 * reden om hem op te tillen. AxeCoreSphere zet hem op 36% van de hoogte; dat
 * is voor de plaat en de iPad, waar de composer dichtbij komt.
 */
export function bolStand(w: number, h: number, zoom = 1): { cx: number; cy: number; R: number } {
  return { cx: w / 2, cy: h / 2, R: Math.min(w, h) * 0.34 * zoom };
}

export type Bereik = readonly [number, number];

/**
 * Canvasmaat: precies één canvaspixel per schermpixel.
 *
 * Het canvas stond op 100% van zijn vak, en `Math.round(breedte * dpr)` week
 * daar een fractie van af: dan schaalt de browser het hele beeld een heel klein
 * beetje, en elk deeltje wordt zacht. Nu volgt de CSS-maat uit de pixelmaat.
 */
export function canvasMaat(breedte: number, hoogte: number, dpr: number) {
  const W = Math.max(1, Math.floor(breedte * dpr));
  const H = Math.max(1, Math.floor(hoogte * dpr));
  return { W, H, cssW: W / dpr, cssH: H / dpr };
}

/**
 * Hoeveel CSS-pixels het canvas terug moet om op het raster van het scherm te
 * vallen. Een vak dat op een halve schermpixel begint (gecentreerde layouts
 * doen dat) laat de browser anders tussen twee pixels in tekenen.
 */
export function pixelRaster(links: number, boven: number, dpr: number): { x: number; y: number } {
  const fx = links * dpr - Math.floor(links * dpr);
  const fy = boven * dpr - Math.floor(boven * dpr);
  return { x: fx > 1e-6 ? -fx / dpr : 0, y: fy > 1e-6 ? -fy / dpr : 0 };
}

