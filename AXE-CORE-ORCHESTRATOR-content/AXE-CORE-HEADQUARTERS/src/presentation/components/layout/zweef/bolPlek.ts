/**
 * Hoe groot de bol op de browsertab is en waar hij standaard staat.
 *
 * De bol is een scène op de plaat en de kaarten van de startpagina liggen
 * dáárop; een scène die achter een kaart verdwijnt is geen scène. Dus past de
 * bol in de marge rechts van de band, gecentreerd, en krimpt hij mee als die
 * marge smaller wordt. Alleen als de gebruiker hem zelf verplaatst mag hij
 * over de band -- dat is zijn keuze, en die wordt onthouden.
 *
 * Over de maat: AxeCoreSphere tekent op 31% van zijn vak en het perspectief
 * (1.9 / (2.4 - z)) maakt daar op zijn breedst 0,87 van -- de zichtbare bol is
 * ~0,55 van het canvas (gemeten: 218 px op 400). De rest van het canvas is
 * leeg maar vangt wel kliks en scrollwiel. Daarom is het canvas groter dan
 * de zwever en knipt een clip-path hem op de bol af: zo is de zwever precies
 * zo groot als wat je ziet, en klikt wat eronder ligt gewoon door.
 */
import { MARGE, klem, type Maat, type Punt } from './zweefPositie';

/** Zichtbare bol: streef 271 in een marge van 287, nooit onder 180. */
export const BOL_MAX = 276;
export const BOL_MIN = 180;
/** Zichtbare bol / canvas: 0,55 gemeten in rust, plus 3% ademruimte voor de puls. */
export const BOL_VULLING = 0.57;
export const CHIP_HOOGTE = 30;
export const CHIP_AFSTAND = 10;
export const BOL_BOVEN = 96;

/** De zichtbare bol in een marge van deze breedte. */
export function bolDoorsnee(margeBreedte: number): number {
  return Math.max(BOL_MIN, Math.min(BOL_MAX, Math.round(margeBreedte - 2 * MARGE)));
}

/** Het canvas dat die zichtbare bol oplevert. */
export function bolCanvas(doorsnee: number): number {
  return Math.round(doorsnee / BOL_VULLING);
}

/** De zwever: de bol, een gat, en de chip eronder. */
export function bolZweverMaat(doorsnee: number): Maat {
  return { b: doorsnee, h: doorsnee + CHIP_AFSTAND + CHIP_HOOGTE };
}

/** Gecentreerd in de marge rechts van de band, op BOL_BOVEN -- en binnen het venster. */
export function bolStandaardPlek(venster: Maat, bandRechts: number, maat: Maat): Punt {
  const midden = (bandRechts + venster.b) / 2;
  return klem({ x: Math.round(midden - maat.b / 2), y: BOL_BOVEN }, maat, venster);
}
