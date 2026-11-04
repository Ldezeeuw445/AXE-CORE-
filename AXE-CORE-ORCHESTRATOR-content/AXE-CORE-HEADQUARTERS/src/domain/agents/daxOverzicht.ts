/**
 * DAX bots overview rows — derived only from real /agents/activity fields
 * (dax_computer, heartbeats, always_on, routines, tasks). No fake status.
 */
import {
  daxRegel,
  DAX_HARTSLAG_MAX_MIN,
  type ServerAgent,
} from '@/domain/agents/serverStatus';
import { amsterdamKlok, amsterdamRelatief, nextTekst } from '@/domain/tijd';
import { agentById, type AxeAgentId } from '@/domain/agents/roster';

/** Known VPS DAX computers and the app/agent they own. */
export const DAX_APP_EIGENAAR: Record<string, { agentId: AxeAgentId; app: string }> = {
  'dax-northsea-01': { agentId: 'northsea', app: 'NorthSea Commodity desk' },
  'dax-trading-01': { agentId: 'trading', app: 'Trading OS' },
  'dax-developer-01': { agentId: 'developer', app: 'Developer / Code' },
  'dax-thinktank-01': { agentId: 'thinktank', app: 'ThinkTank growth' },
  'dax-browser-01': { agentId: 'browser', app: 'AXE Browser' },
};

export type DaxStandLabel = 'running' | 'blocked' | 'offline' | 'unknown';

export type DaxOverzichtRij = {
  computer: string;
  agentId: string;
  naam: string;
  app: string;
  alwaysOn: boolean;
  stand: DaxStandLabel;
  standTekst: string;
  blokkade: string;
  heartbeatAt: string | null;
  heartbeatTekst: string;
  huidigeTaak: string;
  laatsteActies: string[];
  volgendeRun: string;
  accent: string;
};

function standVan(a: ServerAgent, nu: number): { stand: DaxStandLabel; tekst: string; blokkade: string } {
  const regel = daxRegel(a, nu);
  const blokkade = regel?.blokkade || a.dax_error || (a.dax_blockers ?? []).join('; ') || '';
  if (!a.dax_computer) return { stand: 'unknown', tekst: 'no computer', blokkade };
  if (a.status === 'BLOCKED' || a.status === 'ERROR' || a.dax_status === 'error') {
    return { stand: 'blocked', tekst: a.reason || blokkade || 'blocked', blokkade };
  }
  if (regel?.wakker) {
    return { stand: 'running', tekst: a.current_action || a.dax_routine || a.reason || 'awake', blokkade };
  }
  if (a.dax_status === 'running') {
    return { stand: 'offline', tekst: `no heartbeat ≤${DAX_HARTSLAG_MAX_MIN}m`, blokkade };
  }
  if (!a.dax_heartbeat_at) {
    return { stand: 'offline', tekst: 'never measured', blokkade };
  }
  return { stand: 'offline', tekst: a.dax_status || 'offline', blokkade };
}

export function daxOverzichtRijen(
  agents: Record<string, ServerAgent>,
  nu = Date.now(),
): DaxOverzichtRij[] {
  const byComputer = new Map<string, { agentId: string; a: ServerAgent }>();

  for (const [id, a] of Object.entries(agents)) {
    if (!a?.dax_computer) continue;
    byComputer.set(a.dax_computer, { agentId: id, a });
  }

  // Ensure known always-on computers appear even if activity poll missed them.
  for (const [computer, meta] of Object.entries(DAX_APP_EIGENAAR)) {
    if (byComputer.has(computer)) continue;
    const a = agents[meta.agentId];
    if (a?.dax_computer === computer) byComputer.set(computer, { agentId: meta.agentId, a });
    else if (a && !a.dax_computer) {
      /* skip — no invented computer binding */
    }
  }

  const rijen: DaxOverzichtRij[] = [];
  for (const [computer, { agentId, a }] of byComputer) {
    const meta = DAX_APP_EIGENAAR[computer];
    const roster = agentById((meta?.agentId || agentId) as AxeAgentId);
    const { stand, tekst, blokkade } = standVan(a, nu);
    const alwaysOn = a.dax_always_on === true || Boolean(meta);
    const routine = (a.routines ?? [])[0];
    const events = (a.events ?? [])
      .slice(0, 4)
      .map((e) => {
        const t = e.at ? amsterdamKlok(e.at) : '';
        return `${t ? `${t} · ` : ''}${e.message || e.event_type || ''}`.trim();
      })
      .filter(Boolean);
    const hart = a.dax_heartbeat_at;
    rijen.push({
      computer,
      agentId: meta?.agentId || agentId,
      naam: roster?.name || a.agent || computer,
      app: meta?.app || a.role || computer,
      alwaysOn,
      stand,
      standTekst: tekst,
      blokkade,
      heartbeatAt: hart ?? null,
      heartbeatTekst: hart
        ? `${amsterdamKlok(hart)} · ${amsterdamRelatief(hart, nu)}`
        : 'never',
      huidigeTaak: a.task?.title || a.current_action || a.dax_routine || a.mission?.title || '—',
      laatsteActies: events.length ? events : (a.reason ? [a.reason] : []),
      volgendeRun: routine?.next_run_at
        ? nextTekst(routine.next_run_at, nu)
        : (a.mission?.next_action || '—'),
      accent: roster?.accent || '#22D3EE',
    });
  }

  // Stable order: known five first, then others.
  const volgorde = Object.keys(DAX_APP_EIGENAAR);
  rijen.sort((x, y) => {
    const ix = volgorde.indexOf(x.computer);
    const iy = volgorde.indexOf(y.computer);
    if (ix === -1 && iy === -1) return x.computer.localeCompare(y.computer);
    if (ix === -1) return 1;
    if (iy === -1) return -1;
    return ix - iy;
  });
  return rijen;
}

export function daxStandKleur(stand: DaxStandLabel): string {
  if (stand === 'running') return 'var(--ok, #34D399)';
  if (stand === 'blocked') return 'var(--err, #F87171)';
  if (stand === 'offline') return 'var(--warning, #F59E0B)';
  return 'var(--text-muted)';
}
