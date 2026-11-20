/**
 * Notch ronde 3 (Luka 20 nov, "zoals de foto's"): de widgets onder het eiland.
 * Hier alleen het rekenwerk -- focus-timer, de Join-kaart vlak voor een
 * afspraak, het weer in één woord, taakjes -- zodat het zonder scherm te testen is.
 */
import type { Afspraak } from '@/domain/agenda/afspraken';

/* ── Focus-timer ─────────────────────────────────────────────────────────── */

export interface Focus {
  /** ms sinds epoch waarop hij (weer) liep; null = gepauzeerd. */
  sinds: number | null;
  /** Al verstreken ms vóór `sinds` (na pauzes). */
  gehad: number;
  duurMin: number;
}

export const FOCUS_SLEUTEL = 'axe_notch_focus_v1';
export const FOCUS_DUREN = [15, 25, 50] as const;

export function nieuweFocus(duurMin = 25, nu = Date.now()): Focus {
  return { sinds: nu, gehad: 0, duurMin };
}

export function verstreken(f: Focus, nu = Date.now()): number {
  return f.gehad + (f.sinds === null ? 0 : Math.max(0, nu - f.sinds));
}

export function focusStand(f: Focus | null, nu = Date.now()): { loopt: boolean; klaar: boolean; tekst: string; deel: number } | null {
  if (!f) return null;
  const totaal = f.duurMin * 60_000;
  const rest = Math.max(0, totaal - verstreken(f, nu));
  const s = Math.ceil(rest / 1000);
  return {
    loopt: f.sinds !== null && rest > 0,
    klaar: rest === 0,
    tekst: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    deel: totaal ? 1 - rest / totaal : 1,
  };
}

export function pauzeer(f: Focus, nu = Date.now()): Focus {
  return f.sinds === null ? f : { ...f, sinds: null, gehad: verstreken(f, nu) };
}

export function hervat(f: Focus, nu = Date.now()): Focus {
  return f.sinds !== null ? f : { ...f, sinds: nu };
}

/* ── Agenda: Join-kaart ──────────────────────────────────────────────────── */

const LINK_RE = /https?:\/\/[^\s<>"')]+/i;
const VERGADER_RE = /(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|whereby\.com|webex\.com|facetime\.apple\.com)/i;

/** De vergaderlink uit plaats of notitie; een gewone link alleen als er geen vergaderlink is. */
export function vergaderLink(a: Pick<Afspraak, 'plaats' | 'notitie'>): string | null {
  const teksten = [a.plaats, a.notitie].filter((t): t is string => !!t);
  const links = teksten.flatMap((t) => t.match(new RegExp(LINK_RE, 'gi')) ?? []);
  return links.find((l) => VERGADER_RE.test(l)) ?? links[0] ?? null;
}

function startVan(a: Afspraak): number {
  const [j, m, d] = a.datum.split('-').map(Number);
  const [u, mi] = a.tijd.split(':').map(Number);
  return new Date(j, m - 1, d, u, mi).getTime();
}

export interface Aankomend {
  id: string;
  titel: string;
  tijd: string;
  /** Minuten tot de start; negatief = al begonnen. */
  over: number;
  link: string | null;
  /** Binnen 4 min of net begonnen: groot met Join (zoals op de foto). */
  nu: boolean;
}

/** De eerstvolgende afspraak van vandaag die nog niet voorbij is. */
export function aankomend(lijst: Afspraak[], nu = new Date()): Aankomend | null {
  const t = nu.getTime();
  const kandidaten = lijst
    .filter((a) => a.status !== 'geannuleerd')
    .map((a) => ({ a, start: startVan(a) }))
    .filter(({ a, start }) => {
      const eind = start + (a.duurMin || 60) * 60_000;
      const zelfdeDag = new Date(start).toDateString() === nu.toDateString();
      return zelfdeDag && eind > t && start - t < 24 * 3600_000;
    })
    .sort((x, y) => x.start - y.start);
  const eerst = kandidaten[0];
  if (!eerst) return null;
  const over = Math.round((eerst.start - t) / 60_000);
  return {
    id: eerst.a.id,
    titel: eerst.a.titel,
    tijd: eerst.a.tijd,
    over,
    link: vergaderLink(eerst.a),
    nu: over <= 4 && over >= -10,
  };
}

export function overTekst(over: number): string {
  if (over <= 0) return over === 0 ? 'now' : `started ${-over} min ago`;
  if (over < 60) return `in ${over} min`;
  const u = Math.floor(over / 60);
  const m = over % 60;
  return m ? `in ${u}h ${m}m` : `in ${u}h`;
}

/* ── Weer ────────────────────────────────────────────────────────────────── */

/** WMO-weercode (open-meteo) naar een teken en één woord. */
export function weerWoord(code: number): { teken: string; woord: string } {
  if (code === 0) return { teken: '☀️', woord: 'Clear' };
  if (code <= 2) return { teken: '🌤️', woord: 'Partly cloudy' };
  if (code === 3) return { teken: '☁️', woord: 'Cloudy' };
  if (code === 45 || code === 48) return { teken: '🌫️', woord: 'Fog' };
  if (code >= 51 && code <= 57) return { teken: '🌦️', woord: 'Drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { teken: '🌧️', woord: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { teken: '🌨️', woord: 'Snow' };
  if (code >= 95) return { teken: '⛈️', woord: 'Thunder' };
  return { teken: '🌡️', woord: 'Weather' };
}

/* ── Taakjes ─────────────────────────────────────────────────────────────── */

export interface Taakje {
  id: string;
  tekst: string;
  af: boolean;
}

export const TAKEN_SLEUTEL = 'axe_notch_taken_v1';
export const NOTITIE_SLEUTEL = 'axe_notch_notitie_v1';

export function leesTaken(x: unknown): Taakje[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((t): t is Taakje => !!t && typeof t === 'object' && typeof (t as Taakje).tekst === 'string')
    .map((t) => ({ id: String(t.id ?? t.tekst), tekst: t.tekst.slice(0, 140), af: !!t.af }))
    .slice(0, 30);
}

export function voegToe(lijst: Taakje[], tekst: string, id = `${Date.now()}`): Taakje[] {
  const schoon = tekst.trim().slice(0, 140);
  return schoon ? [...lijst, { id, tekst: schoon, af: false }] : lijst;
}

/** Afgevinkt blijft vandaag zichtbaar onderaan; open taken eerst. */
export function geordend(lijst: Taakje[]): Taakje[] {
  return [...lijst.filter((t) => !t.af), ...lijst.filter((t) => t.af)];
}

/* ── Tijd bij een bericht (Luka 20 nov: "dat je een tijd ziet en alles") ── */

/** "23:14" vandaag, "yesterday 21:04", anders "18 Nov 09:02". */
export function berichtTijd(at: number, nu = new Date()): string {
  if (!at || Number.isNaN(at)) return '';
  const d = new Date(at);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === nu.toDateString()) return hm;
  const gisteren = new Date(nu);
  gisteren.setDate(nu.getDate() - 1);
  if (d.toDateString() === gisteren.toDateString()) return `yesterday ${hm}`;
  const maand = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${maand} ${hm}`;
}

/** Datum + tijd rechts in de bovenbalk, zoals op de foto ("Fri 20 Nov 23:17"). */
export function balkTijd(nu = new Date()): string {
  const dag = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][nu.getDay()];
  const maand = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][nu.getMonth()];
  return `${dag} ${nu.getDate()} ${maand} ${String(nu.getHours()).padStart(2, '0')}:${String(nu.getMinutes()).padStart(2, '0')}`;
}
