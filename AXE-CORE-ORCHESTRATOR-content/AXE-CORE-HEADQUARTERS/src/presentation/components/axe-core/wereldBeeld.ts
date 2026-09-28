/**
 * Een 3D-wereld goed in beeld op de telefoon-Home.
 *
 * Op de telefoon vult de wereld (Neural, Terrain) de hele plaat, maar een deel
 * ervan ligt onder de wereldknoppen en de composer. Met de camera zoals op de
 * desktop stond het brein en het terrein daardoor te groot en te laag: een
 * staand scherm heeft een smalle horizontale kijkhoek, dus alles wat breed is
 * viel links en rechts weg, en het midden zakte achter de composer (Luka, 28
 * sep: "in het midden van de ruimte die ze hebben en niet al te ingezoomd").
 *
 * MobileSystem zet op het wereldslot hoeveel pixels boven en onder bezet zijn
 * (`--wereld-vrij-boven`, `--wereld-vrij-onder`). Een wereld leest dat met
 * `leesVrijeRuimte`, schuift zijn beeld naar het midden van wat vrij is, en
 * kiest een afstand waarop het geheel past. Staat de wereld niet in dat slot
 * -- de desktop -- dan is er geen vrije ruimte en verandert er niets.
 */

export interface VrijeRuimte {
  /** Pixels bovenin die de wereldknoppen innemen. */
  boven: number;
  /** Pixels onderin die de composer inneemt. */
  onder: number;
}

export const WERELD_SLOT_SELECTOR = '#axe-slot-wereld';

/** De vrije ruimte rond `el`, of null buiten de telefoon-wereld. */
export function leesVrijeRuimte(el: Element | null): VrijeRuimte | null {
  const slot = el?.closest(WERELD_SLOT_SELECTOR);
  if (!slot) return null;
  const cs = getComputedStyle(slot);
  const getal = (naam: string) => {
    const n = Number.parseFloat(cs.getPropertyValue(naam));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return { boven: getal('--wereld-vrij-boven'), onder: getal('--wereld-vrij-onder') };
}

/**
 * Hoeveel pixels het beeld omhoog moet om in het midden van de vrije ruimte te
 * staan. Positief = omhoog. Voor `camera.setViewOffset(w, h, 0, dit, w, h)`.
 */
export function middenVerschuiving(v: VrijeRuimte): number {
  return (v.onder - v.boven) / 2;
}

/**
 * De camera-afstand waarop een bol met `straal` in de vrije ruimte past, met
 * `marge` (0..1) van die ruimte gevuld. De kleinste van de twee kijkhoeken
 * beslist: op een staand scherm is dat bijna altijd de breedte.
 */
export function pasAfstand(o: {
  straal: number;
  vfovGraden: number;
  breedte: number;
  hoogte: number;
  vrij: VrijeRuimte;
  marge?: number;
}): number {
  const marge = o.marge ?? 0.82;
  const tanV = Math.tan((o.vfovGraden * Math.PI) / 360);
  const h = Math.max(1, o.hoogte);
  const tanH = tanV * (Math.max(1, o.breedte) / h);
  const vrijeHoogte = Math.max(1, h - o.vrij.boven - o.vrij.onder);
  const tanVrij = tanV * (vrijeHoogte / h);
  return o.straal / (Math.min(tanH, tanVrij) * marge);
}
