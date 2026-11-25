/**
 * "Maak het van jou" (BOUWLIJST, 25 nov): de app aanpassen in gewone taal.
 *
 *   "verberg Trading"        -> tab weg uit de onderbalk en Meer
 *   "toon Trading weer"      -> terug
 *   "laat alle tabs zien"    -> alles terug
 *   "maak het groen"         -> accentkleur
 *   "andere kleuren"         -> de volgende accentkleur
 *   "standaard kleuren"      -> terug naar cyaan
 *
 * Deterministisch, zonder model, net als "doe de rij". Home en Settings kun je
 * niet verbergen: vanaf daar draai je alles terug. Geen I/O hier; de opslag
 * (localStorage + user_settings) staat in presentation/store/maakVanJouStore.
 */
import { getAllNavItems, type NavItem } from '@/domain/navRegistry';

export const KLEUREN: Record<string, string> = {
  cyaan: '#22D3EE',
  blauw: '#3B82F6',
  groen: '#10B981',
  paars: '#A855F7',
  oranje: '#F59E0B',
  roze: '#EC4899',
  rood: '#EF4444',
  geel: '#EAB308',
};
export const STANDAARD_KLEUR = 'cyaan';

const KLEUR_WOORDEN: Record<string, string> = {
  cyaan: 'cyaan', cyan: 'cyaan', turquoise: 'cyaan', turkoois: 'cyaan',
  blauw: 'blauw', blue: 'blauw',
  groen: 'groen', green: 'groen',
  paars: 'paars', purple: 'paars', violet: 'paars', lila: 'paars',
  oranje: 'oranje', orange: 'oranje', amber: 'oranje',
  roze: 'roze', pink: 'roze',
  rood: 'rood', red: 'rood',
  geel: 'geel', yellow: 'geel', goud: 'geel', gold: 'geel',
};

/** Deze blijven altijd staan: daar zet je de rest terug. */
export const NOOIT_VERBERGEN = new Set(['/', '/settings']);

export interface Voorkeur {
  verborgen: string[];
  kleur?: string;
}

export type Opdracht =
  | { soort: 'verberg' | 'toon'; pad: string; label: string }
  | { soort: 'verberg-niet'; label: string }
  | { soort: 'onbekend-tab'; naam: string }
  | { soort: 'toon-alles' }
  | { soort: 'kleur'; kleur: string }
  | { soort: 'volgende-kleur' }
  | { soort: 'standaard-kleur' };

const VERBERG = /^(?:axe[,\s]+)?(?:verberg|verstop|hide|haal)\s+(?:de\s+|het\s+|the\s+)?(.+?)(?:\s+(?:tab|tabblad|weg|away))?(?:\s+weg)?\s*[.!]*$/i;
const TOON = /^(?:axe[,\s]+)?(?:toon|laat|zet|show|unhide|breng)\s+(?:de\s+|het\s+|the\s+)?(.+?)(?:\s+(?:tab|tabblad))?\s+(?:weer|terug|back|again)(?:\s+zien)?\s*[.!]*$|^(?:axe[,\s]+)?(?:unhide|show)\s+(?:the\s+)?(.+?)(?:\s+tab)?\s*[.!]*$/i;
const ALLES = /^(?:axe[,\s]+)?(?:laat|toon|show|zet)\s+(?:alle|all)\s+(?:tabs|tabbladen)(?:\s+(?:weer|terug|back))?(?:\s+zien)?\s*[.!]*$/i;
const KLEUR = /^(?:axe[,\s]+)?(?:maak|zet|kleur|make|turn)\s+(?:het|alles|de\s+app|de\s+accentkleur|accent(?:kleur)?|it|the\s+app|everything)?\s*(?:op\s+|in\s+)?([a-z]+)\s*[.!]*$|^(?:axe[,\s]+)?(?:accentkleur|accent(?:\s+colou?r)?)\s+([a-z]+)\s*[.!]*$/i;
const VOLGENDE = /^(?:axe[,\s]+)?(?:andere|nieuwe|other|different)\s+(?:kleuren|kleur|colou?rs?)\s*(?:graag|please)?\s*[.!]*$/i;
const STANDAARD = /^(?:axe[,\s]+)?(?:standaard|originele|normale|oude|default|original)\s+(?:kleuren|kleur|colou?rs?)(?:\s+(?:terug|weer|back))?\s*[.!]*$|^(?:axe[,\s]+)?(?:reset|herstel)\s+(?:de\s+)?(?:kleuren|kleur|colou?rs?)\s*[.!]*$/i;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Een tabnaam uit de zin naar een pad. Eerst exact op label, dan op trefwoord. */
function vindTab(naam: string, items: NavItem[] = getAllNavItems()): NavItem | null {
  const n = norm(naam);
  if (!n) return null;
  return items.find((i) => norm(i.label) === n)
    ?? items.find((i) => (i.keywords ?? []).some((k) => norm(k) === n))
    ?? null;
}

export function maakVanJouOpdracht(tekst: string, items: NavItem[] = getAllNavItems()): Opdracht | null {
  const t = (tekst ?? '').trim().replace(/\s+/g, ' ');
  if (!t || t.length > 60) return null;
  if (ALLES.test(t)) return { soort: 'toon-alles' };
  if (STANDAARD.test(t)) return { soort: 'standaard-kleur' };
  if (VOLGENDE.test(t)) return { soort: 'volgende-kleur' };
  const k = KLEUR.exec(t);
  if (k) {
    const kleur = KLEUR_WOORDEN[(k[1] ?? k[2] ?? '').toLowerCase()];
    if (kleur) return { soort: 'kleur', kleur };
  }
  const toon = TOON.exec(t);
  const verberg = toon ? null : VERBERG.exec(t);
  const m = toon ?? verberg;
  if (!m) return null;
  const naam = (m[1] ?? m[2] ?? '').replace(/\s+(?:tab|tabblad)$/i, '');
  const tab = vindTab(naam, items);
  // Alleen een zin die echt over een tab gaat; "haal koffie" is geen opdracht.
  if (!tab) return /\btab|tabblad\b/i.test(t) ? { soort: 'onbekend-tab', naam } : null;
  if (verberg && NOOIT_VERBERGEN.has(tab.path)) return { soort: 'verberg-niet', label: tab.label };
  return { soort: toon ? 'toon' : 'verberg', pad: tab.path, label: tab.label };
}

/** Pas de opdracht toe op de voorkeur. Puur: oud in, nieuw uit. */
export function pasToe(v: Voorkeur, o: Opdracht): Voorkeur {
  const verborgen = new Set(v.verborgen);
  switch (o.soort) {
    case 'verberg': verborgen.add(o.pad); break;
    case 'toon': verborgen.delete(o.pad); break;
    case 'toon-alles': verborgen.clear(); break;
    case 'kleur': return { ...v, kleur: o.kleur };
    case 'standaard-kleur': return { verborgen: v.verborgen };
    case 'volgende-kleur': {
      const namen = Object.keys(KLEUREN);
      const i = namen.indexOf(v.kleur ?? STANDAARD_KLEUR);
      return { ...v, kleur: namen[(i + 1) % namen.length] };
    }
    default: return v;
  }
  return { ...v, verborgen: [...verborgen] };
}

export function antwoord(o: Opdracht, na: Voorkeur): string {
  switch (o.soort) {
    case 'verberg': return `${o.label} is verborgen. Zeg "toon ${o.label} weer" om hem terug te halen.`;
    case 'toon': return `${o.label} staat er weer.`;
    case 'toon-alles': return 'Alle tabs staan er weer.';
    case 'verberg-niet': return `${o.label} blijft staan: van daaruit zet je alles terug.`;
    case 'onbekend-tab': return `Ik ken geen tab "${o.naam}". Kijk onder More hoe hij heet.`;
    case 'kleur': return `Klaar, de accentkleur is nu ${o.kleur}. "Standaard kleuren" zet hem terug.`;
    case 'volgende-kleur': return `Nu ${na.kleur ?? STANDAARD_KLEUR}. Nog eens "andere kleuren" voor de volgende.`;
    case 'standaard-kleur': return 'De kleuren staan weer op standaard.';
  }
}

/** Uit opslag (localStorage of user_settings): alleen wat klopt komt door. */
export function leesVoorkeur(ruw: unknown): Voorkeur {
  let v: unknown = ruw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return { verborgen: [] }; }
  }
  if (!v || typeof v !== 'object') return { verborgen: [] };
  const o = v as { verborgen?: unknown; kleur?: unknown };
  const verborgen = Array.isArray(o.verborgen)
    ? o.verborgen.filter((p): p is string => typeof p === 'string' && !NOOIT_VERBERGEN.has(p))
    : [];
  const kleur = typeof o.kleur === 'string' && o.kleur in KLEUREN ? o.kleur : undefined;
  return kleur ? { verborgen, kleur } : { verborgen };
}

/** "#22D3EE" -> "34, 211, 238" voor --accent-rgb. */
export function hexNaarRgb(hex: string): string {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ');
}
