/**
 * Een correctie als geheugen (Luka, 18 nov 2026): "elke keer dat ik je
 * corrigeer, sla het op". Herkent wanneer Luka een blijvende regel geeft, en
 * maakt er de les van die AXE en elke manager voortaan leest.
 * Zelfde woorden als backend/axe_api/gedeeld_log.py (is_correctie).
 */
const ONTHOUD = ['onthoud', 'voortaan', 'vanaf nu', 'doe dat nooit meer', 'nooit meer', 'niet meer doen',
  'remember', 'from now on', "don't ever", 'never again'];

export function isCorrectie(tekst: string): boolean {
  const t = (tekst || '').trim().toLowerCase();
  if (t.length < 8 || t.length > 600) return false;
  return ONTHOUD.some((w) => t.startsWith(w) || t.slice(0, 40).includes(` ${w}`));
}

/** De regel zelf, zonder "onthoud:" ervoor. */
export function lesRegel(tekst: string): string {
  return tekst.trim().replace(/^(onthoud( dit)?|remember( this)?)\s*[:,-]?\s*/i, '').replace(/\s+/g, ' ').slice(0, 200);
}

export function lesBevestiging(regel: string, manager: string): string {
  return `Onthouden als les: "${regel}". Ik en alle andere managers lezen dit voortaan voordat we iets doen. (Gezegd tegen ${manager}.)`;
}
