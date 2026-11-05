/**
 * De maten van de notch, op één plek.
 *
 * ## Waarom dit een eigen bestand is
 *
 * De hoogte stond op drie plekken: het Tauri-venster (`zwevendeVensters.ts`),
 * de CSS (`--axe-notch-h`) en `FloatAxe.tsx`, dat bij het opstarten de
 * CSS-variabele én het venster overschrijft.
 *
 * Op 5 november stonden de eerste twee op 80 en de derde op 44. De eerste
 * twee repareren hielp dus niets: `FloatAxe` zette hem bij elke start meteen
 * terug naar 44, en de icoontjes werden weer tegen de onderrand geknipt. Dat
 * is precies de val die eerder al een test kreeg — alleen dekte die test twee
 * van de drie plekken, en de derde hield het laatste woord.
 *
 * Twee getallen die gelijk moeten lopen en dat niet afdwingen, lopen uit
 * elkaar; drie is erger. Hier staat er één. `notchHoogteKlopt.test.ts` houdt
 * de CSS en het venster eraan vast.
 *
 * Geen DOM, geen Tauri: puur rekenen, zodat elk geval te toetsen is.
 */

/** Hoogte van de ingeklapte strook. De CSS is hierop getekend bij schaal 1. */
export const NOTCH_HOOGTE = 80;

/** Smaller dan dit lopen de knoppen links en rechts op elkaar. */
export const NOTCH_MIN_BREEDTE = 720;

/** Deel van de schermbreedte dat de notch pakt. */
const NOTCH_BREEDTE_DEEL = 0.34;

/**
 * Ruimte boven de notch voor de macOS-menubalk (~25pt).
 *
 * Vlak tegen de bovenrand verdwijnt hij eronder. Dit is geen smaak maar de
 * enige y waarop de hele strook zichtbaar blijft.
 */
export const MENUBALK_MARGE = 30;

export interface NotchMaten {
  /** Breedte van het venster. */
  b: number;
  /** Hoogte ingeklapt — altijd `NOTCH_HOOGTE`. */
  inklapH: number;
  /** Hoogte uitgeklapt: het paneel valt naar beneden uit. */
  uitklapH: number;
}

export function notchMaten(schermB: number, schermH: number): NotchMaten {
  const b = Math.max(NOTCH_MIN_BREEDTE, Math.round(schermB * NOTCH_BREEDTE_DEEL));
  return {
    b,
    inklapH: NOTCH_HOOGTE,
    uitklapH: Math.max(Math.round(b * 0.7), Math.round(schermH * 0.42), 720),
  };
}
