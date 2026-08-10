/**
 * actionIntent — catches the reply that promises to do something and doesn't.
 *
 * AXE only acts when its reply contains a tool marker such as
 * `[GIT_WRITE: {...}]`. Prose does nothing. So a model that writes "ik haal
 * die knop weg" without emitting a marker produces a reply that reads like a
 * completed action and changes nothing — and until now nothing anywhere
 * noticed. Luka asked for the Smart Home button to be removed, was told it
 * would happen, and it never did.
 *
 * That failure is silent, which is what makes it corrosive: you cannot learn
 * to distrust a specific thing, so you end up distrusting all of it.
 *
 * This module makes the gap detectable. It answers one question — does this
 * reply commit to changing something? — so the caller can force a corrective
 * round and, failing that, tell Luka plainly that nothing ran.
 *
 * Deliberately conservative. A false positive costs one wasted round trip and
 * a confusing note; a false negative restores exactly the silent failure this
 * exists to kill. When in doubt it fires.
 */

/**
 * First-person commitment: "ik ga", "ik zal", "even", "I'll", "let me".
 * Bare present tense ("ik verwijder de knop") counts too — it reads as a
 * promise in Dutch just as much as the future form.
 */
const COMMITMENT = new RegExp(
  [
    'ik\\s+(ga|zal|zou|kan|ken)\\b',
    'ik\\s+(doe|pak|regel|maak|haal|zet|schrijf|verwijder|verander|pas|update|fix)\\b',
    '\\beven\\b',
    '\\bmoment(je)?\\b',
    "\\bi(\\s+will|'ll)\\b",
    '\\blet me\\b',
    "\\bi'm (going to|about to)\\b",
    '\\bi (can|shall) (do|make|change|remove|add)\\b',
  ].join('|'),
  'i',
);

/**
 * A verb that changes state somewhere. Answering, explaining or showing is
 * not an action — only things with a side effect belong here.
 */
const MUTATION = new RegExp(
  [
    // Dutch separable verbs put the particle at the end of the clause, which
    // can be a long way off: "haal die Smart Home knop even voor je weg" is
    // 38 characters between the two halves. A short window silently missed
    // exactly the sentence this guard exists for — it was caught by the
    // detector's own test, not by reading it.
    'verwijder|weghal|haal\\s+.{0,60}?\\s*weg\\b|wis\\b|delete',
    'toevoeg|voeg\\s+.{0,60}?\\s*toe\\b|add\\b',
    'aanpass|pas\\s+.{0,60}?\\s*aan\\b|verander|wijzig|change|edit|update|modify',
    'maak\\b|bouw\\b|creëer|create|build',
    'commit|push\\b|merge\\b|deploy|publiceer|publish',
    'installeer|install\\b',
    'herstart|restart|start\\s+.{0,15}\\s*op',
    'schrijf\\b|write\\b|save\\b|opslaan',
    'fix\\b|repareer|los\\s+.{0,15}\\s*op',
    'verplaats|move\\b|hernoem|rename',
    'zet\\s+.{0,60}?\\s*(aan|uit|om)\\b',
  ].join('|'),
  'i',
);

/**
 * Phrases that explicitly disclaim doing it, so an honest "I can't do that"
 * is never mistaken for an unkept promise.
 */
const DISCLAIMER = new RegExp(
  [
    'kan ik niet|kan dat niet|lukt niet|geen toegang|niet mogelijk',
    'heb ik niet|mag ik niet|zou je zelf',
    "i can't|cannot|unable to|don't have (access|permission)",
    'je moet zelf|doe je zelf|handmatig',
  ].join('|'),
  'i',
);

/**
 * Does this reply promise a change without having made one?
 *
 * `ranTool` is the caller's record of whether any tool actually executed for
 * this turn — the only trustworthy evidence that something happened.
 */
export function promisesUnkeptAction(reply: string, ranTool: boolean): boolean {
  if (ranTool) return false;              // it acted; nothing to police
  if (!reply.trim()) return false;
  if (DISCLAIMER.test(reply)) return false; // said plainly it would not
  return COMMITMENT.test(reply) && MUTATION.test(reply);
}

/**
 * The nudge sent back to the model when a promise had no action behind it.
 *
 * Phrased to leave exactly two acceptable outs — do it, or say you can't —
 * because the failure being fixed is precisely the third option of sounding
 * like you did.
 */
export function actionNudge(toolForms: string): string {
  return [
    'STOP. Je vorige antwoord zégt dat je iets gaat doen, maar je hebt geen enkele tool-marker meegestuurd, dus er is niets gebeurd.',
    '',
    'Er zijn maar twee geldige antwoorden:',
    `1. Stuur nu de echte tool-marker mee (${toolForms}) zodat de actie daadwerkelijk uitgevoerd wordt.`,
    '2. Zeg in één zin ronduit dat je het niet kunt, en waarom.',
    '',
    'Beweren dat je iets gedaan hebt zonder marker is geen optie.',
  ].join('\n');
}

/** Appended when even the corrective round produced no action. */
export const UNKEPT_ACTION_NOTE =
  '\n\n⚠️ _Let op: hierboven staat dat er iets gedaan wordt, maar er is geen actie uitgevoerd. Er is dus niets veranderd._';
