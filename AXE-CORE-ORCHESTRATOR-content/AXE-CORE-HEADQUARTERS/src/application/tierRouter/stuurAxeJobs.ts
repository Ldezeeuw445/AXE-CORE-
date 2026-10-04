/**
 * Zet geknipte beurten uit als parallelle durable tasks.
 * NorthSea blijft lezen; auto-send vlaggen komen hier niet in.
 */
import { capabilityVoorAgent, type AxeRoute } from '@/domain/tierRouter/axeRoute';
import {
  jobAgentVan,
  jobTitelVan,
  jobModus,
  type AxeJob,
  type AxeJobState,
} from '@/domain/tierRouter/axeJobRegels';
import type { AxeBeurtStuk } from '@/domain/tierRouter/splitsAxeBeurten';
import { replyLanguageInstruction } from '@/domain/replyLanguage';
import { workspaceVoor } from '@/domain/agents/workspace';
import { kluisPadVoorTaak } from '@/domain/obsidian/kluisBoom';
import type { PlanDevice } from '@/domain/tierRouter/beurtPlan';
import type { TaakKluisInhoud } from '@/domain/obsidian/kluisBoom';

interface JobStartInput {
  title: string;
  goal: string;
  requested_by?: string;
  capability?: string;
  assignee?: string;
  execution_mode?: 'read' | 'patch' | 'execute';
  idempotency_key?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface JobStartResult {
  task: { id: string };
}

interface StuurAxeJobsDeps {
  create: (input: JobStartInput) => Promise<JobStartResult>;
  nu?: () => number;
  id?: () => string;
  /** Schrijf de taakmap in de kluis. Leeg = niet schrijven (tests). */
  kluis?: (in_: TaakKluisInhoud) => Promise<string | void>;
}

interface GestarteJob {
  job: AxeJob;
  ok: boolean;
  error?: string;
}

export function jobsVanStukken(stukken: AxeBeurtStuk[], nu = Date.now(), id = () => `job-${Math.random().toString(36).slice(2, 8)}`): AxeJob[] {
  return stukken.map((s) => {
    const agent = jobAgentVan(s.route, s.text);
    return {
      id: id(),
      title: jobTitelVan(s.titel ?? s.text),
      agent,
      state: 'queued' as AxeJobState,
      startedAt: nu,
      sourceText: s.text,
      device: s.device ?? null,
      tab: s.tab,
      bron: s.bron,
    };
  });
}

/** Device zoals hij op de durable task moet blijven staan. */
function deviceOpPayload(device: PlanDevice | null | undefined): PlanDevice | null {
  return device === 'vps' || device === 'mac-mini' || device === 'imac' ? device : null;
}

function payloadVoor(job: AxeJob, route: AxeRoute): JobStartInput {
  const device = deviceOpPayload(job.device);
  const ws = workspaceVoor(job.agent);
  const tab = job.tab || 'home';
  return {
    title: job.title,
    goal: job.sourceText,
    requested_by: 'luka',
    capability: capabilityVoorAgent(job.agent),
    assignee: job.agent === 'axe' ? undefined : job.agent,
    execution_mode: jobModus(job.agent, route.skill),
    idempotency_key: `tier3-${job.id}`,
    payload: {
      request: job.sourceText,
      route_tier: 3,
      agent: job.agent,
      skill: route.skill,
      device,
      tab,
      workspace: {
        role: ws.role,
        tools: [...ws.tools],
        preferred_device: ws.preferredDevice,
        memory_scope: ws.memoryScope,
        crew: [...ws.crew],
      },
      vault_folder: kluisPadVoorTaak(job.taskId || job.id),
      // In welke taal het antwoord terug moet. Stond alleen in het tweede
      // register (installStableChat), dus een job via de router kwam altijd
      // in de taal van het model terug. Nu overal, in plaats van nergens.
      reply_language: replyLanguageInstruction(),
    },
    metadata: {
      conversation_source: 'axe_tier_router',
      route_tier: 3,
      agent: job.agent,
      device,
      tab,
      // Geen auto_send_*: NorthSea blijft read-only vanaf deze ingang.
      northsea_read_only: job.agent === 'northsea',
    },
  };
}

/** Start alle creates tegelijk. De belofte resolved als ze ALLEMAAL klaar zijn;
 *  de aanroepen zelf overlappen — dat is de meting in de test. */
export async function startJobsParallel(
  stukken: AxeBeurtStuk[],
  deps: StuurAxeJobsDeps,
): Promise<GestarteJob[]> {
  const nu = deps.nu ?? Date.now;
  const jobs = jobsVanStukken(stukken, nu(), deps.id);
  return Promise.all(jobs.map(async (job, i) => {
    try {
      const { task } = await deps.create(payloadVoor(job, stukken[i].route));
      const gestart = { ...job, state: 'running' as const, taskId: task.id };
      if (deps.kluis) {
        await deps.kluis({
          taskId: task.id,
          title: job.title,
          goal: job.sourceText,
          agent: job.agent,
          device: job.device,
          tab: job.tab,
        }).catch(() => undefined);
      }
      return { job: gestart, ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { job: { ...job, state: 'failed' as const, summary: msg, finishedAt: nu() }, ok: false, error: msg };
    }
  }));
}

