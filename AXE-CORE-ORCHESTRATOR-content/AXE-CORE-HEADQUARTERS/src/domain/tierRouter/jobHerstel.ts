/**
 * jobHerstel.ts — wat er van lopend werk overblijft als je de app sluit, en
 * wanneer een monitor het opgeeft.
 *
 * Gemeten probleem: `axeJobStore` had geen persist en `taskMonitors` staat
 * module-lokaal in `installTierRouter`. Herlaadde je tijdens een lopende job,
 * dan was de store leeg, startte er geen monitor, en draaide de taak op de VPS
 * gewoon door — met geen enkele weg terug naar de chat. Je kon de app een uur
 * later openen en hij wist van niets.
 *
 * En `monitorTier3` was `while (true)` met een vaste poll van 4 s: geen
 * tijdslimiet, geen backoff. Eén netwerkfout verliet de lus en liet de job
 * eeuwig op `running` staan, zonder één bericht — het slechtste van de twee
 * werelden, want de balk bleef zeggen dat er gewerkt werd.
 *
 * Puur: geen store, geen netwerk, geen klok uit zichzelf. `nu` komt binnen.
 */
import { agentById } from '@/domain/agents/roster';
import { jobLoopt, type AxeJob } from '@/domain/tierRouter/axeJobRegels';

/** Hoe lang een afgeronde job bewaard blijft. Langer is geschiedenis, geen stand. */
export const JOB_BEWAAR_MS = 6 * 60 * 60_000;

/** Hoe lang een monitor een taak blijft volgen voor hij zichzelf afsluit. */
export const JOB_MAX_LOOPTIJD_MS = 2 * 60 * 60_000;

/** Zoveel keer achter elkaar niet kunnen ophalen = de server is weg. */
export const MONITOR_MAX_FOUTEN = 5;

/** Hoogstens zoveel jobs bewaren; de balk toont er toch acht. */
export const JOB_BEWAAR_MAX = 20;

/**
 * Wat er de opslag in gaat.
 *
 * `stappen` blijft eruit: dat is een log dat per poll aangroeit, en het is na
 * een herstart niets waard — de monitor haalt de verse stappen meteen weer op.
 * Het scheelt localStorage-ruimte die het gesprek harder nodig heeft.
 */
export function bewaarbareJobs(
  jobs: readonly AxeJob[],
  nu: number,
  max: number = JOB_BEWAAR_MAX,
): AxeJob[] {
  const houden = jobs.filter((j) => {
    if (jobLoopt(j.state)) return true;
    return nu - (j.finishedAt ?? j.startedAt) < JOB_BEWAAR_MS;
  });
  return houden.slice(-max).map((j) => {
    const kaal: AxeJob = { ...j };
    delete kaal.stappen;
    return kaal;
  });
}

/**
 * Jobs waarvoor bij het opstarten weer een monitor moet lopen: ze liepen nog
 * én de backend kent ze (er is een taskId). Die kunnen ondertussen klaar zijn,
 * en dan komt het resultaat alsnog binnen bij de eerste poll.
 */
export function hervatbareJobs(jobs: readonly AxeJob[]): AxeJob[] {
  return jobs.filter((j) => jobLoopt(j.state) && !!j.taskId);
}

/**
 * Jobs die lopend heten maar nooit een taskId kregen: het aanmaken kwam nooit
 * terug voor de app dichtging. Die gaan nergens meer heen, dus ze horen niet
 * eeuwig in de balk te blijven staan alsof er iemand aan werkt.
 */
export function verweesdeJobs(jobs: readonly AxeJob[]): AxeJob[] {
  return jobs.filter((j) => jobLoopt(j.state) && !j.taskId);
}

/**
 * Hoe lang tot de volgende poll. 4 s zolang het goed gaat, daarna verdubbelen
 * tot 30 s — een backend die eruit ligt hoeft niet elke vier seconden opnieuw
 * geprobeerd te worden, en een taak die net klaar is merk je nog steeds snel.
 */
export function volgendePollMs(fouten: number): number {
  const n = Math.max(0, Math.min(fouten, 8));
  return Math.min(30_000, 4_000 * 2 ** n);
}

/** Moet deze monitor ermee ophouden? Nu alleen: hij kijkt al twee uur. */
export function monitorMoetStoppen(job: AxeJob, nu: number): 'timeout' | null {
  return nu - job.startedAt >= JOB_MAX_LOOPTIJD_MS ? 'timeout' : null;
}

/** De server kent deze taak niet meer (404). Zeg dat, en raad niet. */
export function verlorenTaakTekst(job: AxeJob): string {
  return `I lost track of ${agentById(job.agent).name}'s ${job.title} — the server no longer has it.`;
}

/** De server is niet te bereiken. Niet hetzelfde als een taak die faalde. */
export function onbereikbaarTekst(job: AxeJob): string {
  return `I can't reach the task server, so I stopped watching ${job.title}.`;
}

/** Het aanmaken is nooit afgerond; er draait niets. */
export function nooitGestartTekst(job: AxeJob): string {
  return `${agentById(job.agent).name} never got started on ${job.title} — ask me again if you still want it.`;
}

/** De monitor kijkt al twee uur. Dat zegt niets over de taak zelf. */
export function tijdslimietTekst(job: AxeJob): string {
  return `I stopped watching ${job.title} after two hours. It may still be running on the server.`;
}
