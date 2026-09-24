/**
 * Regels voor achtergrondjobs en de stemlus. Geen I/O.
 * De roster-agent is wie het werk doet; de job-state is wat de balk toont.
 */
import type { AxeAgentId } from '@/domain/agents/roster';
import { agentById } from '@/domain/agents/roster';
import type { AxeRoute } from '@/domain/tierRouter/axeRoute';

export type AxeJobState = 'queued' | 'running' | 'done' | 'failed';

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

export function sessieSamenvatting(jobs: AxeJob[]): string {
  if (jobs.length === 0) return 'Nothing running this session. No finished jobs yet.';
  const lopend = jobs.filter((j) => j.state === 'queued' || j.state === 'running');
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

export function balkLabel(lopend: number): string {
  if (lopend <= 0) return 'No agents running';
  if (lopend === 1) return '1 agent running';
  return `${lopend} agents running`;
}

export function northseaJobModus(agent: AxeAgentId): 'read' | 'execute' {
  return agent === 'northsea' ? 'read' : 'execute';
}
