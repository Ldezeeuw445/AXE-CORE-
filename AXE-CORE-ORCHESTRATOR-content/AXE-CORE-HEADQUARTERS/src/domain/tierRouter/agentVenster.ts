/**
 * Zwevende agent-vensters rond de core (Luka, 24 sep): "dan zie ik precies
 * wat die agents doen in één view". Alleen de hoofdagents die AXE aan het werk
 * zet; hun crew zie je in hun eigen venster terug. Geen I/O hier.
 */
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';
import type { AxeAgent, AxeAgentId } from '@/domain/agents/roster';
import { agentsByTier } from '@/domain/agents/roster';

/** Hoe lang een klaar venster blijft staan voor het wegschuift. */
export const VENSTER_NAGLOEI_MS = 25_000;

export const MAX_VENSTERS = 4;

/**
 * Eén regel uit core_task_events in gewone taal, of null als het ruis is.
 * De agent-lus schrijft "Step 3: $ df -h /"; Luka wil lezen wat er gebeurt,
 * niet het stapnummer.
 */
export function gewoneTaal(bericht: string | null | undefined): string | null {
  const t = (bericht || '').trim();
  if (!t) return null;
  if (/no action taken, prompting to continue/i.test(t)) return null;
  if (/^proof command ran/i.test(t)) return null;
  if (/verified the persisted/i.test(t)) return null;
  if (/^AXE started working directly/i.test(t)) return 'On it.';
  if (/agent claims completion/i.test(t)) return 'Checking my work.';
  if (/^Completion claim rejected/i.test(t)) return "That didn't hold up — trying again.";
  if (/^AXE finished in/i.test(t)) return 'Done, and checked.';
  const zonderStap = t.replace(/^Step \d+:\s*/i, '');
  const shell = /^\$\s*(.+)$/.exec(zonderStap);
  if (shell) return `Running ${kort(shell[1], 70)}`;
  const leest = /^reading\s+(.+)$/i.exec(zonderStap);
  if (leest) return `Reading ${kort(leest[1], 70)}`;
  const schrijft = /^writing\s+(.+)$/i.exec(zonderStap);
  if (schrijft) return `Writing ${kort(schrijft[1], 70)}`;
  const goedgekeurd = /^running approved command\s*[—-]\s*(.+)$/i.exec(zonderStap);
  if (goedgekeurd) return `You approved it — running ${kort(goedgekeurd[1], 60)}`;
  return kort(zonderStap, 120);
}

function kort(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** De laatste paar regels, zonder herhaling van dezelfde zin achter elkaar. */
export function stappenUit(berichten: Array<string | null | undefined>, max = 4): string[] {
  const uit: string[] = [];
  for (const b of berichten) {
    const regel = gewoneTaal(b);
    if (!regel || uit[uit.length - 1] === regel) continue;
    uit.push(regel);
  }
  return uit.slice(-max);
}

/** Loopt hij nog, of is hij net klaar en staat hij nog na te gloeien? */
function levendeJob(job: AxeJob, nu: number): boolean {
  if (job.state === 'queued' || job.state === 'running' || job.state === 'waiting') return true;
  return job.finishedAt != null && nu - job.finishedAt < VENSTER_NAGLOEI_MS;
}

/** Welke jobs een venster krijgen: wat loopt, en wat net klaar is. */
export function zichtbareVensters(jobs: AxeJob[], nu: number): AxeJob[] {
  return jobs.filter((j) => levendeJob(j, nu)).slice(-MAX_VENSTERS);
}

/* ── De vijf managers links naast de sphere ──────────────────────────────
 * Luka, 25 sep: "dan allemaal en ook floating zonder achtergrond". Niet
 * alleen wie er loopt dus — alle vijf blijven staan, op een vaste plek, en
 * wie niets doet valt terug tot zijn naam. Anders springt de kolom bij elke
 * job en weet je nooit waar Trading staat.
 */

export interface ManagerRij {
  agent: AxeAgent;
  /** De job die AXE bij hem heeft neergelegd, of null als hij stilstaat. */
  job: AxeJob | null;
  /** Wat hij nu zegt, in gewone taal. Leeg als hij stilstaat. */
  regel: string;
}

/**
 * Van welke manager is deze job? Een job van een tier-2-werker (Browser,
 * Memory, ...) hangt onder de manager die hem heeft uitgezet; die koppeling
 * bestaat nog niet, dus zulke jobs krijgen hier geen rij. Ze zijn niet weg —
 * ze staan in de Agents-tab.
 */
function isManagerJob(job: AxeJob, managers: readonly AxeAgent[]): boolean {
  return managers.some((m) => m.id === job.agent);
}

/**
 * Eén rij per tier-1 manager, altijd in de volgorde van de roster. Per manager
 * de job die het laatst begon — twee tegelijk bij dezelfde manager is zeldzaam,
 * en dan is de nieuwste wat je wil zien.
 */
export function managerRijen(jobs: AxeJob[], nu: number): ManagerRij[] {
  const managers = agentsByTier('tier1');
  // Bewust NIET via zichtbareVensters: die kapt af op MAX_VENSTERS, en dan valt
  // er een manager weg zodra alle vijf tegelijk lopen. Hier krijgt iedereen een rij.
  const zichtbaar = jobs.filter((j) => levendeJob(j, nu) && isManagerJob(j, managers));

  const perManager = new Map<AxeAgentId, AxeJob>();
  for (const job of zichtbaar) {
    const staand = perManager.get(job.agent);
    if (!staand || job.startedAt >= staand.startedAt) perManager.set(job.agent, job);
  }

  return managers.map((agent) => {
    const job = perManager.get(agent.id) ?? null;
    return { agent, job, regel: job ? regelVan(job) : '' };
  });
}

/** Wat er achter de naam komt te staan: zijn slotzin, anders zijn laatste stap. */
export function regelVan(job: AxeJob): string {
  if (job.summary) return job.summary;
  const stappen = stappenUit(job.stappen ?? [], 1);
  return stappen[stappen.length - 1] ?? job.title;
}
