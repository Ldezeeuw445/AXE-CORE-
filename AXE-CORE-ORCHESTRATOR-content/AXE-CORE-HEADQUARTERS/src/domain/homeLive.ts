/**
 * Wat Home rond de core toont: echt werk, geen mock.
 *
 * Leest alleen wat /agents/activity, /approvals en /coding-seats al weten.
 * Lege kaarten zeggen dat eerlijk.
 */
import { agentsByTier, AXE_AGENTS, type AxeAgentId } from '@/domain/agents/roster';
import { daxRegel, eventTijd, missieVoortgang, serverStand, type ServerAgent } from '@/domain/agents/serverStatus';
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
        volgende: r.next_run_at && !r.running ? eventTijd(r.next_run_at) : (r.running ? 'now' : '—'),
        running: r.running,
        fout: r.failures > 0,
      });
    }
    for (const ev of a.events) {
      const s = eventStand(ev.event_type || ev.kind || '');
      if (!s) continue;
      recent.push({
        id: `${ev.at}-${ev.event_type}`,
        agent: naamVan(id),
        titel: ev.message || ev.event_type || s,
        stand: s,
        voortgang: ev.at ? eventTijd(ev.at) : '',
        kleur: s === 'failed' ? 'var(--err)' : 'var(--ok)',
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
    recent: recent.slice(0, 8),
    goedkeuringen: uniekeOk,
    stoelen,
    dax,
    roosters: roosters.slice(0, 8),
  };
}

export function werkPulseTekst(n: number): string {
  if (n <= 0) return 'No agents working';
  if (n === 1) return '1 agent working';
  return `${n} agents working`;
}
