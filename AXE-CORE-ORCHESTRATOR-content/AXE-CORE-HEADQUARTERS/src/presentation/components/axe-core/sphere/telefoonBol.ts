/**
 * De rekenkant van de telefoon-sphere: punten, kleuren, maten, pixelraster.
 *
 * Los van TelefoonSphere.tsx, omdat dit is wat je wilt kunnen nameten zonder
 * WebGL: hoeveel deeltjes, hoe groot op een 3x-scherm, waar het midden zit, en
 * of het canvas op het pixelraster van het scherm valt.
 *
 * Waarom een nieuwe bol en niet AxeCoreSphere telefoon: die tekent elk deeltje
 * als een voorgetekend plaatje dat de browser opschaalt, en het canvas werd op
 * 100% van zijn vak uitgerekt. Allebei maken ze de korrel zacht. Luka (2 okt):
 * "vlijmscherp", kleinere en meer deeltjes, zelfde idee en kleuren. Uitgewerkt
 * en goedgekeurd in de artifact "AXE Core Sphere".
 */

/** Ruim twee tot drie keer zoveel als AxeCoreSphere telefoon (2600/900/180). */
export const TEL_SCHIL = 7200;
export const TEL_KERN = 2400;
export const TEL_RING = 480;
export const TEL_STOF = 300;

/** Per punt: x y z, r g b (0..1), zaadje (0..1). */
export const STAP = 7;

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
const PALET: ReadonlyArray<readonly [number, number, number]> = [
  ...Array<[number, number, number]>(64).fill([214, 228, 255]),
  ...Array<[number, number, number]>(12).fill([34, 211, 238]),
  ...Array<[number, number, number]>(5).fill([59, 130, 246]),
  ...Array<[number, number, number]>(4).fill([167, 139, 250]),
  ...Array<[number, number, number]>(3).fill([20, 184, 166]),
  ...Array<[number, number, number]>(2).fill([245, 159, 36]),
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

const GULDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Een fibonacci-bol met dikte. `schud` haalt de spiraal een fractie uit het
 * lijnenpatroon -- op deze maat geeft een perfecte spiraal moiré -- en
 * `binnenste` laat punten iets onder de schil liggen, zodat hij volume heeft.
 */
function bol(
  n: number,
  rnd: () => number,
  schud: number,
  binnenste: number,
  kleur: (y: number) => readonly [number, number, number],
): Float32Array {
  const uit = new Float32Array(n * STAP);
  const afstand = Math.sqrt((4 * Math.PI) / n);
  for (let i = 0; i < n; i++) {
    const y0 = 1 - ((i + 0.5) / n) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y0 * y0));
    let x = Math.cos(GULDEN * i) * rad;
    let y = y0;
    let z = Math.sin(GULDEN * i) * rad;
    x += (rnd() - 0.5) * afstand * schud;
    y += (rnd() - 0.5) * afstand * schud;
    z += (rnd() - 0.5) * afstand * schud;
    const lengte = Math.hypot(x, y, z) || 1;
    const r = binnenste + (1 - binnenste) * rnd();
    x = (x / lengte) * r; y = (y / lengte) * r; z = (z / lengte) * r;
    const c = kleur(y / r);
    const o = i * STAP;
    uit[o] = x; uit[o + 1] = y; uit[o + 2] = z;
    uit[o + 3] = c[0] / 255; uit[o + 4] = c[1] / 255; uit[o + 5] = c[2] / 255;
    uit[o + 6] = rnd();
  }
  return uit;
}

export interface TelefoonBolData {
  schil: Float32Array;
  kern: Float32Array;
  ring: Float32Array;
  stof: Float32Array;
}

export function maakTelefoonBol(zaad?: number): TelefoonBolData {
  const rnd = zaadReeks(zaad);

  const schil = bol(TEL_SCHIL, rnd, 0.42, 0.965, (y) => {
    if (rnd() < 0.06) return PALET[Math.floor(rnd() * PALET.length)];
    const c = hoogteKleur(y);
    const k = 0.93 + rnd() * 0.14;
    return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  });
  // De kern krijgt zijn kleur in de shader (achter- en voorkleur); wit hier.
  const kern = bol(TEL_KERN, rnd, 0.5, 0.88, () => [255, 255, 255]);

  // Een fijne ketting: om de evenaar, met een smalle band in breedte en hoogte.
  const ring = new Float32Array(TEL_RING * STAP);
  for (let i = 0; i < TEL_RING; i++) {
    const a = (i / TEL_RING) * Math.PI * 2 + (rnd() - 0.5) * 0.006;
    const rr = 1 + (rnd() - 0.5) * 0.035;
    const o = i * STAP;
    ring[o] = Math.cos(a) * rr; ring[o + 1] = (rnd() - 0.5) * 0.02; ring[o + 2] = Math.sin(a) * rr;
    ring[o + 3] = 1; ring[o + 4] = 1; ring[o + 5] = 1; ring[o + 6] = rnd();
  }

  // Een ijl laagje stof net buiten de schil.
  const stof = new Float32Array(TEL_STOF * STAP);
  for (let i = 0; i < TEL_STOF; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 1.05 + rnd() * 0.11;
    const c = rnd() < 0.7 ? [214, 228, 255] : [34, 211, 238];
    const o = i * STAP;
    stof[o] = Math.cos(th) * s * r; stof[o + 1] = u * r; stof[o + 2] = Math.sin(th) * s * r;
    stof[o + 3] = c[0] / 255; stof[o + 4] = c[1] / 255; stof[o + 5] = c[2] / 255;
    stof[o + 6] = rnd();
  }

  return { schil, kern, ring, stof };
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
 * De straal van een deeltje (canvaspixels) achteraan en vooraan.
 *
 * Geschaald op de onderlinge afstand van de punten, zodat de korrel hetzelfde
 * oogt hoe groot het vak ook is -- maar nooit kleiner dan een zichtbaar
 * stipje. Op een 3x-iPhone met een straal van 61pt is een deeltje vooraan
 * ~1,7 pixel breed: een halve punt.
 */
export function deeltjesMaat(R: number, puls: number, groei: number) {
  const ondergrens = 0.62;
  const maat = (afstand: number, achter: number, voor: number, g = 1): Bereik => [
    Math.max(ondergrens, afstand * achter * g),
    Math.max(ondergrens * 1.2, afstand * voor * g),
  ];
  const schilAfstand = R * Math.sqrt((4 * Math.PI) / TEL_SCHIL);
  const kernAfstand = R * 0.46 * puls * Math.sqrt((4 * Math.PI) / TEL_KERN);
  const ringAfstand = (R * 0.74 * Math.PI * 2) / TEL_RING;
  return {
    schil: maat(schilAfstand, 0.095, 0.24, groei),
    kern: maat(kernAfstand, 0.1, 0.21),
    ring: maat(ringAfstand, 0.42, 0.64),
    stof: [ondergrens, Math.max(ondergrens, schilAfstand * 0.13)] as Bereik,
  };
}

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
