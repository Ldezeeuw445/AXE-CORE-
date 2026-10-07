/**
 * Wat er naast de composer staat: het gesprek van NU, niet het archief.
 *
 * Luka, 7 okt 2026: "het moet gewoon het gesprek zijn van dat moment en niet
 * een lijst met de vorige ... maar die moet hij wel weten en niet vergeten,
 * en als ik wil moet ik het wel terug kunnen lezen". Het eeuwige gesprek
 * (hoofdgesprek.ts) blijft één doorlopende lijst -- AXE vergeet niets. Dit
 * kiest alleen wat de wolk laat zien:
 *  - alles sinds de laatste echte pauze (standaard 45 min stilte);
 *  - begroetingen ("Goedemorgen, Luka. ...") hooguit één keer: de nieuwste.
 *    Elke start voegde er een toe, en die stapel zag eruit als een bug.
 */
export interface Regel {
  role: 'user' | 'axe';
  text: string;
  timestamp: number;
}

export const SESSIE_PAUZE_MS = 45 * 60_000;

const GROET_RE = /^(goedemorgen|goedemiddag|goedenavond|good\s+(morning|afternoon|evening))\b|^axe is online\b/i;

function isGroet(m: Regel): boolean {
  return m.role === 'axe' && GROET_RE.test(m.text.trim());
}

/** Alleen de nieuwste begroeting blijft staan. */
export function zonderDubbeleGroeten<T extends Regel>(lijst: readonly T[]): T[] {
  let laatste = -1;
  lijst.forEach((m, i) => { if (isGroet(m)) laatste = i; });
  return lijst.filter((m, i) => !isGroet(m) || i === laatste);
}

/** Het lopende gesprek: alles na de laatste pauze, zonder herhaalde groeten. */
export function huidigGesprek<T extends Regel>(
  alles: readonly T[],
  nu: number,
  pauze = SESSIE_PAUZE_MS,
): T[] {
  const lijst = alles.filter(m => m.text?.trim());
  let start = lijst.length;
  let later = nu;
  for (let i = lijst.length - 1; i >= 0; i--) {
    if (later - lijst[i].timestamp > pauze) break;
    start = i;
    later = lijst[i].timestamp;
  }
  return zonderDubbeleGroeten(lijst.slice(start));
}
