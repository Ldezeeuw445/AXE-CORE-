/**
 * De rekenkant van de telefoon-sphere: stippen, kleuren, maten, pixelraster.
 *
 * Los van TelefoonSphere.tsx, omdat dit is wat je wilt kunnen nameten zonder
 * WebGL: hoeveel stippen, hoe groot op een 3x-scherm, welke kleur op welke
 * plaat, waar het midden zit, en of het canvas op het pixelraster valt.
 *
 * Dot Wave (Luka, 2 okt, gekozen in de artifact "AXE Sphere Studio"): rijen
 * piepkleine stippen die golven als een vloeibaar vel. Waar het vel plooit
 * schuiven de rijen in elkaar, zodat de toppen vanzelf oplichten. Daarvoor
 * stond hier een deeltjesbol met binnenbol, ring en stof.
 */

/** Per stip: x y z op de eenheidsbol, en een zaadje (0..1). */
export const STAP = 4;

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

/**
 * Hoeveel rijen bij een straal van R schermpixels: een stip om de ~7 pixels
 * langs een meridiaan, wat de maat ook is. Zo blijft de korrel hetzelfde als
 * je inzoomt, en kost een kleine bol ook weinig.
 */
export function dotRijen(R: number): number {
  return Math.round(Math.min(160, Math.max(48, (Math.PI * R) / 7)));
}

/**
 * Rijen op breedtegraden, om en om een halve stap verschoven: dat geeft het
 * rasterbeeld van een dot-matrix in plaats van een spiraal.
 */
export function maakDotWave(rijen: number, zaad?: number): Float32Array {
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
      uit.push(c * Math.cos(a), y, c * Math.sin(a), rnd());
    }
  }
  return new Float32Array(uit);
}

export type Plaat = 'donker' | 'licht';

export interface DotInkt {
  /** boven, onderste helft, onderrand, golftoppen (0..255) */
  boven: readonly [number, number, number];
  onder: readonly [number, number, number];
  rand: readonly [number, number, number];
  top: readonly [number, number, number];
  /** dekking achteraan en vooraan */
  alfa: readonly [number, number];
  /** straal van een stip als deel van de rijafstand */
  maat: number;
  /** hoeveel van de topkleur een golftop krijgt (0..1) */
  topMix: number;
}

/**
 * Donker: de kleuren uit Luka's voorbeeld, blauw dat naar violet smelt, licht
 * dat optelt. Licht: dat werkt niet -- licht dat optelt verdwijnt in een
 * lichte plaat, en blauw op lichtblauw zie je nauwelijks (Luka, 2 okt: "op
 * light mode zie je hem niet zo goed"). Daar dus inkt: bijna zwart met goud
 * en een beetje cyaan, zoals hij voor light mode vroeg, grotere stippen en een
 * dichtere achterkant.
 */
export const DOT_INKT: Record<Plaat, DotInkt> = {
  donker: {
    boven: [88, 180, 255], onder: [139, 108, 255], rand: [226, 140, 255], top: [191, 234, 255],
    alfa: [0.16, 0.95], maat: 0.22, topMix: 0.5,
  },
  licht: {
    boven: [22, 34, 54], onder: [161, 98, 7], rand: [194, 136, 15], top: [8, 145, 178],
    alfa: [0.24, 1], maat: 0.29, topMix: 0.8,
  },
};

/** Straal van een stip vooraan, in schermpixels. Nooit kleiner dan zichtbaar. */
export function dotMaat(R: number, rijen: number, plaat: Plaat): number {
  return Math.max(0.75, ((Math.PI * R) / rijen) * DOT_INKT[plaat].maat);
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
