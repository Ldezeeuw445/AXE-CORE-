/**
 * Korte stemcommando's die AXE meteen zelf uitvoert, zonder AI-ronde.
 *
 * 15 nov: "zet Home op terrein" of "open de notch" ging naar het model, dat
 * daar geen gereedschap voor had en dus praatte in plaats van deed. Dit zijn
 * knoppen die al bestaan (de weergave-schakelaar, de notch); met je stem moet
 * je ze net zo snel kunnen indrukken.
 *
 * Bewust streng: alleen korte zinnen (≤ 8 woorden) met een duidelijk
 * werkwoord. "Wat is een neural network" mag nooit van weergave wisselen.
 */
export type HomeWeergave = 'axe' | 'neural' | 'terrain' | 'runtime';

export type HomeCommando =
  | { soort: 'weergave'; weergave: HomeWeergave }
  | { soort: 'notch'; open: boolean };

const WEERGAVEN: Array<[HomeWeergave, RegExp]> = [
  ['neural', /\b(neural|brein|brain|hersenen)\b/i],
  ['terrain', /\b(terrain|terrein|landschap)\b/i],
  ['runtime', /\b(runtime|architectuur|architecture)\b/i],
  ['axe', /\b(de bol|bol|sphere|core|axe|normaal|gewone weergave)\b/i],
];

const TOON = /\b(laat|toon|zet|ga|switch|show|open|naar|terug|wissel|schakel)\b/i;
const OPEN = /\b(open|toon|laat|show|zet .{0,12}aan|aan)\b/i;
const DICHT = /\b(sluit|dicht|weg|verberg|close|hide|uit)\b/i;

export function homeCommando(tekst: string): HomeCommando | null {
  const t = tekst.trim().replace(/[.!?]+$/, '');
  if (!t || t.split(/\s+/).length > 8 || /\?$/.test(tekst.trim())) return null;
  if (/^(wat|hoe|waarom|wie|wanneer|what|how|why|who)\b/i.test(t)) return null;

  if (/\b(notch|notchi|balk bovenin)\b/i.test(t)) {
    if (DICHT.test(t)) return { soort: 'notch', open: false };
    if (OPEN.test(t)) return { soort: 'notch', open: true };
    return null;
  }
  if (!TOON.test(t)) return null;
  // Over Home of over een weergave; "open de browser" is iets anders.
  for (const [weergave, re] of WEERGAVEN) {
    if (!re.test(t)) continue;
    if (weergave === 'axe' && !/\b(home|weergave|view|terug|bol|sphere)\b/i.test(t)) return null;
    return { soort: 'weergave', weergave };
  }
  return null;
}
