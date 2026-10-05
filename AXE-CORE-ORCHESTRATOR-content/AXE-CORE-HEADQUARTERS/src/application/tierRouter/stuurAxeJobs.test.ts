import { beforeEach, describe, it, expect } from 'vitest';
import { splitsAxeBeurten, jobStukkenVan } from '@/domain/tierRouter/splitsAxeBeurten';
import { jobsVanStukken, startJobsParallel } from './stuurAxeJobs';
import { classifyAxeTier } from '@/domain/tierRouter/axeRoute';
import { skillDef } from '@/domain/tierRouter/axeSkills';

describe('jobsVanStukken houdt device vast', () => {
  it('zet device=mac-mini op de job, niet weg', () => {
    const jobs = jobsVanStukken([{
      text: 'check northsea deals on the Mac mini',
      device: 'mac-mini',
      tab: 'home',
      route: classifyAxeTier('check northsea deals on the Mac mini'),
    }]);
    expect(jobs[0].device).toBe('mac-mini');
    expect(jobs[0].tab).toBe('home');
  });
});

describe('startJobsParallel', () => {
  it('zet drie jobs tegelijk uit, niet achter elkaar', async () => {
    const stukken = jobStukkenVan(splitsAxeBeurten(
      'check NorthSea deals, zet een taak voor morgen, en vat het AI-nieuws samen',
    ));
    expect(stukken).toHaveLength(3);

    let inFlight = 0;
    let maxInFlight = 0;
    const create = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return { task: { id: `t-${maxInFlight}-${inFlight}` } };
    };

    const started = await startJobsParallel(stukken, { create, id: () => `id-${Math.random()}` });
    expect(started).toHaveLength(3);
    expect(started.every((s) => s.ok)).toBe(true);
    expect(maxInFlight).toBe(3);
    expect(started[0].job.agent).toBe('northsea');
    expect(started[0].job.state).toBe('running');
  });

  it('de aanroeper hoeft niet te wachten om verder te praten', async () => {
    let klaar = false;
    const create = async () => {
      await new Promise((r) => setTimeout(r, 40));
      klaar = true;
      return { task: { id: 't' } };
    };
    const p = startJobsParallel(
      jobStukkenVan(splitsAxeBeurten('check NorthSea deals and add a task for tomorrow')),
      { create },
    );
    expect(klaar).toBe(false);
    await p;
    expect(klaar).toBe(true);
  });

  it('NorthSea-job is read-only en noemt geen auto-send', async () => {
    const stukken = jobStukkenVan(splitsAxeBeurten('check the northsea deals and add a task for tomorrow'));
    const payloads: Array<Record<string, unknown>> = [];
    await startJobsParallel(stukken, {
      create: async (input) => {
        payloads.push(input as unknown as Record<string, unknown>);
        return { task: { id: 'x' } };
      },
    });
    const ns = payloads.find((p) => p.assignee === 'northsea');
    expect(ns?.execution_mode).toBe('read');
    expect(JSON.stringify(ns)).not.toMatch(/auto_send_qualification|auto_reply_nonbinding|auto_send_followups/);
  });
});

/* ── De vijf skills komen aan bij de agent (1 okt 2026) ──────────────────────
   Gemeten vóór deze ronde: `skill` stond wél in de payload, maar de backend kent
   het woord niet en het planpad zette hem hard op null. De agent kreeg dus de
   zin zelf ("inbox brief", twee woorden) in plaats van de instructie uit
   axeSkills.ts. Deze tests leggen vast dat het nu écht doorkomt, inclusief het
   hek: alle vijf lezen alleen. */
describe('een benoemde skill', () => {
  const gestuurd: Array<Record<string, unknown>> = [];
  const create = async (input: Record<string, unknown>) => {
    gestuurd.push(input);
    return { task: { id: `t-${gestuurd.length}` } };
  };

  beforeEach(() => { gestuurd.length = 0; });

  it('draagt zijn naam, zijn agent en de leesstand mee naar de durable task', async () => {
    const def = skillDef('deep-research')!;
    await startJobsParallel(
      [{ text: `${def.request}\n\nLuka said: deep research naar lithium`, titel: def.label, route: classifyAxeTier('deep research naar lithium') }],
      { create, id: () => 'id-1' },
    );
    expect(gestuurd).toHaveLength(1);
    const payload = gestuurd[0].payload as Record<string, unknown>;
    expect(payload.skill).toBe('deep-research');
    expect(gestuurd[0].assignee).toBe('browser');
    // Het hek, niet alleen de instructietekst: de backend mag niets schrijven.
    expect(gestuurd[0].execution_mode).toBe('read');
    // En de opdracht is de volle instructie, niet de twee woorden die Luka zei.
    expect(String(gestuurd[0].goal).length).toBeGreaterThan(100);
  });

  it('houdt device=mac-mini vast tot de durable task — niet droppen in payloadVoor', async () => {
    await startJobsParallel(
      [{
        text: 'check northsea deals on the Mac mini',
        titel: 'Check NorthSea deals',
        device: 'mac-mini',
        tab: 'home',
        route: classifyAxeTier('check northsea deals on the Mac mini'),
      }],
      { create, id: () => 'id-device' },
    );
    expect(gestuurd).toHaveLength(1);
    const payload = gestuurd[0].payload as Record<string, unknown>;
    const meta = gestuurd[0].metadata as Record<string, unknown>;
    expect(payload.device).toBe('mac-mini');
    expect(meta.device).toBe('mac-mini');
    expect(payload.tab).toBe('home');
    expect((payload.workspace as { role?: string })?.role).toMatch(/commodity/i);
  });

  it('schrijft de taakmap in de kluis, anders ziet de Obsidian-tab hem niet', async () => {
    const mappen: string[] = [];
    await startJobsParallel(
      [{
        text: 'check northsea deals on the Mac mini',
        device: 'mac-mini',
        tab: 'home',
        route: classifyAxeTier('check northsea deals on the Mac mini'),
      }],
      {
        create: async (input) => {
          gestuurd.push(input);
          return { task: { id: 'task-mac-mini-1' } };
        },
        kluis: async (in_) => {
          const pad = `AXE/Agents/NorthSea Desk Manager/Tasks/${in_.taskId}/task.md`;
          mappen.push(pad);
          return pad;
        },
        id: () => 'id-kluis',
      },
    );
    expect(mappen).toEqual(['AXE/Agents/NorthSea Desk Manager/Tasks/task-mac-mini-1/task.md']);
  });

  it('een NorthSea-opdracht zonder agent-id schrijft de taak onder die agent', async () => {
    const mappen: string[] = [];
    await startJobsParallel(
      [{
        text: 'doe dit aan Northsea Desk',
        device: 'mac-mini',
        tab: 'home',
        route: classifyAxeTier('doe dit aan Northsea Desk'),
      }],
      {
        create: async (input) => {
          gestuurd.push(input);
          return { task: { id: 'task-desk-1' } };
        },
        kluis: async (in_) => {
          expect(in_.agent).toBe('northsea');
          expect(in_.device).toBe('mac-mini');
          const pad = `AXE/Agents/NorthSea Desk Manager/Tasks/${in_.taskId}/task.md`;
          mappen.push(pad);
          return pad;
        },
        id: () => 'id-desk',
      },
    );
    expect(gestuurd[0].assignee).toBe('northsea');
    expect(mappen).toEqual(['AXE/Agents/NorthSea Desk Manager/Tasks/task-desk-1/task.md']);
  });

  it('laat gewoon werk op execute staan -- de leesstand is van de skill, niet van alles', async () => {
    await startJobsParallel(
      [{ text: 'fix the login bug', route: classifyAxeTier('fix the login bug') }],
      { create, id: () => 'id-2' },
    );
    expect(gestuurd[0].execution_mode).toBe('execute');
    expect((gestuurd[0].payload as Record<string, unknown>).skill).toBeNull();
  });
});
