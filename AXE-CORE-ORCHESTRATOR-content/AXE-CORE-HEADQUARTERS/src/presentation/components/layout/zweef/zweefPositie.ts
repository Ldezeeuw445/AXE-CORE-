/**
 * Waar een zwever staat, en hoe hij dat onthoudt.
 *
 * Losgetrokken van de component omdat dit het deel is dat fout kan gaan zonder
 * dat je het ziet: een opgeslagen plek die buiten het venster valt nadat je het
 * scherm verkleinde, een sleutel die per ongeluk gedeeld wordt, een waarde in
 * localStorage die geen JSON meer is. Dat is te testen zonder browser; het
 * slepen zelf niet, en dat hoort dan ook in de component.
 */

export interface Punt { x: number; y: number }
export interface Maat { b: number; h: number }

/**
 * Waar een zwever begint als hij nog nooit verplaatst is. Gerekend vanaf de
 * rand die je noemt, zoals de maquette het doet (`left: 28px; bottom: 26px`).
 */
export interface Anker { links?: number; rechts?: number; boven?: number; onder?: number }

/** De marge die een zwever altijd tot de rand houdt. */
export const MARGE = 8;

const VOORVOEGSEL = 'axe_zwever_';

export function sleutelVan(naam: string): string {
  return VOORVOEGSEL + naam;
}

/** Binnen het venster, met de marge. Een venster kleiner dan de zwever geeft de marge zelf. */
export function klem(p: Punt, maat: Maat, venster: Maat, marge = MARGE): Punt {
  const maxX = Math.max(marge, venster.b - maat.b - marge);
  const maxY = Math.max(marge, venster.h - maat.h - marge);
  return {
    x: Math.min(maxX, Math.max(marge, Math.round(p.x))),
    y: Math.min(maxY, Math.max(marge, Math.round(p.y))),
  };
}

export function ankerNaarPunt(anker: Anker, maat: Maat, venster: Maat): Punt {
  const x = anker.rechts !== undefined ? venster.b - maat.b - anker.rechts : (anker.links ?? MARGE);
  const y = anker.onder !== undefined ? venster.h - maat.h - anker.onder : (anker.boven ?? MARGE);
  return klem({ x, y }, maat, venster);
}

type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isPunt(v: unknown): v is Punt {
  return typeof v === 'object' && v !== null
    && typeof (v as Punt).x === 'number' && Number.isFinite((v as Punt).x)
    && typeof (v as Punt).y === 'number' && Number.isFinite((v as Punt).y);
}

/** Wat er bewaard is, of niets als er niets (leesbaars) staat. */
export function laadPositie(naam: string, opslag: Opslag): Punt | null {
  try {
    const ruw = opslag.getItem(sleutelVan(naam));
    if (!ruw) return null;
    const v: unknown = JSON.parse(ruw);
    return isPunt(v) ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}

export function bewaarPositie(naam: string, p: Punt, opslag: Opslag): void {
  try { opslag.setItem(sleutelVan(naam), JSON.stringify({ x: p.x, y: p.y })); } catch { /* privémodus */ }
}

export function vergeetPositie(naam: string, opslag: Opslag): void {
  try { opslag.removeItem(sleutelVan(naam)); } catch { /* privémodus */ }
}

/**
 * Verborgen is een aparte sleutel, niet een veld in de positie: zo blijft de
 * plek bewaard terwijl de zwever weg is, en komt hij terug waar hij stond.
 */
export function laadVerborgen(naam: string, opslag: Opslag): boolean {
  try { return opslag.getItem(sleutelVan(naam) + '_verborgen') === '1'; } catch { return false; }
}

export function bewaarVerborgen(naam: string, verborgen: boolean, opslag: Opslag): void {
  try {
    const sleutel = sleutelVan(naam) + '_verborgen';
    if (verborgen) opslag.setItem(sleutel, '1'); else opslag.removeItem(sleutel);
  } catch { /* privémodus */ }
}

/**
 * De beginplek: wat er bewaard is, anders het anker -- en altijd binnen het
 * venster, want het scherm waarop je hem neerzette is niet per se het scherm
 * waarop je hem terugziet.
 */
export function beginPositie(naam: string, anker: Anker, maat: Maat, venster: Maat, opslag: Opslag, vergeet = false): Punt {
  const bewaard = vergeet ? null : laadPositie(naam, opslag);
  return bewaard ? klem(bewaard, maat, venster) : ankerNaarPunt(anker, maat, venster);
}
