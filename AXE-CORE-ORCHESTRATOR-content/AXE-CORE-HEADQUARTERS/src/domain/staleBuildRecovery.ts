/**
 * Eén keer herladen als de build onder het venster is verwisseld -- en niet vaker.
 *
 * ## Waarom automatisch
 *
 * Bij een `verouderd`-fout is herladen niet één van de mogelijke oplossingen,
 * het is de enige. De brok die de pagina opvraagt bestaat niet meer; opnieuw
 * proberen levert precies dezelfde fout. Een knop aanbieden en de gebruiker
 * laten kiezen is dan beleefd doen alsof er een keuze is.
 *
 * ## Waarom precies één keer
 *
 * Als het herladen het niet oplost -- een kapotte service worker, een halve
 * deploy -- dan herlaadt een ongeremde versie zichzelf eindeloos, en zie je een
 * knipperend scherm zonder één leesbare melding. Dat is strikt erger dan de
 * crash: de crash vertelt je tenminste iets. Dus: één poging, daarna het
 * scherm mét de tekst erbij.
 *
 * sessionStorage en niet localStorage: de gok verloopt met het venster. Morgen
 * is het een nieuwe situatie en mag hij het opnieuw proberen.
 */

export const HERSTEL_SLEUTEL = 'axe_stale_reload';

/**
 * @param opslag meestal `sessionStorage`; ontbreekt in privémodus en in tests.
 * @returns of er nu herladen mag worden. Zet meteen de vlag, zodat een tweede
 *          crash in dezelfde sessie `false` krijgt.
 */
export function magHerstelHerladen(opslag: Storage | null | undefined): boolean {
  if (!opslag) return false; // Zonder geheugen geen rem, en zonder rem geen lus.
  try {
    if (opslag.getItem(HERSTEL_SLEUTEL)) return false;
    opslag.setItem(HERSTEL_SLEUTEL, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/** Aanroepen zodra een pagina wél goed laadt: de volgende verwisseling verdient
 *  zijn eigen poging. Zonder dit is de eerste update van de dag de enige die
 *  zichzelf herstelt. */
export function meldGoedeLading(opslag: Storage | null | undefined): void {
  try { opslag?.removeItem(HERSTEL_SLEUTEL); } catch { /* privémodus */ }
}
