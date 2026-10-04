/**
 * Wat een agent nu doet of zegt, en of hij écht op Luka wacht.
 *
 * Zelfde regel op Tauri-Home, de telefoon-tegel en Awareness: binnen het
 * staande plan geen goedkeuring, wel bij versturen, geld of een deal.
 */
import type { AxeAgentId } from '@/domain/agents/roster';
import {
  goedkeuringVoorActie,
  type ActieVoorGoedkeuring,
  type GoedkeuringsVraag,
} from '@/domain/taakGoedkeuring';
import { managerRijen, regelVan, werkerRijen } from '@/domain/tierRouter/agentVenster';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';

export interface AgentBewustzijn {
  agentId: AxeAgentId;
  naam: string;
  regel: string;
  goedkeuring: GoedkeuringsVraag | null;
  job: AxeJob | null;
}

export function goedkeuringVanActie(in_: ActieVoorGoedkeuring): GoedkeuringsVraag | null {
  return goedkeuringVoorActie(in_);
}

export function goedkeuringVanJob(job: Pick<AxeJob, 'title' | 'sourceText' | 'approvalVraag'>): GoedkeuringsVraag | null {
  return goedkeuringVoorActie({
    title: job.title,
    detail: job.approvalVraag || job.sourceText,
  });
}

/** De regel naast de agent: wat hij doet, of de vraag als het plan verlaat. */
export function agentRegel(job: AxeJob): string {
  const vraag = goedkeuringVanJob(job);
  if (job.state === 'waiting' && vraag) return vraag.wat;
  return regelVan(job);
}

export function bewustzijnVanJobs(jobs: readonly AxeJob[], nu = Date.now()): AgentBewustzijn[] {
  const rijen = [
    ...managerRijen([...jobs], nu),
    ...werkerRijen([...jobs], nu),
  ];
  const gezien = new Set<AxeAgentId>();
  const uit: AgentBewustzijn[] = [];
  for (const rij of rijen) {
    if (gezien.has(rij.agent.id)) continue;
    gezien.add(rij.agent.id);
    const job = rij.job;
    uit.push({
      agentId: rij.agent.id,
      naam: rij.agent.kort ?? rij.agent.name,
      regel: job ? agentRegel(job) : '',
      goedkeuring: job && job.state === 'waiting' ? goedkeuringVanJob(job) : null,
      job,
    });
  }
  return uit;
}

export function openGoedkeuringen(jobs: readonly AxeJob[]): Array<AgentBewustzijn & { goedkeuring: GoedkeuringsVraag }> {
  return bewustzijnVanJobs(jobs).filter((r): r is AgentBewustzijn & { goedkeuring: GoedkeuringsVraag } => r.goedkeuring !== null);
}

