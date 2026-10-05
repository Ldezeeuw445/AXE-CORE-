/**
 * De live draad in een Home-agentvenster: opdracht, goedkeuring, opvolging.
 * Geen I/O. De kolom-chrome blijft ongemoeid; dit is alleen wat er ín het
 * bestaande venster staat.
 */
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';
import type { AxeAgentId } from '@/domain/agents/roster';
import { goedkeuringVanJob } from '@/domain/agentBewustzijn';
import { stappenUit } from '@/domain/tierRouter/agentVenster';

export type DraadRol = 'axe' | 'luka' | 'agent';
export type DraadSoort = 'instruction' | 'step' | 'approval' | 'followup' | 'result';

export interface DraadBericht {
  rol: DraadRol;
  soort: DraadSoort;
  tekst: string;
}

function kort(s: string, max = 400): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Eén job als berichten: wat AXE vroeg, wat de agent deed, waar hij wacht. */
export function draadVanJob(job: AxeJob): DraadBericht[] {
  const uit: DraadBericht[] = [];
  const opdracht = kort(job.sourceText || job.title);
  if (opdracht) {
    uit.push({
      rol: 'axe',
      soort: job.bron === 'followup' ? 'followup' : 'instruction',
      tekst: opdracht,
    });
  }
  for (const stap of stappenUit(job.stappen ?? [], 8)) {
    uit.push({ rol: 'agent', soort: 'step', tekst: stap });
  }
  const vraag = job.state === 'waiting' ? goedkeuringVanJob(job) : null;
  if (vraag) {
    uit.push({ rol: 'agent', soort: 'approval', tekst: kort(vraag.tekst, 600) });
  }
  if (job.summary) {
    uit.push({ rol: 'agent', soort: 'result', tekst: kort(job.summary) });
  }
  return uit;
}

/**
 * Alle jobs van één manager, oudste eerst: één doorlopende draad in plaats
 * van alleen de laatste statusregel.
 */
export function draadVoorAgent(jobs: readonly AxeJob[], agent: AxeAgentId): DraadBericht[] {
  return jobs
    .filter((j) => j.agent === agent)
    .slice()
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap(draadVanJob);
}
