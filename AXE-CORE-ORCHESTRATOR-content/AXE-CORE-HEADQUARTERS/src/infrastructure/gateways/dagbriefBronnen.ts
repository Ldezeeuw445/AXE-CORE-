/**
 * De bronnen van de Daily Brief, elk los en elk met een eerlijke fout.
 *
 *   * GitHub: commits op de hoofdbranch en PR's per repo, sinds "sinds".
 *     Openbare repo's lukken zonder sleutel (60 verzoeken per uur, en deze
 *     pagina kost er 2 per repo, dus een cache van 10 minuten). Een privé-repo
 *     zonder sleutel zegt dat, in plaats van stil leeg te blijven.
 *   * Supabase (Luka's sessie): core_tasks en core_notifications.
 *   * De VPS: /health.
 *
 * Het samenvoegen tot secties gebeurt in domain/dagbrief.ts.
 */
import { sessieClient } from '@/infrastructure/supabase/supabaseClient';
import { VPS_API_ORIGIN } from '@/infrastructure/config/apiUrl';
import type { BriefCommit, BriefGezondheid, BriefInvoer, BriefMelding, BriefPr, BriefTaak } from '@/domain/dagbrief';

interface Repo { eigenaar: string; naam: string; branch: string; label: string }

export const BRIEF_REPOS: Repo[] = [
  { eigenaar: 'Ldezeeuw445', naam: 'AXE-CORE-', branch: 'orchestrator', label: 'AXE Core' },
  { eigenaar: 'Ldezeeuw445', naam: 'AXE-COMPANION-OS-', branch: 'main', label: 'AXE Companion' },
  { eigenaar: 'Ldezeeuw445', naam: 'axon-memory', branch: 'main', label: 'AXON Memory' },
  { eigenaar: 'Ldezeeuw445', naam: 'trading-os-app', branch: 'main', label: 'Trading OS' },
  { eigenaar: 'Ldezeeuw445', naam: 'axe-core-android', branch: 'main', label: 'Device Manager' },
  { eigenaar: 'Ldezeeuw445', naam: 'northsea-commodity', branch: 'main', label: 'NorthSea' },
];

const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 12_000;

async function json(url: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/vnd.github+json' } });
    return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
  } finally {
    window.clearTimeout(t);
  }
}

function uitCache<T>(sleutel: string): T | null {
  try {
    const rauw = sessionStorage.getItem(sleutel);
    if (!rauw) return null;
    const { op, waarde } = JSON.parse(rauw) as { op: number; waarde: T };
    return Date.now() - op < CACHE_MS ? waarde : null;
  } catch {
    return null;
  }
}

function inCache(sleutel: string, waarde: unknown): void {
  try { sessionStorage.setItem(sleutel, JSON.stringify({ op: Date.now(), waarde })); } catch { /* vol of privé */ }
}

interface GhCommit { sha: string; html_url: string; commit: { message: string; author?: { name?: string; date?: string } } }
interface GhPr {
  number: number; title: string; body: string | null; state: string; draft?: boolean; merged_at: string | null;
  html_url: string; updated_at: string; head?: { ref?: string };
}

async function github(repo: Repo, sinds: string): Promise<{ commits: BriefCommit[]; prs: BriefPr[]; fout?: string }> {
  const sleutel = `axe-brief:${repo.naam}:${sinds.slice(0, 13)}`;
  const bewaard = uitCache<{ commits: BriefCommit[]; prs: BriefPr[] }>(sleutel);
  if (bewaard) return bewaard;
  const basis = `https://api.github.com/repos/${repo.eigenaar}/${repo.naam}`;
  const [c, p] = await Promise.all([
    json(`${basis}/commits?sha=${encodeURIComponent(repo.branch)}&since=${encodeURIComponent(sinds)}&per_page=100`),
    json(`${basis}/pulls?state=all&sort=updated&direction=desc&per_page=40`),
  ]);
  if (c.status === 404) return { commits: [], prs: [], fout: `${repo.label}: private repo, needs the GitHub key` };
  if (c.status === 403 || c.status === 429) return { commits: [], prs: [], fout: `${repo.label}: GitHub rate limit, try again in a while` };
  if (!c.ok) return { commits: [], prs: [], fout: `${repo.label}: GitHub answered ${c.status}` };
  const commits = ((c.data as GhCommit[]) ?? []).map(x => {
    const [titel, ...rest] = (x.commit.message ?? '').split('\n');
    return {
      repo: repo.label, sha: x.sha.slice(0, 8), titel: titel.trim(), body: rest.join('\n'),
      auteur: x.commit.author?.name ?? '', datum: x.commit.author?.date ?? '', url: x.html_url,
    };
  });
  const prs = ((p.ok ? (p.data as GhPr[]) : []) ?? [])
    .filter(x => Date.parse(x.updated_at) >= Date.parse(sinds))
    .map<BriefPr>(x => ({
      repo: repo.label, nummer: x.number, titel: x.title, body: x.body ?? '',
      staat: x.merged_at ? 'merged' : x.state === 'open' ? 'open' : 'closed',
      draft: Boolean(x.draft), head: x.head?.ref ?? '', url: x.html_url, bijgewerkt: x.updated_at,
    }));
  const uit = { commits, prs };
  inCache(sleutel, uit);
  return uit;
}

async function supabase(sinds: string): Promise<{ taken: BriefTaak[]; meldingen: BriefMelding[]; fout?: string }> {
  const sb = await sessieClient();
  if (!sb) return { taken: [], meldingen: [], fout: 'AXE Core data: not signed in' };
  const [t, m] = await Promise.all([
    sb.from('core_tasks').select('title, status, assignee, requested_by, updated_at')
      .gte('updated_at', sinds).order('updated_at', { ascending: false }).limit(400),
    sb.from('core_notifications').select('type, message, created_at')
      .gte('created_at', sinds).order('created_at', { ascending: false }).limit(200),
  ]);
  const fout = t.error?.message || m.error?.message;
  return {
    taken: ((t.data ?? []) as { title: string; status: string; assignee: string | null; requested_by: string | null; updated_at: string }[])
      .map(r => ({ titel: r.title, status: r.status, assignee: r.assignee, requestedBy: r.requested_by, bijgewerkt: r.updated_at })),
    meldingen: ((m.data ?? []) as { type: string; message: string; created_at: string }[])
      .map(r => ({ type: r.type, message: r.message ?? '', createdAt: r.created_at })),
    ...(fout ? { fout: `AXE Core data: ${fout}` } : {}),
  };
}

async function gezondheid(): Promise<BriefGezondheid | null> {
  try {
    const r = await json(`${VPS_API_ORIGIN}/health`);
    const d = r.data as { status?: string; degraded?: string[] } | null;
    return d ? { status: d.status ?? 'unknown', degraded: d.degraded ?? [] } : null;
  } catch {
    return null;
  }
}

/** Alles voor de brief, sinds `sinds`. Een bron die faalt komt in bronFouten, de rest gaat door. */
export async function haalDagbriefInvoer(sinds: string, opties: { vers?: boolean } = {}): Promise<BriefInvoer> {
  if (opties.vers) {
    try {
      for (const k of Object.keys(sessionStorage)) if (k.startsWith('axe-brief:')) sessionStorage.removeItem(k);
    } catch { /* niets te wissen */ }
  }
  const [gh, sb, h] = await Promise.all([
    Promise.all(BRIEF_REPOS.map(r => github(r, sinds).catch(e => ({ commits: [], prs: [], fout: `${r.label}: ${String((e as Error)?.message ?? e)}` })))),
    supabase(sinds).catch(e => ({ taken: [], meldingen: [], fout: `AXE Core data: ${String((e as Error)?.message ?? e)}` })),
    gezondheid(),
  ]);
  const bronFouten = [...gh.map(g => g.fout).filter(Boolean), sb.fout].filter(Boolean) as string[];
  return {
    sinds,
    commits: gh.flatMap(g => g.commits),
    prs: gh.flatMap(g => g.prs),
    taken: sb.taken,
    meldingen: sb.meldingen,
    gezondheid: h,
    bronFouten,
  };
}
