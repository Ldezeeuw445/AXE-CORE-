/**
 * Een abonnement dat even op is, en waarom dat geen storing is.
 *
 * ## De meting
 *
 * 13 september 2026, `codex exec` op de Mac mini:
 *
 *     ERROR: You've hit your usage limit. Upgrade to Pro (...) or try
 *     again at 5:36 PM.
 *
 * Codex is ingelogd, de CLI werkt, de repo klopt. Er is alleen tot 17:36
 * niets te halen. Voor de router is dat iets heel anders dan een provider die
 * stuk is: stuk blijft stuk, dit gaat vanzelf over -- en het heeft een tijd
 * erbij staan, dus we hoeven niet te gokken wanneer.
 *
 * ## Waarom een koeling en niet gewoon opnieuw proberen
 *
 * Zonder dit probeert elk bericht opnieuw de motor die net nee zei. Dat kost
 * een seconde of vijf per beurt (een CLI starten is niet gratis), en de chat
 * voelt daardoor traag zonder dat iets uitlegt waarom. Precies de klacht
 * waarmee dit begon: "axe core staat op chatgpt subscription maar hij
 * reageert niet."
 *
 * Dus: één keer nee horen, de tijd onthouden die de CLI zelf noemt, en tot
 * dan meteen doorschakelen naar de volgende motor -- met een zin die zegt wat
 * er aan de hand is in plaats van een foutmelding die naar codex wijst.
 *
 * ## Waarom de tijd uit het bericht komt en niet uit een vaste duur
 *
 * "Over een uur" is een gok; 17:36 is wat de dienst zelf zegt. Staat er geen
 * tijd in, dan pas valt hij terug op een uur -- ruim genoeg om niet te blijven
 * pingen, kort genoeg om niet een hele avond onnodig uit te staan.
 */

/** Waar de koeling per motor staat. */
export const LIMIET_SLEUTEL = 'axe-motor-limiet';

/** Zonder tijd in het bericht: een uur. Zie de kop. */
export const STANDAARD_KOELING_MS = 60 * 60 * 1000;

/**
 * Is dit een limiet, en geen kapotte motor?
 *
 * Bewust smal. "quota" en "rate limit" horen erbij, maar een willekeurige zin
 * met het woord "limit" niet -- een verkeerd herkende storing zou een echt
 * probleem een uur lang onzichtbaar maken.
 */
export function isLimietFout(bericht: string): boolean {
  return /usage limit|rate limit|quota exceeded|too many requests|\b429\b/i.test(bericht);
}

/**
 * De klok die de CLI noemt, als hele tijdstip op de dag.
 *
 * Alleen de vorm die codex gebruikt ("try again at 5:36 PM"), plus 24-uurs
 * voor als dat ooit verandert. Ligt het tijdstip al achter ons, dan is het
 * morgen -- een limiet die om 23:50 tot 00:30 loopt is geen limiet van gisteren.
 */
export function limietTijdstip(bericht: string, nu: Date): number | null {
  const m = bericht.match(/try again at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;

  let uur = Number(m[1]);
  const minuut = Number(m[2]);
  const helft = m[3]?.toUpperCase();

  if (helft === 'PM' && uur < 12) uur += 12;
  if (helft === 'AM' && uur === 12) uur = 0;
  if (uur > 23 || minuut > 59) return null;

  const doel = new Date(nu);
  doel.setHours(uur, minuut, 0, 0);
  if (doel.getTime() <= nu.getTime()) doel.setDate(doel.getDate() + 1);
  return doel.getTime();
}

/** Tot wanneer deze motor niets oplevert. */
export function koelingTot(bericht: string, nu: Date): number {
  return limietTijdstip(bericht, nu) ?? nu.getTime() + STANDAARD_KOELING_MS;
}

/** Koelt deze motor nog? Een tijd in het verleden telt niet. */
export function koeltNog(tot: number | undefined, nu: Date): boolean {
  return typeof tot === 'number' && tot > nu.getTime();
}

/** Wat de chat hierover zegt. Een tijd, want daar kun je iets mee. */
export function koelingTekst(motor: string, tot: number): string {
  const klok = new Date(tot).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return `${motor}: abonnementslimiet bereikt, weer beschikbaar om ${klok}. AXE gebruikt zolang de volgende motor.`;
}
