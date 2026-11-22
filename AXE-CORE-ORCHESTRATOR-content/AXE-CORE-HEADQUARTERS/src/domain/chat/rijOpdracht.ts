/**
 * "Doe de rij" in de chat: herkennen en het antwoord in gewone taal.
 *
 * Deterministisch -- geen model nodig om te snappen dat Luka de rij wil.
 * Het werk zelf staat op de VPS (backend/axe_api/rij.py). Geen I/O hier.
 */
export type RijActie = 'begin' | 'stop' | 'stand';

const BEGIN = /^(?:axe[,\s]+)?(?:doe|werk|start|begin(?:\s+met)?)\s+(?:de\s+|je\s+|jouw\s+)?rij(?:\s+af)?\s*[.!]*$|^(?:do|work)\s+(?:the|your)\s+(?:queue|row|list)\s*[.!]*$/i;
const STOP = /^(?:axe[,\s]+)?(?:stop|stopp?en?|pauzeer)\s+(?:(?:met\s+)?de\s+)?rij\s*[.!]*$|^stop\s+the\s+(?:queue|row)\s*[.!]*$/i;
const STAND = /^(?:axe[,\s]+)?(?:hoe\s+(?:staat|gaat)\s+(?:het\s+met\s+)?de\s+rij|waar\s+is\s+de\s+rij|stand\s+van\s+de\s+rij)\s*\??$/i;

export function rijActie(tekst: string): RijActie | null {
  const t = (tekst ?? '').trim().replace(/\s+/g, ' ');
  if (!t || t.length > 60) return null;
  if (STOP.test(t)) return 'stop';
  if (STAND.test(t)) return 'stand';
  if (BEGIN.test(t)) return 'begin';
  return null;
}

export interface RijUitslag {
  toegevoegd?: number;
  stand?: string;
  taak?: string | null;
  nu?: string | null;
  open?: number;
  gestopt?: number;
  kan_erin?: number;
}

function stappen(n: number): string {
  return n === 1 ? '1 stap' : `${n} stappen`;
}

export function rijAntwoord(actie: RijActie, u: RijUitslag): string {
  if (actie === 'stop') {
    return u.gestopt
      ? `De rij is gestopt: ${stappen(u.gestopt)} staan weer open. Wat al draaide, maak ik af.`
      : 'Er stond niets in de rij om te stoppen.';
  }
  if (actie === 'stand') {
    if (u.stand === 'bezig') return `Ik werk nu aan: ${u.nu}. Daarna nog ${stappen(u.open ?? 0)} in de rij.`;
    if (u.open) return `Er staan ${stappen(u.open)} in de rij; de volgende start binnen twee minuten.`;
    return u.kan_erin
      ? `De rij is leeg. Er staan ${stappen(u.kan_erin)} van de AI open; zeg "doe de rij" en ik begin.`
      : 'De rij is leeg en er staat niets van de AI open.';
  }
  const erbij = u.toegevoegd ?? 0;
  const nu = u.stand === 'gestart' ? u.taak : u.stand === 'bezig' ? u.taak : null;
  if (!erbij && !nu && !u.open) {
    return 'Er staat niets van de AI open dat ik zelf mag doen. Trading, geld, akkoorden en wissen laat ik bij jou.';
  }
  const kop = erbij ? `Ik werk ${stappen(erbij)} af, één voor één.` : 'De rij liep al.';
  const nuRegel = nu ? ` Nu: ${nu}.` : '';
  const rest = u.open ? ` Daarna nog ${stappen(u.open)}.` : '';
  return `${kop}${nuRegel}${rest} Elke stap komt in het log; trading, geld, akkoorden en wissen laat ik bij jou.`;
}
