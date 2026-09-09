/**
 * Welke accounts kunnen dit symbool eigenlijk verhandelen?
 *
 * ## Waarom dit bestaat
 *
 * De scanlijst is de UNIE van alle catalogi: staat een paar bij één account in
 * de lijst, dan komt het in de lijst voor iedereen. Daarna waaiert de cyclus
 * uit over alle accounts en slaat er per stuk over wat die broker niet voert.
 *
 * Gemeten op het cyclusjournaal van 9 september 2026, 8 cycli, 5 accounts:
 *
 *   uitkomst    aantal
 *   overgeslagen   21     (52%)
 *   fout           14     (35%)
 *   hold            5
 *   orders          0
 *
 * Van de 40 account-uitkomsten waren er 21 een overslaan. Op US30, NAS100 en
 * US2000 sloegen steeds 4 van de 5 accounts over -- dat zijn indices die alleen
 * OANDA voert. En dat overslaan gebeurt PAS NA het dure deel: research, desk
 * lanes en de trechter draaien per symbool, vóór de uitwaaiering. Een cyclus op
 * US30 kost dus een volledige ronde en levert vier keer niets.
 *
 * Deze module beantwoordt die vraag vooraf, zodat de cyclus zijn geld niet
 * uitgeeft aan een symbool dat niemand kan verhandelen -- en zodat een symbool
 * dat iedereen voert eerder aan de beurt is dan één dat bij één account staat.
 *
 * ## Waarom puur
 *
 * De cyclus is het moeilijkst te testen deel van de app: hij praat met een
 * broker, met de VPS en met een LLM. De vraag "wie kan dit verhandelen" hoeft
 * daar niets van te weten, dus staat hij hier -- dan is de regel te testen
 * zonder één netwerkaanroep.
 */

/** Per account de symbolen die zijn broker voert, zoals de catalogus ze noemt. */
export type Catalogi = ReadonlyMap<string, ReadonlySet<string>>;

/** De accounts die dit symbool voeren, in de volgorde van de catalogi. */
export function accountsVoor(symbool: string, catalogi: Catalogi): string[] {
  const uit: string[] = [];
  for (const [accountId, paren] of catalogi) {
    if (paren.has(symbool)) uit.push(accountId);
  }
  return uit;
}

/** Hoeveel accounts dit symbool kunnen verhandelen. */
export function dekking(symbool: string, catalogi: Catalogi): number {
  return accountsVoor(symbool, catalogi).length;
}

/**
 * De scanlijst op volgorde van dekking, breedst eerst.
 *
 * Symbolen die GEEN enkel account voert vallen eruit: daar is geen uitkomst
 * mogelijk, alleen kosten. Bij gelijke dekking blijft de oorspronkelijke
 * volgorde staan -- de lijst komt uit de catalogi en die volgorde is niet
 * willekeurig, en een stabiele sortering maakt het verschil per cyclus
 * voorspelbaar.
 *
 * Zonder catalogi (de broker antwoordde niet) blijft de lijst ONGEWIJZIGD.
 * Niets weten is geen reden om de wereld van het algoritme leeg te maken --
 * dezelfde regel als in scanUniverse, waar een mislukte opvraging de vorige
 * lijst laat staan.
 */
export function opDekkingGesorteerd(symbolen: readonly string[], catalogi: Catalogi): string[] {
  if (catalogi.size === 0) return [...symbolen];
  return symbolen
    .map((s, i) => ({ s, i, d: dekking(s, catalogi) }))
    .filter(x => x.d > 0)
    .sort((a, b) => (b.d - a.d) || (a.i - b.i))
    .map(x => x.s);
}
