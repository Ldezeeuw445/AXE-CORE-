/**
 * De Raad (BOUWLIJST, Spazio-hoek, 26 nov): acht bedachte experts reviewen een
 * tekst, pagina of projectplan, elk vanuit een eigen hoek.
 *
 *   "laat de raad kijken naar: <tekst>"  /  "vraag de raad: ..."  /  "council review: ..."
 *
 * Bedachte rollen, geen echte mensen. Het gewone chatmodel speelt ze; dit
 * bestand bepaalt wie er in de raad zit en hoe het antwoord eruitziet, zodat
 * elke review dezelfde vorm heeft. Geen I/O hier.
 */

export interface RaadsLid {
  naam: string;
  hoek: string;
}

export const RAAD: readonly RaadsLid[] = [
  { naam: 'The Buyer', hoek: 'Would I pay for this, today? What makes me hesitate?' },
  { naam: 'The Sceptic', hoek: 'What is claimed but not shown or proven?' },
  { naam: 'The Editor', hoek: 'What can go? Where is it vague, long or repeated?' },
  { naam: 'The Designer', hoek: 'How does it look and scan on a screen or phone? What is hard to find?' },
  { naam: 'The Lawyer', hoek: 'Which promises, claims or wording could cause trouble?' },
  { naam: 'The Operator', hoek: 'Can this actually be done? Who does what, by when?' },
  { naam: 'The Investor', hoek: 'Does this grow? What are the numbers and the biggest risk?' },
  { naam: 'The Newcomer', hoek: 'Do I understand it the first time, without context?' },
];

const RAAD_WOORDEN = /^(?:axe[,\s]+)?(?:laat\s+(?:de\s+)?raad\s+(?:kijken\s+naar|reviewen|beoordelen)|vraag\s+(?:de\s+)?raad(?:\s+om\s+raad)?|(?:de\s+)?raad\s+(?:review|oordeel)|ask\s+the\s+council|council\s+review|let\s+the\s+council\s+(?:review|look\s+at))\b\s*[:\-–]?\s*([\s\S]*)$/i;

/** Het stuk dat de raad moet bekijken, of null als dit geen raad-vraag is. */
export function raadVraag(tekst: string): { stuk: string } | null {
  const m = RAAD_WOORDEN.exec((tekst ?? '').trim());
  return m ? { stuk: (m[1] ?? '').trim() } : null;
}

/** Zo kort dat er niets te reviewen valt (alleen een naam of "dit"). */
const TE_WEINIG = 40;

/**
 * Het blok voor de systeemprompt, alleen bij een raad-vraag. Zonder echt
 * stuk vraagt het model erom in plaats van een review te verzinnen.
 */
export function raadBlok(bericht: string): string {
  const v = raadVraag(bericht);
  if (!v) return '';
  const leden = RAAD.map((l, i) => `${i + 1}. ${l.naam} -- ${l.hoek}`).join('\n');
  if (v.stuk.length < TE_WEINIG) {
    return `\n\n## The Council\nLuka asked the council to review something, but did not paste it (only: "${v.stuk.slice(0, 80)}"). Do not invent a review. Ask him in one line to paste the text, or the page or plan in a few lines. The council: ${RAAD.map((l) => l.naam).join(', ')}.`;
  }
  return `\n\n## The Council\nLuka asked the council to review the text in his message. You play eight invented experts (not real people):\n${leden}\n\n`
    + 'Reply in this exact shape, in the language Luka wrote in:\n'
    + '- One line per expert: **Name** (score /10): the main problem, quoting a few words, and one concrete fix.\n'
    + '- Then "The council agrees:" with the three changes that matter most, in order.\n'
    + '- Then "Score: N/10" (the average, rounded).\n'
    + 'Be specific to this text; no generic advice. If an expert has nothing real to add, say "Nothing to add" instead of filling space.';
}
