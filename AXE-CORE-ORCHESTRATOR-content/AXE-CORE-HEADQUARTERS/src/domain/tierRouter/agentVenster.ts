/**
 * Zwevende agent-vensters rond de core (Luka, 24 sep): "dan zie ik precies
 * wat die agents doen in één view". Alleen de hoofdagents die AXE aan het werk
 * zet; hun crew zie je in hun eigen venster terug. Geen I/O hier.
 */
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';
import type { AxeAgent, AxeAgentId } from '@/domain/agents/roster';
import { agentById, agentsByTier } from '@/domain/agents/roster';

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
  /**
   * De job die onder hem hangt: zijn eigen werk, of het werk van een agent
   * die hij bezit (zie MANAGER_VAN). Null als er niets loopt.
   */
  job: AxeJob | null;
  /** Wat er nu gebeurt, in gewone taal. Leeg als hij stilstaat. */
  regel: string;
}

/**
 * Onder welke manager hangt het werk van deze agent?
 *
 * Tot nu toe kreeg alleen een tier-1-job een rij, en verdween alles van een
 * tier-2/tier-3-werker (of van AXE zelf) uit beeld — terwijl het wél draaide.
 * Elke agent hangt daarom nu onder één manager. De keuze komt uit wat
 * roster.ts over die agenten zegt:
 *
 * - **developer** — "Reads, writes, builds, ships and deploys the codebase."
 *   Hij krijgt de werkers die aan de machinerie van de app zelf zitten:
 *   `task` (de Tasks-tab), `cron` ("self-hosted scheduler"), `memory`
 *   ("builds and maintains the durable memory itself"), `apps`
 *   ("health-checks and can restart the VPS services") en `finance`
 *   ("routes to the cheapest capable engine" — motorkeuze is stack-werk).
 * - **wingman** — "AXE's right hand ... and helps anywhere." Hij krijgt wat
 *   geen eigen desk heeft: `browser` (web-werk zonder domein), de twee
 *   cross-app assistenten `intel` en `companion` (roster: "driven through
 *   AXE CORE" — dus vlak naast AXE's rechterhand), en `axe` zelf, voor het
 *   werk dat AXE niet uitbesteedt.
 *
 * northsea, trading en thinktank hebben hun eigen desk en houden hun eigen
 * werk; ze krijgen niets doorgeschoven. Het type is bewust een volledige
 * Record: komt er een agent bij in de roster, dan dwingt de compiler hier
 * een keuze af in plaats van hem stilletjes te laten verdwijnen.
 */
const MANAGER_VAN: Record<AxeAgentId, AxeAgentId> = {
  axe: 'wingman',
  // tier 1 — een manager houdt zijn eigen werk
  wingman: 'wingman',
  northsea: 'northsea',
  trading: 'trading',
  developer: 'developer',
  thinktank: 'thinktank',
  // tier 2
  browser: 'wingman',
  memory: 'developer',
  task: 'developer',
  cron: 'developer',
  finance: 'developer',
  apps: 'developer',
  // tier 3
  intel: 'wingman',
  companion: 'wingman',
};

/** Welke manager deze agent bezit. Onbekende id (oude job uit de store) → wingman. */
export function managerVan(agent: AxeAgentId): AxeAgentId {
  return MANAGER_VAN[agent] ?? 'wingman';
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
  const zichtbaar = jobs.filter((j) => levendeJob(j, nu));

  const perManager = new Map<AxeAgentId, AxeJob>();
  for (const job of zichtbaar) {
    const eigenaar = managerVan(job.agent);
    const staand = perManager.get(eigenaar);
    if (!staand || job.startedAt >= staand.startedAt) perManager.set(eigenaar, job);
  }

  return managers.map((agent) => {
    const job = perManager.get(agent.id) ?? null;
    return { agent, job, regel: job ? rijRegel(job, agent) : '' };
  });
}

/**
 * Wat er in de rij staat. Doet de manager het zelf, dan alleen zijn zin; doet
 * een van zijn agenten het, dan eerst wie — anders lijkt het alsof de manager
 * zelf in een browser zit te klikken.
 */
function rijRegel(job: AxeJob, manager: AxeAgent): string {
  const regel = regelVan(job);
  if (job.agent === manager.id) return regel;
  const werker = agentById(job.agent);
  return `${werker.kort ?? werker.name} · ${regel}`;
}

/** Wat er achter de naam komt te staan: zijn slotzin, anders zijn laatste stap. */
export function regelVan(job: AxeJob): string {
  if (job.summary) return job.summary;
  const stappen = stappenUit(job.stappen ?? [], 1);
  return stappen[stappen.length - 1] ?? job.title;
}
