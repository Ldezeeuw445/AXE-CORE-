/**
 * Jouw stem (BOUWLIJST, Spazio-hoek, 26 nov): Luka geeft 3-5 eigen teksten,
 * AXE schrijft en reviewt daarna in die stem.
 *
 *   "leer mijn stem: <tekst>"         -> voorbeeld bewaard (max 5, oudste eruit)
 *   "mijn stem" / "toon mijn stem"     -> wat AXE heeft
 *   "... in mijn stem" / "in my voice" -> de voorbeelden gaan mee in de prompt
 *
 * Bewaren is deterministisch (geen model); schrijven en reviewen doet het
 * gewone chatmodel, met de voorbeelden als stijlbron. Geen I/O hier; de opslag
 * (global_memory, category luka_stem) staat in application/axe/stem.ts.
 */

export const STEM_CATEGORIE = 'luka_stem';
export const STEM_PREFIX = 'stem:';
export const MAX_VOORBEELDEN = 5;
export const MIN_TEKENS = 80;
const MAX_TEKENS = 3000;

export interface StemVoorbeeld {
  /** 1..MAX_VOORBEELDEN */
  plek: number;
  tekst: string;
  /** ms sinds epoch */
  op: number;
}

export type StemOpdracht =
  | { soort: 'leer'; tekst: string }
  | { soort: 'te-kort'; tekens: number }
  | { soort: 'lijst' };

const LEER = /^(?:axe[,\s]+)?(?:leer\s+mijn\s+stem|dit\s+is\s+mijn\s+stem|voorbeeld\s+van\s+mijn\s+stem|onthoud\s+mijn\s+stem|learn\s+my\s+voice|this\s+is\s+my\s+voice)\s*[:\-–]\s*([\s\S]+)$/i;
const LIJST = /^(?:axe[,\s]+)?(?:(?:toon|laat|wat\s+is)\s+)?(?:mijn\s+stem(?:\s+zien)?|my\s+voice|show\s+my\s+voice)\s*[?.!]*$/i;
const WIL_STEM = /\b(?:in\s+mijn\s+(?:stem|toon|eigen\s+woorden)|zoals\s+ik\s+(?:het\s+)?(?:zou\s+)?(?:schrijf|schrijven|zeg|zeggen)|in\s+my\s+(?:own\s+)?(?:voice|words|tone)|like\s+i\s+(?:would\s+)?write)\b/i;

export function stemOpdracht(tekst: string): StemOpdracht | null {
  const t = (tekst ?? '').trim();
  if (!t) return null;
  const m = LEER.exec(t);
  if (m) {
    const voorbeeld = m[1].trim();
    return voorbeeld.length < MIN_TEKENS
      ? { soort: 'te-kort', tekens: voorbeeld.length }
      : { soort: 'leer', tekst: voorbeeld.slice(0, MAX_TEKENS) };
  }
  if (t.length <= 40 && LIJST.test(t.replace(/\s+/g, ' '))) return { soort: 'lijst' };
  return null;
}

/** Vraagt dit bericht om schrijven of reviewen in Luka's stem? */
export function wilStem(tekst: string): boolean {
  return WIL_STEM.test(tekst ?? '');
}

/** Waar komt een nieuw voorbeeld: de eerste vrije plek, anders over het oudste. */
export function volgendePlek(bestaand: readonly StemVoorbeeld[]): number {
  const bezet = new Set(bestaand.map((v) => v.plek));
  for (let p = 1; p <= MAX_VOORBEELDEN; p++) if (!bezet.has(p)) return p;
  return [...bestaand].sort((a, b) => a.op - b.op)[0]?.plek ?? 1;
}

export function stemSleutel(plek: number): string {
  return `${STEM_PREFIX}${plek}`;
}

export function plekUitSleutel(key: string): number | null {
  if (!key.startsWith(STEM_PREFIX)) return null;
  const n = Number(key.slice(STEM_PREFIX.length));
  return Number.isInteger(n) && n >= 1 && n <= MAX_VOORBEELDEN ? n : null;
}

function kort(t: string, n = 70): string {
  const een = t.replace(/\s+/g, ' ').trim();
  return een.length > n ? `${een.slice(0, n - 1)}…` : een;
}

export function bewaardAntwoord(aantal: number): string {
  if (aantal < 3) return `Bewaard. Ik heb nu ${aantal} van je teksten; met 3 of meer klink ik echt als jij. Stuur er nog een met "leer mijn stem: ...".`;
  return `Bewaard (${aantal} van ${MAX_VOORBEELDEN}). Zeg "schrijf ... in mijn stem" of "review dit in mijn stem: ..." en ik gebruik ze.`;
}

export function teKortAntwoord(tekens: number): string {
  return `Dat is te kort om een stem uit te halen (${tekens} tekens). Plak een echte tekst van jezelf van minstens ${MIN_TEKENS} tekens: een mail, post of notitie.`;
}

export function lijstAntwoord(voorbeelden: readonly StemVoorbeeld[]): string {
  if (!voorbeelden.length) return 'Ik heb nog geen teksten van je. Zeg "leer mijn stem:" gevolgd door een mail, post of notitie die je zelf schreef. Drie tot vijf is genoeg.';
  const regels = [...voorbeelden].sort((a, b) => a.plek - b.plek).map((v) => `${v.plek}. ${kort(v.tekst)}`);
  return `Ik ken je stem uit ${voorbeelden.length} ${voorbeelden.length === 1 ? 'tekst' : 'teksten'}:\n${regels.join('\n')}\nEen nieuwe komt erbij tot ${MAX_VOORBEELDEN}; daarna vervangt hij de oudste.`;
}

export const GEEN_STEM_REGEL = '(Ik ken je stem nog niet. Zeg "leer mijn stem:" met een tekst die je zelf schreef, dan klinkt het volgende als jij.)';
// De tip zelf zet installSpherePresent onder het antwoord: het model liet hem weg.
const GEEN_STEM = 'Luka asked for his own voice, but you have no samples of his writing yet. Write the text anyway in a plain, direct style. Do not claim it is in his voice.';

/**
 * Het blok voor de systeemprompt, alleen als het bericht om de stem vraagt.
 * Zonder voorbeelden een eerlijke regel, zodat het model niet doet alsof.
 */
export function stemBlok(voorbeelden: readonly StemVoorbeeld[], bericht: string): string {
  if (!wilStem(bericht)) return '';
  if (!voorbeelden.length) return `\n\n## Luka's voice\n${GEEN_STEM}`;
  const delen = [...voorbeelden]
    .sort((a, b) => b.op - a.op)
    .map((v, i) => `### Sample ${i + 1}\n${v.tekst.trim()}`);
  return `\n\n## Luka's voice (texts he wrote himself)\n${delen.join('\n\n')}\n\n`
    + 'When asked to WRITE in his voice: match these samples -- sentence length, word choice, language mix, directness, punctuation, how he opens and closes. Do not copy sentences. Output only the text.\n'
    + 'When asked to REVIEW in his voice: list at most five places that do not sound like him (quote a few words each), say why in one line, and give the rewrite. End with the full rewritten text.';
}
