/**
 * 6.6a -- harvest: een project wordt één wiki-artikel.
 *
 * De `projects/*`-rapporten (domain/tierRouter/jobRapport.ts) van één project
 * samengevoegd tot `wiki/<project>`. Kleinste eerlijke vorm: een functie die je
 * zelf aanroept ("oogst Trading OS"), geen veger die op de achtergrond je
 * geheugen herschrijft. De rapporten blijven staan; het artikel komt ernaast.
 *
 * Bij welk project een rapport hoort: de agent die het schreef (tradingos,
 * northseamgr, ...) of alle woorden van de projectnaam in titel/opdracht. Het
 * geheugenhek maakt van één job soms twee rijen (`...-job-<id>-0:<hash>`);
 * die tellen als één. Puur: geen I/O.
 */
import { mapSleutel } from './mappen';

export interface RapportRij {
  key: string;
  content: string;
  created_at?: string | null;
  tags?: string[] | null;
}

export interface Rapport {
  sleutel: string;
  titel: string;
  agent: string;
  klaar: boolean;
  opdracht: string;
  uitkomst: string;
  op: number;
}

/** Agent -> project, zodat "Trading OS" ook de rapporten van tradingos vindt. */
const AGENT_PROJECT: Record<string, string> = {
  trading: 'tradingos', tradingos: 'tradingos',
  northsea: 'northsea', northseamgr: 'northsea',
  axemanager: 'axecore', axe: 'axecore',
  thinktank: 'thinktank',
};

function plat(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
}

function sectie(tekst: string, kop: RegExp): string {
  const m = kop.exec(tekst);
  if (!m) return '';
  const rest = tekst.slice(m.index + m[0].length);
  const eind = rest.search(/\n##\s/);
  return (eind >= 0 ? rest.slice(0, eind) : rest).trim();
}

export function leesRapport(r: RapportRij): Rapport | null {
  const t = (r.content ?? '').replace(/\r/g, '');
  const kop = /^#\s+(.+)$/m.exec(t);
  if (!kop || !r.key?.startsWith('projects/')) return null;
  const agent = (/^-\s*Agent:\s*(\S+)/m.exec(t)?.[1] ?? r.tags?.[1] ?? '').toLowerCase();
  const klaar = !/^-\s*Uitkomst:\s*gestopt/m.test(t);
  return {
    // `projects/<slug>-job-<id>-0:<hash>` -> één sleutel per job.
    sleutel: r.key.replace(/:[0-9a-f]{8,}$/, ''),
    titel: kop[1].trim().replace(/^>\s*/, ''),
    agent,
    klaar,
    opdracht: sectie(t, /^##\s+Opdracht\s*$/m),
    uitkomst: sectie(t, /^##\s+(?:Resultaat|Waar het op stopte)\s*$/m),
    op: Date.parse(r.created_at ?? '') || 0,
  };
}

export function hoortBij(project: string, r: Rapport): boolean {
  const p = plat(project);
  if (!p) return false;
  if (AGENT_PROJECT[r.agent] === p || plat(r.agent) === p) return true;
  const woorden = project.toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w.length >= 3);
  if (!woorden.length) return false;
  const tekst = `${r.titel} ${r.opdracht}`.toLowerCase();
  return woorden.every((w) => tekst.includes(w));
}

/** De rapporten van één project, één per job, oudste eerst. */
export function rapportenVan(project: string, rijen: readonly RapportRij[]): Rapport[] {
  const perJob = new Map<string, Rapport>();
  for (const rij of rijen) {
    const r = leesRapport(rij);
    if (!r || !hoortBij(project, r)) continue;
    const oud = perJob.get(r.sleutel);
    if (!oud || r.op > oud.op) perJob.set(r.sleutel, r);
  }
  return [...perJob.values()].sort((a, b) => a.op - b.op);
}

function dag(ms: number): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : '?';
}

function kort(s: string, n: number): string {
  const een = s.replace(/\s+/g, ' ').trim();
  return een.length > n ? `${een.slice(0, n - 1)}…` : een;
}

export interface Artikel {
  sleutel: string;
  inhoud: string;
  aantal: number;
  klaar: number;
}

/** Het wiki-artikel, of null als er geen rapporten zijn (dan niets schrijven). */
export function oogstArtikel(project: string, rijen: readonly RapportRij[], nu = Date.now()): Artikel | null {
  const naam = project.trim().replace(/\s+/g, ' ');
  const rs = rapportenVan(naam, rijen);
  if (!naam || !rs.length) return null;
  const klaar = rs.filter((r) => r.klaar);
  const gestopt = rs.filter((r) => !r.klaar);
  const regel = (r: Rapport) => `### ${kort(r.titel, 90)} (${dag(r.op)}, ${r.agent || 'agent'})\n${kort(r.uitkomst || r.opdracht || '(geen tekst)', 600)}`;
  const delen = [
    `# ${naam}`,
    '',
    `_Geoogst op ${dag(nu)} uit ${rs.length} ${rs.length === 1 ? 'rapport' : 'rapporten'} (${dag(rs[0].op)} t/m ${dag(rs[rs.length - 1].op)}): ${klaar.length} klaar, ${gestopt.length} gestopt._`,
    '',
    '## Wat er gedaan is',
    '',
    klaar.length ? klaar.map(regel).join('\n\n') : '_Nog niets afgerond._',
    '',
    '## Waar het op stopte',
    '',
    gestopt.length ? gestopt.map(regel).join('\n\n') : '_Niets._',
    '',
    '## Bronnen',
    '',
    ...rs.map((r) => `- ${r.sleutel}`),
  ];
  return { sleutel: mapSleutel('wiki', naam), inhoud: delen.join('\n').slice(0, 8000), aantal: rs.length, klaar: klaar.length };
}

export type OogstOpdracht = { project: string };

const OOGST = /^(?:axe[,\s]+)?(?:oogst|harvest)\s+(?:het\s+|project\s+|the\s+)?(.{2,40}?)\s*[.!]*$|^(?:axe[,\s]+)?maak\s+(?:een\s+)?wiki(?:-?artikel)?\s+(?:van|over|voor)\s+(?:het\s+|project\s+)?(.{2,40}?)\s*[.!]*$/i;

export function oogstOpdracht(tekst: string): OogstOpdracht | null {
  const m = OOGST.exec((tekst ?? '').trim());
  if (!m) return null;
  const project = (m[1] ?? m[2] ?? '').trim().replace(/\s+project$/i, '');
  return project ? { project } : null;
}
