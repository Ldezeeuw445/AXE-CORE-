/**
 * Van balken naar een koersregel: laatste prijs, verandering en lijntje.
 *
 * Apart van het tabblad omdat hier de twee dingen staan die stil fout kunnen
 * gaan: welke balk "nu" is, en waartegen je de verandering meet. LSE levert
 * oplopende rijen, dus de LAATSTE is de meest recente -- niet de eerste.
 *
 * De band is de les van 16 september: WTI stond op 4,12 per vat met +57%.
 * Onmogelijk, maar het stond er als koers met een groene pijl. Een prijs die
 * buiten zijn band valt is geen prijs; hij wordt geweigerd en genoemd.
 */
import type { OhlcBar } from '../tradingIntel/demoTypes';

export interface Koersregel {
  last: number;
  /** Verandering over het getoonde venster, in procenten. Null als niet te meten. */
  pct: number | null;
  /** De sluitkoersen voor het lijntje, oud → nieuw. */
  slot: number[];
  bron: string;
}

export function koersUitBalken(balken: readonly OhlcBar[] | null | undefined, bron: string): Koersregel | null {
  if (!balken || balken.length === 0) return null;
  const slot = balken.map(b => b.c).filter(n => Number.isFinite(n));
  if (!slot.length) return null;
  const last = slot[slot.length - 1];
  const eerste = slot[0];
  const pct = slot.length > 1 && eerste ? ((last - eerste) / eerste) * 100 : null;
  return { last, pct, slot: slot.slice(-30), bron };
}

export function binnenBand(waarde: number, band: readonly [number, number]): boolean {
  return Number.isFinite(waarde) && waarde >= band[0] && waarde <= band[1];
}
