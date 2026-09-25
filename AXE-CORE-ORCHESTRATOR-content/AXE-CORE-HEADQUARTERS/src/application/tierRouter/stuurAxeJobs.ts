/**
 * Zet geknipte beurten uit als parallelle durable tasks.
 * NorthSea blijft lezen; auto-send vlaggen komen hier niet in.
 */
import { capabilityVoorAgent, type AxeRoute } from '@/domain/tierRouter/axeRoute';
import {
  jobAgentVan,
  jobTitelVan,
  northseaJobModus,
  type AxeJob,
  type AxeJobState,
} from '@/domain/tierRouter/axeJobRegels';
import type { AxeBeurtStuk } from '@/domain/tierRouter/splitsAxeBeurten';

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
    };
  });
}

function payloadVoor(job: AxeJob, route: AxeRoute): JobStartInput {
  return {
    title: job.title,
    goal: job.sourceText,
    requested_by: 'luka',
    capability: capabilityVoorAgent(job.agent),
    assignee: job.agent === 'axe' ? undefined : job.agent,
    execution_mode: northseaJobModus(job.agent),
    idempotency_key: `tier3-${job.id}`,
    payload: {
      request: job.sourceText,
      route_tier: 3,
      agent: job.agent,
      skill: route.skill,
    },
    metadata: {
      conversation_source: 'axe_tier_router',
      route_tier: 3,
      agent: job.agent,
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
      return { job: { ...job, state: 'running' as const, taskId: task.id }, ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { job: { ...job, state: 'failed' as const, summary: msg, finishedAt: nu() }, ok: false, error: msg };
    }
  }));
}

