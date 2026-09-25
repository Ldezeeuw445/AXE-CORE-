/**
 * Regels voor achtergrondjobs en de stemlus. Geen I/O.
 * De roster-agent is wie het werk doet; de job-state is wat de balk toont.
 */
import type { AxeAgentId } from '@/domain/agents/roster';
import { agentById } from '@/domain/agents/roster';
import type { AxeRoute } from '@/domain/tierRouter/axeRoute';
import { TOOL_TIERS } from '@/domain/tools/riskTiers';

export type AxeJobState = 'queued' | 'running' | 'waiting' | 'done' | 'failed';

export interface AxeJob {
  id: string;
  title: string;
  agent: AxeAgentId;
  state: AxeJobState;
  startedAt: number;
  finishedAt?: number;
  summary?: string;
  taskId?: string;
  sourceText: string;
  /** Wat de agent nu doet, in gewone taal (uit core_task_events). */
  stappen?: string[];
}

export type StemlusStand = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

type StemlusEvent =
  | { type: 'mic-on' }
  | { type: 'mic-off' }
  | { type: 'heard' }
  | { type: 'answered' }
  | { type: 'barge-in' }
  | { type: 'esc' }
  | { type: 'fail' }
  | { type: 'job-result' };

interface StemlusKeuze {
  stand: StemlusStand;
  stopTts: boolean;
  queueSpeech: boolean;
  speakNow: boolean;
  cancelListen: boolean;
}

/** Job-resultaat mag de gebruiker niet afkappen. Wachten tot hij klaar is. */
export function moetSpraakWachtrij(stand: StemlusStand, bron: 'ack' | 'job'): boolean {
  if (bron === 'ack') return false;
  return stand === 'listening' || stand === 'speaking';
}

export function stemlusOvergang(stand: StemlusStand, event: StemlusEvent): StemlusKeuze {
  switch (event.type) {
    case 'mic-on':
      return { stand: 'listening', stopTts: true, queueSpeech: false, speakNow: false, cancelListen: false };
    case 'mic-off':
    case 'esc':
      return { stand: 'idle', stopTts: true, queueSpeech: false, speakNow: false, cancelListen: true };
    case 'heard':
      return { stand: 'thinking', stopTts: true, queueSpeech: false, speakNow: false, cancelListen: false };
    case 'answered':
      return { stand: 'speaking', stopTts: false, queueSpeech: false, speakNow: true, cancelListen: false };
    case 'barge-in':
      return { stand: 'listening', stopTts: true, queueSpeech: false, speakNow: false, cancelListen: false };
    case 'fail':
      return { stand: 'error', stopTts: true, queueSpeech: false, speakNow: false, cancelListen: false };
    case 'job-result':
      return {
        stand,
        stopTts: false,
        queueSpeech: moetSpraakWachtrij(stand, 'job'),
        speakNow: !moetSpraakWachtrij(stand, 'job') && stand !== 'thinking',
        cancelListen: false,
      };
    default:
      return { stand, stopTts: false, queueSpeech: false, speakNow: false, cancelListen: false };
  }
}

export function jobAgentVan(route: AxeRoute, text: string): AxeAgentId {
  if (route.agent !== 'axe') return route.agent;
  if (/\b(northsea|north sea)\b/i.test(text)) return 'northsea';
  if (/\b(news|nieuws|intel)\b/i.test(text)) return 'intel';
  if (/\b(cron|scheduled job)\b/i.test(text)) return 'cron';
  if (route.tier === 2) return 'browser';
  return 'task';
}

export function jobTitelVan(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 42 ? `${t.slice(0, 40)}…` : t;
}

export function bouwMultiAck(stukken: Array<{ text: string; agent: AxeAgentId }>): string {
  if (stukken.length === 0) return "On it. I'll report back.";
  if (stukken.length === 1) {
    const naam = agentById(stukken[0].agent).name;
    return `On it. Handing this to ${naam} — I'll report back.`;
  }
  const namen = stukken.map((s) => agentById(s.agent).name);
  return `On it — ${stukken.length} jobs: ${namen.join(', ')}. I'll report back.`;
}

/**
 * Loopt deze job nog? Eén definitie, want twee plekken die hier anders over
 * dachten gaven twee verschillende aantallen op hetzelfde scherm: de balk
 * (lopendeJobs in axeJobStore) telde 'waiting' mee, de gesproken samenvatting
 * niet. Een taak die op jouw ok wacht is niet klaar, dus hij loopt.
 */
export function jobLoopt(state: AxeJobState): boolean {
  return state === 'queued' || state === 'running' || state === 'waiting';
}

export function sessieSamenvatting(jobs: AxeJob[]): string {
  if (jobs.length === 0) return 'Nothing running this session. No finished jobs yet.';
  const lopend = jobs.filter((j) => jobLoopt(j.state));
  const regels = jobs.slice(-8).map((j) => {
    const naam = agentById(j.agent).name;
    if (j.state === 'done') return `• ${naam} — done: ${j.summary || j.title}`;
    if (j.state === 'failed') return `• ${naam} — failed: ${j.summary || j.title}`;
    return `• ${naam} — ${j.state}: ${j.title}`;
  });
  const kop = lopend.length
    ? `${lopend.length} agent${lopend.length === 1 ? '' : 's'} running.`
    : 'No agents running.';
  return `${kop}\n${regels.join('\n')}`;
}

export function jobResultaatTekst(job: AxeJob): string {
  const naam = agentById(job.agent).name;
  if (job.state === 'failed') return `${naam}: that did not work. ${job.summary || ''}`.trim();
  return `${naam}: ${job.summary || job.title}`;
}

/**
 * Hoe lang iets loopt, zoals je het zou zeggen. Geen "0.05 uur".
 */
export function duurTekst(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const uur = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${uur}h ${rest}m` : `${uur}h`;
}

/**
 * Eén regel gewone taal over waar een taak staat: laatste stap, hoe lang hij
 * loopt, en in welke staat. Dit is wat AXE hardop zegt als je vraagt "en die
 * taak dan?" — dus geen statuscodes, geen tijdstempels om te ontcijferen.
 *
 * `nu` is een parameter zodat de functie puur blijft en de test niet hoeft te
 * wachten tot de klok verder tikt.
 */
export function jobStatusTekst(job: AxeJob, nu: number = Date.now()): string {
  const naam = agentById(job.agent).name;
  const stappen = job.stappen ?? [];
  const stap = (stappen.length ? stappen[stappen.length - 1] : '').trim();
  // Een afgeronde job meet tot zijn eindtijd, niet tot nu: anders groeit de
  // duur van iets dat gisteren klaar was gewoon door.
  const duur = duurTekst((job.finishedAt ?? nu) - job.startedAt);
  const staart = stap ? ` Last step: ${stap}.` : '';
  switch (job.state) {
    case 'queued':
      return `${naam} hasn't started on ${job.title} yet — queued for ${duur}.${staart}`;
    case 'running':
      return `${naam} is working on ${job.title} — running for ${duur}.${staart}`;
    case 'waiting':
      return `${naam} is on hold for ${job.title} — waiting for your OK for ${duur}.${staart}`;
    case 'done':
      return `${naam} finished ${job.title} in ${duur}: ${job.summary || 'done'}.`;
    case 'failed':
      return `${naam} gave up on ${job.title} after ${duur}: ${job.summary || 'no reason given'}.`;
    default:
      return `${naam} — ${job.state}: ${job.title}.${staart}`;
  }
}

/**
 * Een goedkeuringsvraag zoals de backend hem neerlegt (task_worker.py maakt
 * `kind: 'shell_command'` met `metadata.command` en `metadata.reason`).
 * Structureel getypt, want de rij komt uit de API en niet elke bron vult alles.
 */
export interface AxeGoedkeuring {
  kind?: string | null;
  title?: string | null;
  detail?: string | null;
  metadata?: { command?: string | null; reason?: string | null } | null;
}

/**
 * Redenen die agent_loop.approval_reason teruggeeft als het commando de
 * machine verlaat. "Met je stem" betekent: zonder te kijken, tussendoor, op
 * gehoor — precies de situatie waarin je niet wilt kunnen zeggen dat een mail
 * de deur uit mag. Een order plaatsen stuurt óók iets naar buiten (naar de
 * broker), dus die telt hier mee.
 */
const UITGAANDE_REDENEN = ['sends something out', 'places or changes an order'];

/**
 * Losse patronen voor het geval de reden ontbreekt en alleen de titel of het
 * commando er is. Spiegelt `_OUTBOUND_NEEDS_APPROVAL` in
 * backend/axe_api/agent_loop.py; als die lijst groeit, groeit deze mee.
 */
const VERSTUURT_PATRONEN = [
  'sendmail', 'smtplib', 'resend', 'mail -s', 'mailx', 'send_email',
  'send-email', 'northsea_verstuur', '/send', 'imessage', 'twilio',
];

/**
 * De ingrijpende rung van de echte risicoladder (src/domain/tools/riskTiers.ts),
 * niet een tweede lijstje dat ernaast gaat drijven. Elke tool-id telt in beide
 * schrijfwijzen mee: 'git.push' staat zo in een apparaat-sleutel, 'git push'
 * staat zo in een shell-commando.
 */
const INGRIJPENDE_FRAGMENTEN = Object.entries(TOOL_TIERS)
  .filter(([, tier]) => tier === 'consequential')
  .flatMap(([id]) => [id, id.replace(/[._]/g, ' ')]);

/**
 * `device:<apparaat> <tool>` met daarachter eventueel de JSON-argumenten.
 * device_actions.approval_key bouwt hem zo: schrijf-tier krijgt alleen
 * apparaat + tool, ingrijpend krijgt de exacte argumenten erbij.
 */
const APPARAAT_SLEUTEL = /^device:(\S+)\s+(\S+)\s*(.*)$/s;

/**
 * Mag Luka deze goedkeuring met zijn stem afhandelen?
 *
 * Pure functie, geen I/O. Standaard is nee: alles wat hier niet expliciet
 * langs komt moet je zien voordat je het goedkeurt. "Ja" is alleen voor het
 * saaie midden — een commando dat op deze machine blijft en niets onomkeerbaars
 * doet.
 */
export function magMetStemGoedkeuren(approval?: AxeGoedkeuring | null): boolean {
  if (!approval) return false;
  // Alleen shell-vragen kennen we goed genoeg om op gehoor te beoordelen.
  if (approval.kind !== 'shell_command') return false;

  const meta = approval.metadata ?? {};
  const commando = String(meta.command ?? '').trim();
  const reden = String(meta.reason ?? '').toLowerCase();
  const hooiberg = [commando, reden, approval.title ?? '', approval.detail ?? '']
    .join(' ')
    .toLowerCase();

  // Uitgaand: mail, berichten, orders. Nooit op gehoor.
  if (UITGAANDE_REDENEN.some((r) => reden.includes(r))) return false;
  if (VERSTUURT_PATRONEN.some((p) => hooiberg.includes(p))) return false;

  // NorthSea raakt echte mensen in een echte mailbox: altijd een klik.
  if (/north\s?sea/.test(hooiberg)) return false;

  // Ingrijpend (git push/merge, db.migrate, files.delete, terminal.free, ...).
  if (INGRIJPENDE_FRAGMENTEN.some((f) => hooiberg.includes(f))) return false;

  // Apparaat-actie: een sleutel zonder JSON-argumenten is schrijf-tier en mag;
  // mét argumenten is hij ingrijpend en wil je zien wát er precies gebeurt.
  const sleutel = APPARAAT_SLEUTEL.exec(commando);
  if (sleutel) {
    if (sleutel[3].trim()) return false;
    if (TOOL_TIERS[sleutel[2]] === 'consequential') return false;
  }

  return true;
}

/** De taak staat stil op een commando dat Luka moet goedkeuren. */
export function jobWachtTekst(job: AxeJob, vraag?: string | AxeGoedkeuring | null): string {
  const naam = agentById(job.agent).name;
  const approval = typeof vraag === 'string' || !vraag ? null : vraag;
  const titel = typeof vraag === 'string' ? vraag : (approval?.title ?? '');
  const wat = (titel || '').replace(/^AXE wants to run:\s*/i, '').trim();
  // Alleen de vraag zelf, als geheel, bepaalt of je stem genoeg is. Een losse
  // titel zonder de rest van de rij is niet genoeg om dat te beoordelen, dus
  // die valt vanzelf terug op de klik.
  const slot = magMetStemGoedkeuren(approval)
    ? "Say 'yes, go ahead' or 'no' — or open Approvals."
    : 'This one needs a click in Approvals.';
  const kop = wat
    ? `${naam} needs your OK before it runs ${wat}.`
    : `${naam} needs your OK to continue.`;
  return `${kop} ${slot}`;
}

export function balkLabel(lopend: number): string {
  if (lopend <= 0) return 'No agents running';
  if (lopend === 1) return '1 agent running';
  return `${lopend} agents running`;
}

export function northseaJobModus(agent: AxeAgentId): 'read' | 'execute' {
  return agent === 'northsea' ? 'read' : 'execute';
}
