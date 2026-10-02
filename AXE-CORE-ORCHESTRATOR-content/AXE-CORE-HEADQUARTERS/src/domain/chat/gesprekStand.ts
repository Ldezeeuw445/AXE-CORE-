/**
 * Welke stand het chatvak toont als er (nog) geen gesprek in beeld staat.
 *
 * ## Waarom dit een regel in domain is en geen `if` in het component
 *
 * Gemeten 2 okt 2026 op de telefoon-Home: een leeg zwart vlak tussen de
 * agent-tegels en de composer. Het vak werkt -- er was niets te tonen. Maar
 * "niets te tonen" is VIER verschillende dingen, en ze zagen er alle vier
 * identiek uit:
 *
 *   1. nog niets gezegd in dit gesprek;
 *   2. de app is het gesprek nog aan het ophalen;
 *   3. het ophalen is mislukt -- `loadMessages` ving elke fout en gaf `[]`;
 *   4. het opslaan is stuk -- `chatSaveHealth()` wist dat, maar de enige plek
 *      die het toonde was `/status`, en die staat niet in de telefoonnavigatie.
 *
 * Geval 4 is al eens zes weken onopgemerkt gebeurd (zie de kop van
 * `chatPersistence.ts`). Daarom staat die hier VOOROP, en ook als er wel
 * berichten in beeld staan: juist dan lijkt alles in orde.
 *
 * Als regel hier kan hij getest worden zonder DOM, en kunnen de telefoon en het
 * bureau niet uit elkaar lopen over wanneer welke melding komt.
 */

export type GesprekStandSoort =
  /** Er is een gesprek in beeld en er is niets te melden: toon niets. */
  | 'stil'
  /** Er wordt niets vastgelegd. Erger dan leeg, en het staat er altijd. */
  | 'bewaart-niet'
  /** De eerste poging loopt nog. */
  | 'laadt'
  /** De poging is gedaan en mislukt. */
  | 'niet-geladen'
  /** Geladen, en er is echt niets gezegd. */
  | 'leeg';

export interface GesprekStandKijk {
  /** Hoeveel berichten er nu in beeld staan. */
  berichten: number;
  /** Of de eerste `loadConversation()` nog loopt. */
  laadt: boolean;
  /** `chatSaveHealth().ok` */
  opslaanOk: boolean;
  /** `chatSaveHealth().failures` -- één hik is geen kapotte app. */
  opslaanFouten: number;
  /** `chatLoadHealth().ok` */
  ladenOk: boolean;
  /** `chatLoadHealth().geprobeerd` -- vóór de eerste poging valt er niets
   *  te zeggen over of het laden lukte. */
  ladenGeprobeerd: boolean;
}

export function gesprekStand(kijk: GesprekStandKijk): GesprekStandSoort {
  // Niet vastgelegd worden gaat vóór alles, ook vóór een vol gesprek: het is de
  // enige stand waarin wat je NU doet verloren gaat.
  if (!kijk.opslaanOk && kijk.opslaanFouten > 0) return 'bewaart-niet';
  // Staan er berichten, dan is het gesprek zelf het antwoord.
  if (kijk.berichten > 0) return 'stil';
  if (kijk.laadt) return 'laadt';
  // Een mislukte poging alleen melden als hij echt gedaan is. Anders meldt een
  // beginstand van `ok: false` een fout die er nog niet was.
  if (kijk.ladenGeprobeerd && !kijk.ladenOk) return 'niet-geladen';
  return 'leeg';
}
