/**
 * Zwevende agent-vensters rond de core (Luka, 24 sep): "dan zie ik precies
 * wat die agents doen in één view". Alleen de hoofdagents die AXE aan het werk
 * zet; hun crew zie je in hun eigen venster terug. Geen I/O hier.
 */
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';

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

/** Welke jobs een venster krijgen: wat loopt, en wat net klaar is. */
export function zichtbareVensters(jobs: AxeJob[], nu: number): AxeJob[] {
  const actief = jobs.filter((j) => {
    if (j.state === 'queued' || j.state === 'running' || j.state === 'waiting') return true;
    return j.finishedAt != null && nu - j.finishedAt < VENSTER_NAGLOEI_MS;
  });
  return actief.slice(-MAX_VENSTERS);
}
