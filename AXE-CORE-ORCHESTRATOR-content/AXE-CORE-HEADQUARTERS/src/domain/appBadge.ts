/**
 * Het cijfertje op het app-icoon.
 *
 * ## Waarom dit een eigen regel is en geen `setAppBadge(n)` op de plek zelf
 *
 * De badge is het enige wat AXE laat zien als de app dicht is én je niet net
 * een melding kreeg. Dat maakt hem precies het soort ding dat stil verkeerd
 * staat: een badge die blijft hangen op 3 terwijl er niets meer is, of die
 * nooit verschijnt omdat de browser hem niet kent. Allebei zie je niet aan de
 * code, want `setAppBadge` gooit niets en geeft niets terug.
 *
 * Dus staat de beslissing hier, los van de browser-aanroep, met een test per
 * geval. `infrastructure/pwa/appBadge.ts` voert alleen nog uit wat hier besloten
 * is.
 */

/** Wat er met het icoon moet gebeuren. */
export type BadgeOpdracht =
  | { soort: 'zet'; aantal: number }
  | { soort: 'wis' }
  | { soort: 'niets' };

/**
 * Vier cijfers passen niet op een icoon -- iOS en Android maken er zelf
 * "99+"-achtige dingen van, maar waar die grens ligt verschilt per toestel.
 * Zelf aftoppen is één voorspelbaar gedrag in plaats van drie.
 */
export const BADGE_MAX = 999;

/**
 * @param ongelezen  hoeveel ongelezen meldingen er zijn
 * @param kan        kent deze browser de Badging API
 *
 * `niets` is met opzet iets anders dan `wis`: kan de browser het niet, dan moet
 * er ook geen poging komen. Een mislukte poging is hier niet onschuldig, want
 * Safari zette eerder een afwijzing in de console bij élke renderronde.
 */
export function badgeOpdracht(ongelezen: number, kan: boolean): BadgeOpdracht {
  if (!kan) return { soort: 'niets' };
  // Geen getal (nog niet geladen, een mislukte telling) is niet hetzelfde als
  // nul. Nul betekent "ik weet het en het is leeg"; onbekend betekent "laat
  // staan wat er staat" -- anders knippert de badge weg bij elke herstart.
  if (typeof ongelezen !== 'number' || !Number.isFinite(ongelezen)) {
    return { soort: 'niets' };
  }
  if (ongelezen <= 0) return { soort: 'wis' };
  return { soort: 'zet', aantal: Math.min(Math.floor(ongelezen), BADGE_MAX) };
}
