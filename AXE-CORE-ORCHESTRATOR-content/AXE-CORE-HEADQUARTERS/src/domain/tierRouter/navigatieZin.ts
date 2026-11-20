/**
 * Is dit een korte opdracht om een tab te openen? (20 nov, functielijst)
 *
 * Gemeten: "open settings", "open managers", "open de taken" werden een
 * developer-taak op de VPS en "open trading" een taak voor de Trading Agent --
 * de tier-router pakte elke zin met "open" als werk. Een korte opdracht die met
 * een open-werkwoord begint, gaat nu eerst naar de navigatie (navRegistry via
 * detectChatAction). Langere zinnen ("open een PR voor de login-fix") blijven werk.
 */
const OPEN_BEGIN = /^(?:(?:hey|hoi|axe)[,\s]+)*(open|ga naar|go to|naar|toon|laat .{0,20}zien|show)\b/i;
export const MAX_WOORDEN = 6;

export function isKorteOpenOpdracht(tekst: string): boolean {
  const t = (tekst || '').trim().replace(/[.!?]+$/, '');
  if (!t) return false;
  const woorden = t.split(/\s+/).length;
  return woorden <= MAX_WOORDEN && OPEN_BEGIN.test(t);
}
