import { describe, it, expect } from 'vitest';
import {
  gewoneTaal, stappenUit, zichtbareVensters, managerRijen, managerVan, regelVan,
  VENSTER_NAGLOEI_MS, MAX_VENSTERS,
} from './agentVenster';
import type { AxeJob } from './axeJobRegels';
import type { AxeAgentId } from '@/domain/agents/roster';
import { agentById } from '@/domain/agents/roster';

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

  // OS3, W3c: dit was het gat. Een job van Browser/Intel/Task/... draaide wél,
  // maar viel uit de kolom en was daarmee nergens rond de core te zien.
  it('hangt werk van een tier-2-werker onder zijn manager in plaats van het te laten verdwijnen', () => {
    const rijen = managerRijen([job('x', { agent: 'browser', title: 'Open the docs' })], 0);
    const wingman = rijen.find((r) => r.agent.id === 'wingman');
    expect(wingman?.job?.id).toBe('x');
    // Wie het doet staat erbij: anders lijkt het alsof Wingman zelf browst.
    expect(wingman?.regel).toBe('Browser · Open the docs');
  });

  it('elke tier-2/tier-3-agent en AXE zelf krijgt een zichtbare rij', () => {
    const werkers: AxeAgentId[] = [
      'browser', 'memory', 'task', 'cron', 'finance', 'apps', 'intel', 'companion', 'axe',
    ];
    for (const id of werkers) {
      const rijen = managerRijen([job('x', { agent: id, title: 'Doing the thing' })], 0);
      const bezet = rijen.filter((r) => r.job != null);
      expect(bezet, `geen rij voor ${id}`).toHaveLength(1);
      expect(bezet[0].agent.tier, `${id} hangt niet onder een tier-1 manager`).toBe('tier1');
      expect(bezet[0].regel, id).toBe(`${agentById(id).kort ?? agentById(id).name} · Doing the thing`);
    }
  });

  it('managerVan volgt de roster: app-machinerie naar Developer, dakloos werk naar Wingman', () => {
    expect(['memory', 'task', 'cron', 'finance', 'apps'].map((id) => managerVan(id as AxeAgentId)))
      .toEqual(['developer', 'developer', 'developer', 'developer', 'developer']);
    expect(['browser', 'intel', 'companion', 'axe'].map((id) => managerVan(id as AxeAgentId)))
      .toEqual(['wingman', 'wingman', 'wingman', 'wingman']);
    // Een manager houdt zijn eigen werk.
    expect(managerVan('trading')).toBe('trading');
    expect(managerVan('northsea')).toBe('northsea');
  });

  it('een manager die zelf werkt krijgt geen naam voor zijn zin geplakt', () => {
    const rijen = managerRijen([job('x', { agent: 'trading', title: 'Check my risk' })], 0);
    expect(rijen.find((r) => r.agent.id === 'trading')?.regel).toBe('Check my risk');
  });

  it('eigen werk en doorgeschoven werk delen één rij: de nieuwste wint', () => {
    const jobs = [
      job('eigen', { agent: 'wingman', startedAt: 10, title: 'Brief the crew' }),
      job('door', { agent: 'browser', startedAt: 20, title: 'Open the docs' }),
    ];
    const wingman = managerRijen(jobs, 0).find((r) => r.agent.id === 'wingman');
    expect(wingman?.job?.id).toBe('door');
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
