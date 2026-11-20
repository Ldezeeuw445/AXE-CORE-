/**
 * afspraakUitZin -- een getypte "zet vrijdag 19:30 diner in mijn agenda" lezen.
 *
 * De stem kon al een afspraak maken (tool agenda_add, het model vult de velden).
 * Getypt ging de zin naar tier 1 "agenda voorlezen": het woord "agenda" won,
 * en de afspraak kwam er nooit in (FUNCTIES.md, 20 nov). Dit haalt de velden
 * er met regels uit, zonder model. De omzetting van "vrijdag"/"19:30" naar een
 * echte datum en tijd blijft in maakAfspraak, zodat er één plek is die zegt wat
 * een geldige datum is.
 */

export interface AfspraakZin {
  titel: string;
  /** Woord zoals Luka het typte: "vrijdag", "morgen", "2026-11-21". Leeg = vandaag. */
  datum: string;
  /** "19:30". Leeg als er geen tijd in stond -- dan zegt maakAfspraak dat. */
  tijd: string;
}

const TOEVOEG = /\b(zet|plan|planning|voeg|toevoegen|add|put|schedule|book|boek|inplannen|plan in)\b/i;
const IN_AGENDA = /\b(in|op|aan|to|on|into)\s+(mijn|de|my|the)\s+(agenda|calendar|kalender)\b/i;
const AFSPRAAK = /\b(afspraak|appointment|meeting)\b/i;

const DAG = '(?:vandaag|today|morgen|tomorrow|overmorgen|(?:(?:volgende|aanstaande|next|op|on)\\s+)?(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\\d{4}-\\d{2}-\\d{2})';
const DAG_RE = new RegExp(`\\b${DAG}\\b`, 'i');

/** "19:30", "19.30", "om 10 uur", "10u", "7pm", "at 9". */
const TIJD_RE = /\b(?:om|at|@)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(uur|u|h|am|pm)?\b/i;

function tijdUit(t: string): { tijd: string; rest: string } {
  const re = new RegExp(TIJD_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const [heel, u, min, suffix] = m;
    const heeftVorm = Boolean(min) || Boolean(suffix) || /^\s*(om|at|@)\b/i.test(heel);
    if (!heeftVorm) continue;
    let uur = Number(u);
    const s = (suffix || '').toLowerCase();
    if (s === 'pm' && uur < 12) uur += 12;
    if (s === 'am' && uur === 12) uur = 0;
    if (uur > 23) continue;
    const tijd = `${String(uur).padStart(2, '0')}:${min ?? '00'}`;
    return { tijd, rest: t.slice(0, m.index) + ' ' + t.slice(m.index + heel.length) };
  }
  return { tijd: '', rest: t };
}

/** Is dit een opdracht om iets IN de agenda te zetten (en niet: wat staat erin)? */
export function isAfspraakOpdracht(tekst: string): boolean {
  const t = (tekst || '').trim();
  if (!t || t.length > 160 || t.endsWith('?')) return false;
  if (!TOEVOEG.test(t)) return false;
  return IN_AGENDA.test(t) || AFSPRAAK.test(t);
}

export function afspraakUitZin(tekst: string): AfspraakZin | null {
  if (!isAfspraakOpdracht(tekst)) return null;
  let rest = ` ${tekst.trim()} `;

  const dag = DAG_RE.exec(rest);
  const datum = dag ? dag[0].replace(/^(op|on)\s+/i, '').trim() : '';
  if (dag) rest = rest.slice(0, dag.index) + ' ' + rest.slice(dag.index + dag[0].length);

  const { tijd, rest: zonderTijd } = tijdUit(rest);
  rest = zonderTijd;

  const titel = rest
    .replace(IN_AGENDA, ' ')
    .replace(/\b(kun je|can you|please|graag|alsjeblieft|voor me|for me)\b/gi, ' ')
    .replace(/\b(zet|plan|voeg|toe|toevoegen|add|put|schedule|book|boek|inplannen|in)\b/gi, ' ')
    .replace(/\b(een|an?|the|de|het)\s+(afspraak|appointment)\b/gi, ' ')
    .replace(/\b(afspraak|appointment)\s+(voor|for|met|with)\b/gi, ' $2 ')
    .replace(/^\s*(voor|for)\b/i, ' ')
    .replace(/\s+(om|at|op|on|for|voor)\s*$/i, ' ')
    .replace(/[,.!]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { titel: titel ? titel[0].toUpperCase() + titel.slice(1) : '', datum: datum || 'vandaag', tijd };
}
