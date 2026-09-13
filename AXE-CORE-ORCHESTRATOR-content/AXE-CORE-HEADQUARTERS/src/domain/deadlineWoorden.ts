/**
 * Een deadline in woorden in plaats van in een datum.
 *
 * ## Waarom dit apart staat
 *
 * Het stond in het taken-paneel zelf. Twee redenen om het eruit te halen: een
 * componentbestand dat ook functies exporteert breekt fast refresh (dan
 * herlaadt de hele pagina bij elke wijziging), en dit is pure logica met
 * randgevallen -- precies wat je zonder browser wilt kunnen testen.
 *
 * ## Waarom woorden en geen datum
 *
 * "3 dagen te laat" en niet "14 mrt". Een datum moet je omrekenen naar vandaag
 * voordat hij iets betekent, en dat is het rekenwerk dat je op een drukke dag
 * niet doet -- dus zie je niet dat er iets over tijd is.
 */

/**
 * Hoe ver weg, in woorden.
 *
 * "3 dagen te laat" en niet "Mar 14". Een datum moet je omrekenen naar vandaag
 * voordat hij iets betekent, en dat is precies het rekenwerk dat je op een
 * drukke dag niet doet.
 */
export function wanneer(deadline: number, nu = Date.now()): { tekst: string; telaat: boolean } {
  const dag = 86_400_000;
  const vandaag = new Date(nu); vandaag.setHours(0, 0, 0, 0);
  const dan = new Date(deadline); dan.setHours(0, 0, 0, 0);
  const dagen = Math.round((dan.getTime() - vandaag.getTime()) / dag);
  if (dagen < 0) return { tekst: dagen === -1 ? 'gisteren' : `${-dagen} dagen te laat`, telaat: true };
  if (dagen === 0) return { tekst: 'vandaag', telaat: false };
  if (dagen === 1) return { tekst: 'morgen', telaat: false };
  return { tekst: `over ${dagen} dagen`, telaat: false };
}
