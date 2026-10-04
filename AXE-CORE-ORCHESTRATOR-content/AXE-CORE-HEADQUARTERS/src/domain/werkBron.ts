/**
 * Eén waarheid voor taken, planner en agenda.
 *
 * De bronnen blijven waar ze zijn: core_tasks, de bestaande planner op de
 * agent-host, en cron. Hier wordt niets gekopieerd en geen tweede planner
 * verzonnen. Alleen: wie is de eigenaar, waar komt het vandaan, en twee
 * rijen voor hetzelfde werk worden één.
 */
import { agentById, type AxeAgentId } from '@/domain/agents/roster';

export type WerkOorsprong = 'luka' | 'planner' | 'cron' | 'nightly' | 'agent' | 'onbekend';

export interface WerkBronIn {
  id: string;
  title: string;
  status: string;
  assignee?: string | null;
  requested_by?: string | null;
  capability?: string | null;
  created_at?: string;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  planner?: boolean;
  cron?: boolean;
  cronNaam?: string;
  next_run_at?: string | null;
}

export interface WerkItem {
  id: string;
  titel: string;
  status: string;
  eigenaar: string;
  /** Roster-id of assignee-sleutel, voor het kluispad. */
  agentId?: string;
  oorsprong: WerkOorsprong;
  oorsprongTekst: string;
  wanneer?: string | null;
  sleutel: string;
}

/** AXE Core als assignee zonder verzoek is de dump, geen echte eigenaar. */
const GEEN_EIGENAAR = new Set(['', 'axe', 'axe-core', 'axe core', 'axecore']);

const VERSTUURT = /\b(send|email|mail|imessage|whatsapp|verstuur|stuur een)\b/i;

export function werkOorsprongVan(in_: WerkBronIn): { oorsprong: WerkOorsprong; eigenaar: string; tekst: string } {
  const meta = in_.metadata ?? {};
  const agentId = String(meta.agent ?? in_.assignee ?? '').trim();
  const agentNaam = agentNaamVan(agentId);

  const gevraagd = String(in_.requested_by ?? meta.requested_by ?? '').toLowerCase();
  const routed = String(meta.routedBy ?? meta.conversation_source ?? '');
  if (gevraagd === 'luka' || routed === 'user' || routed === 'axe_tier_router' || routed === 'axe-core') {
    return { oorsprong: 'luka', eigenaar: agentNaam || 'AXE Core', tekst: `${agentNaam || 'AXE Core'} · spoken request` };
  }
  if (in_.cron || meta.bron === 'schedule' || meta.bron === 'pg_cron') {
    return { oorsprong: 'cron', eigenaar: agentNaam || 'Cron', tekst: `Cron · ${in_.cronNaam || in_.title}` };
  }
  const plannerOorsprong = String(meta.oorsprong ?? '');
  if (plannerOorsprong === 'vervolg') {
    return { oorsprong: 'planner', eigenaar: agentNaam || 'Planner', tekst: `${agentNaam || 'Planner'} · continuation` };
  }
  if (plannerOorsprong === 'storing') {
    return { oorsprong: 'planner', eigenaar: agentNaam || 'Planner', tekst: `${agentNaam || 'Planner'} · real failure` };
  }
  if (in_.planner || meta.planner === true || in_.capability === 'planner' || gevraagd === 'planner') {
    return { oorsprong: 'onbekend', eigenaar: '', tekst: 'invented' };
  }
  if (meta.oorsprong === 'nightly' || meta.source === 'nightly') {
    return { oorsprong: 'nightly', eigenaar: agentNaam || 'AXE', tekst: `${agentNaam || 'AXE'} · nightly pass` };
  }
  if (agentNaam && agentId && !GEEN_EIGENAAR.has(agentId.toLowerCase())) {
    return { oorsprong: 'agent', eigenaar: agentNaam, tekst: `${agentNaam} · agent` };
  }
  return { oorsprong: 'onbekend', eigenaar: '', tekst: 'no owner' };
}

function agentNaamVan(raw: string): string {
  if (!raw) return '';
  const id = raw as AxeAgentId;
  try {
    const a = agentById(id);
    if (a && a.id === id) return a.name;
  } catch { /* geen roster-id */ }
  const alias: Record<string, string> = {
    'axe-core': 'AXE Core',
    'code-agent': 'AXE Developer',
    'axe-algo': 'Trading Agent',
    'maps-agent': 'NorthSea Desk Manager',
    'AXE Core': 'AXE Core',
  };
  return alias[raw] || raw;
}

export function heeftEchteEigenaar(in_: WerkBronIn): boolean {
  return werkOorsprongVan(in_).oorsprong !== 'onbekend';
}

function normTitel(t: string): string {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function werkSleutel(in_: WerkBronIn): string {
  const o = werkOorsprongVan(in_);
  if (o.oorsprong === 'cron') return `cron:${in_.id}`;
  return `${normTitel(in_.title)}|${o.eigenaar.toLowerCase()}`;
}

/** Zelfde werk, twee rijen — planner + durable, of twee inserts. */
export function zelfdeWerk(a: WerkBronIn, b: WerkBronIn): boolean {
  if (a.id && a.id === b.id) return true;
  return werkSleutel(a) === werkSleutel(b);
}

export function voegWerkSamen(rijen: readonly WerkBronIn[]): WerkItem[] {
  const uit: WerkItem[] = [];
  const gezien = new Set<string>();
  for (const r of rijen) {
    if (!heeftEchteEigenaar(r)) continue;
    const sleutel = werkSleutel(r);
    if (gezien.has(sleutel) || gezien.has(r.id)) continue;
    gezien.add(sleutel);
    gezien.add(r.id);
    const o = werkOorsprongVan(r);
    const wanneer = r.cron
      ? (r.next_run_at ?? null)
      : (typeof r.metadata?.dueAt === 'string' ? r.metadata.dueAt : r.completed_at ?? r.created_at ?? null);
    uit.push({
      id: r.id,
      titel: r.title,
      status: r.status,
      eigenaar: o.eigenaar,
      agentId: agentSleutelVan(r),
      oorsprong: o.oorsprong,
      oorsprongTekst: o.tekst,
      wanneer,
      sleutel,
    });
  }
  return uit;
}

/** Een volgende stap die zou versturen, stopt. Geen mail, geen auto_send. */
export function volgendeStapMagDoor(tekst: string): { door: boolean; vraag?: string } {
  if (VERSTUURT.test(tekst)) {
    return { door: false, vraag: 'This would send a message. It stops here until you say so.' };
  }
  if (/auto_send|auto_reply/i.test(tekst)) {
    return { door: false, vraag: 'NorthSea sending stays off.' };
  }
  return { door: true };
}

const PLANNER_NAAR_ROSTER: Record<string, string> = {
  'axe-core': 'axe',
  'code-agent': 'developer',
  'axe-algo': 'trading',
  'maps-agent': 'northsea',
};

function agentSleutelVan(in_: WerkBronIn): string | undefined {
  const raw = String(in_.metadata?.agent ?? in_.assignee ?? '').trim();
  if (!raw) return undefined;
  return PLANNER_NAAR_ROSTER[raw] ?? raw;
}

export function taakAlsBron(t: {
  id: string;
  title: string;
  status: string;
  assignee?: string | null;
  requested_by?: string | null;
  capability?: string | null;
  created_at?: string;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  planner?: boolean;
}): WerkBronIn {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    assignee: t.assignee,
    requested_by: t.requested_by,
    capability: t.capability,
    created_at: t.created_at,
    completed_at: t.completed_at,
    metadata: t.metadata,
    planner: t.planner || t.capability === 'planner' || t.metadata?.planner === true,
  };
}

export function cronAlsBron(c: {
  id: string;
  name: string;
  enabled?: boolean;
  next_run_at?: string | null;
  metadata?: Record<string, unknown> | null;
}): WerkBronIn {
  return {
    id: c.id,
    title: c.name,
    status: c.enabled === false ? 'disabled' : 'scheduled',
    metadata: { ...(c.metadata ?? {}), bron: 'schedule' },
    cron: true,
    cronNaam: c.name,
    next_run_at: c.next_run_at ?? null,
  };
}
