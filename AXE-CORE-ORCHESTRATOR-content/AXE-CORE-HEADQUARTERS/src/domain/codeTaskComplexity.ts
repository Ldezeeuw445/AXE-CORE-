/**
 * Is deze instructie voor de Code Agent klein genoeg voor gratis OpenHands, of
 * hoort hij bij het gepinde abonnement (Cursor/Claude/Codex)?
 *
 * ## Waarom conservatief richting "zwaar"
 *
 * Fout om een verkeerde reden weegt hier niet gelijk op. Een simpele taak per
 * ongeluk op het (betrouwbaardere) abonnement laten draaien kost hooguit wat
 * onnodig verbruik. Een zware taak per ongeluk op OpenHands laten draaien kan
 * stille, halve of foute wijzigingen opleveren in echte code — en dat merk je
 * pas bij de volgende run. Bij twijfel dus altijd het abonnement, nooit
 * andersom. Zie ook DOMAIN_SIGNALS in domain/agents/roster.ts, dezelfde
 * afweging voor delegatie: "a false hand-off is worse than AXE answering".
 *
 * ## Waarom een woordgrens en geen AI-classificatie
 *
 * Een tweede modelaanroep om te bepalen welk model de eerste mag doen is een
 * nieuwe faalkans (en kost zelf ook weer een aanroep) voor iets dat met een
 * paar duidelijke signalen net zo goed te vangen is — en uitlegbaar blijft:
 * "dit is 9 woorden zonder een zwaar trefwoord" is te controleren, "het model
 * vond het simpel" niet.
 */

export type CodeTaskComplexity = 'simple' | 'heavy';

/** Één treffer is genoeg om altijd naar het abonnement te sturen, ongeacht lengte. */
const ZWARE_SIGNALEN = /\b(refactor|rewrite|herschrijf|migrate|migreer|architecture|architectuur|redesign|herontwerp|across (all|many|every)|door (de|het) hele|meerdere bestanden|multiple files|breaking change|elke plek|overal in|hele codebase|whole codebase|restructure|herstructureer)\b/i;

/** Expliciete markers dat het echt klein is — samen met de woordgrens hieronder. */
const SIMPELE_SIGNALEN = /\b(typo|typfout|rename|hernoem|comment|commentaar|kleine|klein|small tweak|quick fix|snelle fix|één regel|one[- ]line|small bug|kleine bug|add a log|log toevoegen)\b/i;

/** Boven deze lengte is "kort" geen argument meer op zich. */
const MAX_WOORDEN_MET_SIGNAAL = 30;
/** Zonder enig signaal telt alleen een heel korte instructie als simpel. */
const MAX_WOORDEN_ZONDER_SIGNAAL = 12;

export function classifyCodeTaskComplexity(instruction: string): CodeTaskComplexity {
  const tekst = instruction.trim();
  if (!tekst) return 'heavy';
  if (ZWARE_SIGNALEN.test(tekst)) return 'heavy';

  const woorden = tekst.split(/\s+/).length;
  if (SIMPELE_SIGNALEN.test(tekst) && woorden <= MAX_WOORDEN_MET_SIGNAAL) return 'simple';
  if (woorden <= MAX_WOORDEN_ZONDER_SIGNAAL) return 'simple';
  return 'heavy';
}
