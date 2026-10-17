/**
 * Wat Home rond de core toont: echt werk, geen mock.
 *
 * Leest alleen wat /agents/activity, /approvals en /coding-seats al weten.
 * Lege kaarten zeggen dat eerlijk.
 */
import { agentsByTier, AXE_AGENTS, type AxeAgentId } from '@/domain/agents/roster';
import { daxRegel, eventTijd, missieVoortgang, serverStand, type ServerAgent } from '@/domain/agents/serverStatus';
import { mensTekst, nextTekst } from '@/domain/tijd';
import { rijenVoorAgent, type GoedkeuringsRij } from '@/domain/agents/pendingApproval';
import { stoelHeartbeatStand, type CodingSeat } from '@/domain/codingSeats';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';

const BEZIG: ReadonlySet<string> = new Set(['WORKING', 'VERIFYING', 'WAITING_TOOL']);

export type LiveTaak = {
  id: string;
  agent: string;
  titel: string;
  stand: string;
  voortgang: string;
  kleur: string;
  fout?: string;
  taskId?: string;
};

export type LiveRooster = {
  agent: string;
  naam: string;
  laatste: string;
  volgende: string;
  running: boolean;
  fout: boolean;
};

export type LiveDax = {
  agent: string;
  tekst: string;
  wakker: boolean;
  blokkade: string;
};

export type LiveStoel = {
  id: string;
  stand: string;
  toon: 'ok' | 'bad' | 'info' | 'muted';
  taak: string;
};

export type LiveRegel = {
  id: string;
  tekst: string;
  kleur: string;
  actie?: 'retry' | 'open' | 'reconnect';
};

export type HomeLiveStand = {
  werkend: number;
  namen: string[];
  lopend: LiveTaak[];
  recent: LiveTaak[];
  goedkeuringen: GoedkeuringsRij[];
  stoelen: LiveStoel[];
  dax: LiveDax[];
  roosters: LiveRooster[];
};

/** Zichtbare regels per live-kaart: 4 rijen in het vierkante blok, rest achter 'and N more'. */
export const LIVE_KAART_REGELS = 4;

export function kaartRegels<T>(items: T[]): { zicht: T[]; meer: number } {
  return {
    zicht: items.slice(0, LIVE_KAART_REGELS),
    meer: Math.max(0, items.length - LIVE_KAART_REGELS),
  };
}

const HOOFD: readonly AxeAgentId[] = [
  ...agentsByTier('tier1').map((a) => a.id),
  ...agentsByTier('tier2').map((a) => a.id),
  ...agentsByTier('tier3').map((a) => a.id),
];

function naamVan(id: string): string {
  return AXE_AGENTS.find((a) => a.id === id)?.kort
    ?? AXE_AGENTS.find((a) => a.id === id)?.name
    ?? id;
}

function eventStand(kind: string): string | null {
  const k = kind.toLowerCase();
  if (k.includes('fail') || k.includes('error') || k.includes('blocked')) return 'failed';
  if (k.includes('complete') || k.includes('done') || k.includes('verified')) return 'done';
  return null;
}

/** "task.completed" → "task completed"; echte zinnen blijven staan. */
export function eventTitel(ev: { message?: string | null; event_type?: string | null; kind?: string | null }, nu: number): string {
  const msg = (ev.message || '').trim();
  const kind = (ev.event_type || ev.kind || '').trim();
  const ruw = msg && msg.toLowerCase() !== kind.toLowerCase() ? msg : (msg || kind);
  const tekst = mensTekst(ruw, nu);
  if (/^[a-z0-9]+(\.[a-z0-9]+)+$/i.test(tekst)) return tekst.replace(/\./g, ' ');
  return tekst;
}

/** Zelfde agent + titel + stand telt één keer, nieuwste eerst in de bronlijst. */
export function recentUniek(items: LiveTaak[]): LiveTaak[] {
  const gezien = new Set<string>();
  const uit: LiveTaak[] = [];
  for (const t of items) {
    const sleutel = `${t.agent}\n${t.stand}\n${t.titel}`.toLowerCase();
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(t);
  }
  return uit;
}

export function homeLiveStand(in_: {
  agents: Record<string, ServerAgent>;
  jobs?: AxeJob[];
  extraGoedkeuringen?: Array<{ id: string; task_id?: string; wat?: string | null; waarom?: string | null; title?: string; detail?: string }>;
  stoelen?: Array<Pick<CodingSeat, 'id' | 'logged_in' | 'rate_limited' | 'current_task' | 'last_seen_at' | 'config_exists'>>;
  nu?: number;
}): HomeLiveStand {
  const nu = in_.nu ?? Date.now();
  const extra = in_.extraGoedkeuringen ?? [];
  const werkNamen = new Set<string>();
  const lopend: LiveTaak[] = [];
  const recent: LiveTaak[] = [];
  const goedkeuringen: GoedkeuringsRij[] = [];
  const dax: LiveDax[] = [];
  const roosters: LiveRooster[] = [];

  for (const id of HOOFD) {
    const a = in_.agents[id];
    if (!a) continue;
    const stand = serverStand(a);
    if (BEZIG.has(a.status) || a.status === 'WAITING_APPROVAL' || a.status === 'QUEUED' || a.status === 'BLOCKED') {
      werkNamen.add(naamVan(id));
      lopend.push({
        id: a.task?.id || a.mission?.id || id,
        agent: naamVan(id),
        titel: stand.regel || a.reason || a.task?.title || a.mission?.title || stand.label,
        stand: stand.label,
        voortgang: missieVoortgang(a.mission),
        kleur: stand.kleur,
      });
    }
    for (const rij of rijenVoorAgent(a, extra)) goedkeuringen.push(rij);
    const dr = daxRegel(a, nu);
    if (dr) dax.push({ agent: naamVan(id), tekst: dr.tekst, wakker: dr.wakker, blokkade: dr.blokkade });
    for (const r of a.routines ?? []) {
      roosters.push({
        agent: naamVan(id),
        naam: r.name,
        laatste: r.last_run_at ? eventTijd(r.last_run_at) : 'never',
        volgende: r.running ? 'now' : nextTekst(r.next_run_at, nu),
        running: r.running,
        fout: r.failures > 0,
      });
    }
    for (const ev of a.events) {
      const s = eventStand(ev.event_type || ev.kind || '');
      if (!s) continue;
      recent.push({
        id: ev.task_id || `${ev.at}-${ev.event_type}`,
        agent: naamVan(id),
        titel: eventTitel(ev, nu),
        stand: s,
        voortgang: ev.at ? eventTijd(ev.at) : '',
        kleur: s === 'failed' ? 'var(--err)' : 'var(--ok)',
        fout: s === 'failed' ? (ev.message || ev.event_type || 'failed') : undefined,
        taskId: ev.task_id || undefined,
      });
    }
  }

  for (const job of in_.jobs ?? []) {
    if (job.state === 'queued' || job.state === 'running' || job.state === 'waiting') {
      werkNamen.add(naamVan(job.agent));
    }
  }

  const gezienOk = new Set<string>();
  const uniekeOk = goedkeuringen.filter((g) => {
    if (gezienOk.has(g.id)) return false;
    gezienOk.add(g.id);
    return true;
  });

  const stoelen: LiveStoel[] = (in_.stoelen ?? []).map((s) => {
    const stand = stoelHeartbeatStand(s, nu);
    return {
      id: s.id,
      stand: stand.tekst,
      toon: stand.toon,
      taak: s.current_task || (stand.tekst === 'Not used' ? 'not used' : 'idle'),
    };
  });

  return {
    werkend: werkNamen.size,
    namen: [...werkNamen],
    lopend,
    recent: recentUniek(recent),
    goedkeuringen: uniekeOk,
    stoelen,
    dax,
    roosters,
  };
}

export function seatsRegels(stand: HomeLiveStand): LiveRegel[] {
  const uit: LiveRegel[] = [];
  for (const s of stand.stoelen) {
    const slecht = s.toon === 'bad' || s.stand === 'Logged out' || s.stand === 'Offline';
    uit.push({
      id: `seat-${s.id}`,
      tekst: `${s.id} · ${s.stand}${s.taak && s.taak !== 'idle' && s.taak !== 'not used' ? ` · ${s.taak}` : ''}`,
      kleur: s.toon === 'ok' || s.toon === 'info' ? 'var(--ok)' : slecht ? 'var(--err)' : 'var(--text-muted)',
      actie: s.stand === 'Logged out' || s.stand === 'Offline' ? 'reconnect' : s.stand === 'Rate limited' ? 'retry' : undefined,
    });
  }
  for (const d of stand.dax) {
    uit.push({
      id: `dax-${d.agent}`,
      tekst: `${d.agent} · ${d.tekst}`,
      kleur: d.wakker ? 'var(--accent-cyan)' : 'var(--text-muted)',
    });
  }
  for (const r of stand.roosters) {
    uit.push({
      id: `cron-${r.agent}-${r.naam}`,
      tekst: `${r.agent} · ${r.naam} · last ${r.laatste} · ${r.volgende}${r.fout ? ' · failed last run' : ''}`,
      kleur: r.fout ? 'var(--err)' : 'var(--text-secondary)',
      actie: r.fout ? 'retry' : undefined,
    });
  }
  return uit;
}

export function werkPulseTekst(n: number, ok = 0): string {
  const werk = n <= 0 ? 'No agents working' : n === 1 ? '1 agent working' : `${n} agents working`;
  if (ok <= 0) return werk;
  if (ok === 1) return `${werk} · 1 needs your OK`;
  return `${werk} · ${ok} need your OK`;
}
