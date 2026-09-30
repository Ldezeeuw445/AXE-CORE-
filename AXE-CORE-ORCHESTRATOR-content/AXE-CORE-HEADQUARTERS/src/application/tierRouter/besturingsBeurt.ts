/**
 * besturingsBeurt.ts — praten tegen werk dat al loopt.
 *
 * Werk STARTEN door te praten werkte al. Werk BESTUREN niet, en dat lag niet
 * aan een ontbrekende functie maar aan twee complete paden die allebei nergens
 * op aangesloten waren:
 *
 * 1. `domain/tierRouter/jobBesturing.ts` — `herkenBesturing`, 375 regels met
 *    vijftien groene tests, en precies nul aanroepers buiten zijn eigen test.
 * 2. `plan.controls` — het model mocht besturen, maar de keten brak op vier
 *    naden: kale titels in plaats van `[jN]`, een prompt die wél `[j1]`
 *    beloofde, een `parseBeurtPlan(raw)` zonder lopende lijst, en een
 *    `voerPlanUit` die `controls` nooit las.
 *
 * Dit bestand is de uitvoerder waar ze allebei in uitkomen. Eén plek die weet
 * wat 'cancel' betekent, zodat de regels en het model niet over een maand twee
 * verschillende dingen doen met hetzelfde woord.
 *
 * Geen store, geen netwerk, geen React: de I/O komt als `deps` binnen, net als
 * `stuurAxeJobs.ts` dat met `create` doet. Daardoor is de hele keten
 * herkennen → uitvoeren → tekst te testen zonder een draaiende app.
 */
import {
  herkenBesturing,
  type Besturing,
  type BesturingActie,
} from '@/domain/tierRouter/jobBesturing';
import {
  jobLoopt,
  jobStatusTekst,
  magMetStemGoedkeuren,
  sessieSamenvatting,
  type AxeJob,
} from '@/domain/tierRouter/axeJobRegels';
import { jobVanControl, type PlanControl } from '@/domain/tierRouter/beurtPlan';
import { agentById } from '@/domain/agents/roster';
import type { AxeBeurtStuk } from '@/domain/tierRouter/splitsAxeBeurten';

/** Eén goedkeuringsvraag zoals de kernel hem teruggeeft. Structureel getypt. */
interface OpenGoedkeuring {
  id: string;
  task_id: string;
  status: string;
  kind?: string | null;
  title?: string | null;
  detail?: string | null;
  metadata?: { command?: string | null; reason?: string | null } | null;
}

/**
 * De I/O die besturen nodig heeft. De presentatielaag vult hier de echte
 * gateways in (`cancelDurableTask`, `getDurableTask`,
 * `decideDurableTaskApproval`); de test vult spionnen in.
 */
export interface BesturingDeps {
  cancel: (taskId: string, reason?: string) => Promise<unknown>;
  snapshot: (taskId: string) => Promise<{ approvals: OpenGoedkeuring[] }>;
  beslis: (taskId: string, approvalId: string, akkoord: boolean, reden?: string) => Promise<unknown>;
  nu?: () => number;
}

/** Wat er in de store moet veranderen. De uitvoerder raakt de store niet zelf aan. */
export interface JobPatch {
  id: string;
  over: Partial<AxeJob>;
}

export interface BesturingsUitvoer {
  actie: BesturingActie;
  /** Wat AXE terugzegt. Altijd gevuld: stilte is nooit een antwoord. */
  tekst: string;
  patches: JobPatch[];
  /** Alleen bij redirect: wat er opnieuw gestart moet worden. */
  starts: AxeBeurtStuk[];
}

const leeg = (actie: BesturingActie, tekst: string): BesturingsUitvoer =>
  ({ actie, tekst, patches: [], starts: [] });

function zoek(alle: readonly AxeJob[], ids: readonly string[]): AxeJob[] {
  const uit: AxeJob[] = [];
  for (const id of ids) {
    const job = alle.find((j) => j.id === id);
    if (job) uit.push(job);
  }
  return uit;
}

/**
 * De wachtende goedkeuring van deze taak, of null. Gaat er één keer op uit;
 * een taak die intussen doorliep heeft er geen meer, en dan is er niets te
 * beslissen.
 */
async function openGoedkeuring(job: AxeJob, deps: BesturingDeps): Promise<OpenGoedkeuring | null> {
  if (!job.taskId) return null;
  try {
    const snap = await deps.snapshot(job.taskId);
    return (snap?.approvals ?? []).find((a) => a.status === 'pending') ?? null;
  } catch {
    return null;
  }
}

async function stopEen(
  job: AxeJob,
  deps: BesturingDeps,
  reden: string,
): Promise<{ tekst: string; patch: JobPatch | null }> {
  const naam = agentById(job.agent).name;

  // Nog geen taskId: het aanmaken is onderweg. Cancellen kan dan niet, en doen
  // alsof het gelukt is laat een taak draaien die Luka net heeft afgezegd.
  if (!job.taskId) {
    return { tekst: `${naam} is still starting — try again in a moment.`, patch: null };
  }

  try {
    await deps.cancel(job.taskId, reden);
  } catch (e) {
    return {
      tekst: `I couldn't stop ${naam}: ${e instanceof Error ? e.message : String(e)}`,
      patch: null,
    };
  }

  const nu = (deps.nu ?? Date.now)();
  return {
    tekst: `Stopping ${naam} — ${job.title}.`,
    // 'failed' en niet een nieuwe state 'cancelled': vijf weergaven kennen
    // vijf states, en een zesde toevoegen voor dit ene geval levert overal een
    // half gevulde tabel op. De samenvatting maakt het verschil duidelijk.
    patch: { id: job.id, over: { state: 'failed', summary: 'Stopped by you.', finishedAt: nu } },
  };
}

/**
 * Eén herkende besturing uitvoeren. Niet geëxporteerd: de twee ingangen zijn
 * `besturingsBeurt` (regels) en `controlBeurt` (plan), en die komen hier
 * allebei uit. Eén deur per pad, één uitvoerder erachter.
 */
async function voerBesturingUit(
  b: Besturing,
  alle: readonly AxeJob[],
  deps: BesturingDeps,
): Promise<BesturingsUitvoer> {
  const nu = (deps.nu ?? Date.now)();

  // Twijfel gaat voor alles: dan is er één vraag terug en gebeurt er niets.
  if (b.twijfel) return leeg(b.actie, b.twijfel);

  if (b.actie === 'overview') {
    return leeg('overview', sessieSamenvatting([...alle]));
  }

  const doelen = zoek(alle, b.jobIds);
  if (!doelen.length) return leeg(b.actie, 'I have nothing running to do that with.');

  if (b.actie === 'status') {
    return leeg('status', doelen.map((j) => jobStatusTekst(j, nu)).join('\n'));
  }

  if (b.actie === 'cancel') {
    const teksten: string[] = [];
    const patches: JobPatch[] = [];
    for (const job of doelen) {
      const r = await stopEen(job, deps, 'Stopped by Luka.');
      teksten.push(r.tekst);
      if (r.patch) patches.push(r.patch);
    }
    return { actie: 'cancel', tekst: teksten.join('\n'), patches, starts: [] };
  }

  if (b.actie === 'redirect') {
    const instructie = (b.instructie || '').trim();
    if (!instructie) {
      return leeg('redirect', 'What should it do instead?');
    }
    // Stoppen en opnieuw starten, niet ernaast zetten. "doe het toch op de
    // iMac" betekent niet dat het twee keer moet gebeuren. De taak-endpoint
    // kan alleen titel/prioriteit wijzigen, niet het doel, dus bijsturen
    // zonder herstarten zou de agent onveranderd door laten werken.
    const job = doelen[0];
    const r = await stopEen(job, deps, `Redirected: ${instructie}`);
    if (!r.patch) return leeg('redirect', r.tekst);
    const naam = agentById(job.agent).name;
    return {
      actie: 'redirect',
      tekst: `Stopped ${naam} and restarted it: "${instructie}".`,
      patches: [r.patch],
      starts: [{
        text: instructie,
        titel: instructie.slice(0, 60),
        route: {
          tier: 3 as const,
          kind: 'agent' as const,
          via: 'rules' as const,
          reason: 'besturing:redirect',
          agent: job.agent,
          skill: null,
          confident: true,
        },
      }],
    };
  }

  // approve / reject
  const job = doelen[0];
  const naam = agentById(job.agent).name;
  const approval = await openGoedkeuring(job, deps);
  if (!approval) {
    return leeg(b.actie, `${naam} isn't waiting on anything right now.`);
  }

  // Luka's regel: typen krijgt dezelfde grens als stem. Mail, orders,
  // NorthSea en git push vragen een echte klik, hoe je het ook zegt — één
  // regel, zodat je nooit hoeft te onthouden welke van de twee je gebruikte.
  if (b.actie === 'approve' && !magMetStemGoedkeuren(approval)) {
    return leeg('approve', 'That approval is too consequential to accept this way. Use the Approvals control.');
  }

  try {
    await deps.beslis(
      approval.task_id,
      approval.id,
      b.actie === 'approve',
      b.actie === 'approve' ? 'Approved by Luka in chat.' : 'Rejected by Luka in chat.',
    );
  } catch (e) {
    return leeg(b.actie, `I couldn't apply that approval: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (b.actie === 'approve') {
    return {
      actie: 'approve',
      tekst: `Okay. ${naam} is continuing.`,
      patches: [{ id: job.id, over: { state: 'running' } }],
      starts: [],
    };
  }
  return {
    actie: 'reject',
    tekst: 'Okay. I rejected that action.',
    patches: [{ id: job.id, over: { state: 'failed', summary: 'Rejected by you.', finishedAt: nu } }],
    starts: [],
  };
}

/**
 * Het regelpad: zit er in deze zin een besturing van lopend werk?
 *
 * `null` betekent uitdrukkelijk "dit ging hier niet over" — dan moet de
 * aanroeper de gewone route gewoon zijn gang laten gaan. Dat is waarom dit
 * vóór het plan hoort te staan: "hoe staat het met de trading agent?" is
 * anders een zin van twee stukken, die het plan in gaat, dat tot zes seconden
 * kost én zelf een nieuwe trading-taak mag starten.
 */
export async function besturingsBeurt(
  tekst: string,
  alle: readonly AxeJob[],
  deps: BesturingDeps,
): Promise<BesturingsUitvoer | null> {
  const lopend = alle.filter((j) => jobLoopt(j.state));
  const b = herkenBesturing(tekst, lopend);
  if (!b) return null;
  return voerBesturingUit(b, alle, deps);
}

/**
 * Het modelpad: `plan.controls` door dezelfde uitvoerder.
 *
 * `lopend` moet exact de lijst zijn die `lopendeRegels` kreeg toen de prompt
 * werd gebouwd — "j2" is de tweede daarin. Opnieuw uit de store halen op het
 * moment van uitvoeren betekent dat een job die intussen klaar is de
 * nummering verschuift, en dan stopt AXE iets anders dan er gevraagd werd.
 */
export async function controlBeurt(
  controls: readonly PlanControl[],
  lopend: readonly AxeJob[],
  alle: readonly AxeJob[],
  deps: BesturingDeps,
): Promise<BesturingsUitvoer[]> {
  const uit: BesturingsUitvoer[] = [];
  for (const c of controls) {
    if (c.action === 'overview') {
      uit.push(leeg('overview', sessieSamenvatting([...alle])));
      continue;
    }
    const job = jobVanControl(c, lopend);
    if (!job) continue;
    const b: Besturing = {
      actie: c.action,
      jobIds: [job.id],
      ...(c.instruction ? { instructie: c.instruction } : {}),
    };
    uit.push(await voerBesturingUit(b, alle, deps));
  }
  return uit;
}
