/**
 * Voorkeuren die op elk apparaat hetzelfde horen te staan.
 *
 * ## Waarom de spraakstand een EIGEN sleutel in de cloud heeft
 *
 * `axe_response_mode` staat rauw in localStorage: letterlijk `speak` of `type`.
 * Vier plekken lezen dat synchroon midden in een beurt
 * (`voiceStore`, `installTierRouter`, `installStableChat`, `stroomSpraak`) en
 * vergelijken met `=== 'type'`.
 *
 * `saveSetting`/`hydrateSettingsFromSupabase` schrijven hun waarden als JSON:
 * dezelfde sleutel zou daar `"type"` mét aanhalingstekens van maken. Die vier
 * vergelijkingen matchen dan nooit meer, AXE blijft hardop praten terwijl de
 * knop "alleen tekst" zegt, en er is niets wat die fout aanwijst.
 *
 * Dus: de rauwe sleutel blijft van de lezers, en de cloud krijgt zijn eigen.
 * Deze functie is de brug ertussen, en is daarom een regel en geen `if` in een
 * installer: hij moet te toetsen zijn zonder browser.
 *
 * (`axe_dynamic_nav_v1` heeft dit niet nodig -- die staat lokaal al als JSON,
 * precies wat de hydratie ook schrijft. Zelfde sleutel, geen vertaling.)
 */
export type SpraakStand = 'speak' | 'type';

/**
 * De stand uit de cloudwaarde, of null als er niets bruikbaars staat.
 *
 * @param ruw wat er in localStorage onder de cloudsleutel staat na hydratie:
 *   JSON, dus `"speak"` met aanhalingstekens. Een rauwe waarde zonder
 *   aanhalingstekens wordt ook geaccepteerd -- dat scheelt een stille mislukking
 *   als iemand de sleutel ooit met de hand zet.
 */
export function spraakStandUit(ruw: string | null | undefined): SpraakStand | null {
  if (ruw == null) return null;
  const tekst = ruw.trim();
  if (!tekst) return null;
  let waarde: unknown = tekst;
  try { waarde = JSON.parse(tekst); } catch { /* geen JSON: de rauwe tekst zelf */ }
  return waarde === 'speak' || waarde === 'type' ? waarde : null;
}
