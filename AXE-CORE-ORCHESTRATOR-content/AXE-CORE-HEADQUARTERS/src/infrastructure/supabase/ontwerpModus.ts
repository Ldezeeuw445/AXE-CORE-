/**
 * Ontwerpmodus: de app tonen zonder in te loggen, alleen tijdens ontwikkelen.
 *
 * Waarom dit bestaat: elke tab zit achter een login. Wie de UI bouwt kan zijn
 * eigen werk dus niet zien, verandert iets op de tast, en meldt het als klaar.
 * Zo blijft dezelfde layoutfout vier keer staan voordat iemand hem vindt. Dat
 * is hier letterlijk gebeurd.
 *
 * Twee sloten, en ze zijn allebei nodig:
 *
 *   1. `import.meta.env.DEV` is in ELKE gebouwde app hard `false`. Vite vervangt
 *      het letterlijk door false en snoeit de tak weg -- de code haalt de bundel
 *      niet eens. Er is dus geen vlag die per ongeluk aan kan staan.
 *   2. `?ontwerp=1` moet expliciet in de URL. Een gewone `npm run dev` logt
 *      gewoon in zoals altijd.
 *
 * Te controleren met een meting in plaats van een belofte:
 *
 *     npm run build && grep -rc "ONTWERP_MARKERING" dist/public/
 *
 * Nul treffers betekent dat niets hiervan in de app zit die jij gebruikt.
 */

/** Komt letterlijk in de dev-bundel en mag NOOIT in een productiebundel staan.
 *  Dit is de string waar de controle hierboven op zoekt. */
export const ONTWERP_MARKERING = 'ONTWERP_MARKERING_nooit_in_productie';

export function ontwerpModus(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('ontwerp') === '1';
  } catch {
    return false;
  }
}
