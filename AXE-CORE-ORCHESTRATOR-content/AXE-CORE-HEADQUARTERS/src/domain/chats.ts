/**
 * Chats-pagina (BOUWLIJST, 25 nov): elk gesprek met AXE en de managers doorzoekbaar.
 * De VPS levert treffers en een overzicht (/chats/search, /chats/overview); hier alleen
 * hoe een gesprek heet, welke kleur het heeft, en hoe een tijd leest.
 */
import { AXE_AGENTS } from '@/domain/agents/roster';

export interface ChatTreffer {
  bron: 'axe' | 'manager';
  gesprek: string;
  gesprek_id: string | null;
  wie: string;
  tekst: string;
  op: string | null;
  id: string;
}

export interface ChatRegel {
  wie: string;
  tekst: string;
  op: string | null;
}

export interface ChatGesprek {
  bron: 'axe' | 'manager';
  gesprek: string;
  gesprek_id: string;
  laatst: string | null;
  deze_week: number;
  laatste_regels: ChatRegel[];
}

/** 'companionmgr' -> 'AXE Companion Manager'; onbekend blijft zoals het is. */
export function gesprekNaam(id: string): string {
  if (!id || id === 'AXE') return 'AXE';
  const a = AXE_AGENTS.find(x => x.id === id);
  return a ? a.name : id;
}

export function gesprekKleur(id: string): string {
  const a = AXE_AGENTS.find(x => x.id === (id === 'AXE' ? 'axe' : id));
  return (a && 'accent' in a && typeof a.accent === 'string') ? a.accent : 'var(--accent-cyan)';
}

/** "14:05" vandaag, "gisteren 14:05", anders "24 nov 14:05". */
export function wanneer(iso: string | null, nu: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tijd = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dag = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (dag(d) === dag(nu)) return tijd;
  const gisteren = new Date(nu); gisteren.setDate(nu.getDate() - 1);
  if (dag(d) === dag(gisteren)) return `yesterday ${tijd}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${tijd}`;
}

/** Het zoekwoord in een stukje tekst, als delen: [{tekst, raak}]. */
export function markeer(tekst: string, q: string): { tekst: string; raak: boolean }[] {
  if (!q.trim()) return [{ tekst, raak: false }];
  const delen: { tekst: string; raak: boolean }[] = [];
  const laag = tekst.toLowerCase();
  const zoek = q.trim().toLowerCase();
  let i = 0;
  for (;;) {
    const j = laag.indexOf(zoek, i);
    if (j < 0) { if (i < tekst.length) delen.push({ tekst: tekst.slice(i), raak: false }); break; }
    if (j > i) delen.push({ tekst: tekst.slice(i, j), raak: false });
    delen.push({ tekst: tekst.slice(j, j + zoek.length), raak: true });
    i = j + zoek.length;
  }
  return delen;
}

/** "De feed werkt weer [2] [5]." -> tekst- en bron-delen, zodat [n] klikbaar wordt. */
export function metBronnen(antwoord: string): ({ tekst: string } | { n: number })[] {
  const delen: ({ tekst: string } | { n: number })[] = [];
  let rest = antwoord;
  const re = /\[(\d{1,3})\]/;
  for (;;) {
    const m = re.exec(rest);
    if (!m) { if (rest) delen.push({ tekst: rest }); break; }
    if (m.index > 0) delen.push({ tekst: rest.slice(0, m.index) });
    delen.push({ n: Number(m[1]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return delen;
}
