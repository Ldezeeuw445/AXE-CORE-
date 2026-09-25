import { describe, it, expect } from 'vitest';
import {
  gewoneTaal, stappenUit, zichtbareVensters, managerRijen, regelVan,
  VENSTER_NAGLOEI_MS, MAX_VENSTERS,
} from './agentVenster';
import type { AxeJob } from './axeJobRegels';

describe('gewoneTaal', () => {
  it('maakt van de echte agent-lus-regels (25 sep) iets leesbaars', () => {
    expect(gewoneTaal('AXE started working directly, with a budget of 40 steps.')).toBe('On it.');
    expect(gewoneTaal('Step 1: $ df -h /')).toBe('Running df -h /');
    expect(gewoneTaal('Step 4: reading /opt/northsea/log.txt')).toBe('Reading /opt/northsea/log.txt');
    expect(gewoneTaal("Step 3: agent claims completion, verifying with `df -h /`.")).toBe('Checking my work.');
    expect(gewoneTaal('AXE finished in 3 steps and proved the result.')).toBe('Done, and checked.');
  });
  it('laat ruis weg', () => {
    expect(gewoneTaal('Step 2: no action taken, prompting to continue.')).toBeNull();
    expect(gewoneTaal('Proof command ran and produced the expected result.')).toBeNull();
    expect(gewoneTaal('')).toBeNull();
  });
});

describe('stappenUit', () => {
  it('houdt de laatste regels en geen dubbele achter elkaar', () => {
    const uit = stappenUit([
      'AXE started working directly, with a budget of 40 steps.',
      'Step 1: $ uptime',
      'Step 2: no action taken, prompting to continue.',
      'Step 3: $ uptime',
      'Step 4: $ df -h /',
    ], 4);
    expect(uit).toEqual(['On it.', 'Running uptime', 'Running df -h /']);
  });
});

describe('zichtbareVensters', () => {
  const job = (id: string, over: Partial<AxeJob> = {}): AxeJob => ({
    id, title: id, agent: 'northsea', state: 'running', startedAt: 0, sourceText: id, ...over,
  });
  it('lopend en net klaar blijven staan, oud klaar gaat weg', () => {
    const nu = 100_000;
    const jobs = [
      job('oud', { state: 'done', finishedAt: nu - VENSTER_NAGLOEI_MS - 1 }),
      job('net', { state: 'done', finishedAt: nu - 1_000 }),
      job('wacht', { state: 'waiting' }),
      job('loopt'),
    ];
    expect(zichtbareVensters(jobs, nu).map((j) => j.id)).toEqual(['net', 'wacht', 'loopt']);
  });
  it('nooit meer dan vier rond de core', () => {
    const jobs = Array.from({ length: 7 }, (_, i) => job(`j${i}`));
    expect(zichtbareVensters(jobs, 0)).toHaveLength(MAX_VENSTERS);
  });
});

describe('managerRijen', () => {
  const job = (id: string, over: Partial<AxeJob> = {}): AxeJob => ({
    id, title: id, agent: 'northsea', state: 'running', startedAt: 0, sourceText: id, ...over,
  });

  it('geeft altijd alle vijf de managers, in de volgorde van de roster', () => {
    const rijen = managerRijen([], 0);
    expect(rijen.map((r) => r.agent.id)).toEqual([
      'wingman', 'northsea', 'trading', 'developer', 'thinktank',
    ]);
    expect(rijen.every((r) => r.job === null && r.regel === '')).toBe(true);
  });

  it('kapt niet af op vier: vijf lopende managers houden alle vijf hun rij', () => {
    const jobs: AxeJob[] = [
      job('a', { agent: 'wingman' }),
      job('b', { agent: 'northsea' }),
      job('c', { agent: 'trading' }),
      job('d', { agent: 'developer' }),
      job('e', { agent: 'thinktank' }),
    ];
    const rijen = managerRijen(jobs, 0);
    expect(rijen.filter((r) => r.job != null)).toHaveLength(5);
  });

  it('laat werk van een tier-2-agent buiten de kolom', () => {
    const rijen = managerRijen([job('x', { agent: 'browser' })], 0);
    expect(rijen.every((r) => r.job === null)).toBe(true);
  });

  it('een job die lang klaar is telt niet meer mee', () => {
    const nu = 100_000;
    const oud = job('oud', { agent: 'trading', state: 'done', finishedAt: nu - VENSTER_NAGLOEI_MS - 1 });
    const trading = managerRijen([oud], nu).find((r) => r.agent.id === 'trading');
    expect(trading?.job).toBeNull();
  });

  it('bij twee jobs op dezelfde manager wint de nieuwste', () => {
    const jobs = [
      job('oud', { agent: 'trading', startedAt: 10 }),
      job('nieuw', { agent: 'trading', startedAt: 20 }),
    ];
    const trading = managerRijen(jobs, 0).find((r) => r.agent.id === 'trading');
    expect(trading?.job?.id).toBe('nieuw');
  });
});

describe('regelVan', () => {
  const basis: AxeJob = {
    id: 'j', title: 'Check my risk', agent: 'trading', state: 'running',
    startedAt: 0, sourceText: 'check my risk',
  };

  it('neemt de slotzin zodra die er is', () => {
    expect(regelVan({ ...basis, state: 'done', summary: 'Risk back to 1.4%.' }))
      .toBe('Risk back to 1.4%.');
  });

  it('anders de laatste stap, in gewone taal', () => {
    expect(regelVan({ ...basis, stappen: ['Step 1: $ uptime', 'Step 2: $ df -h /'] }))
      .toBe('Running df -h /');
  });

  it('en zonder stappen gewoon waar AXE hem op zette', () => {
    expect(regelVan(basis)).toBe('Check my risk');
  });
});
