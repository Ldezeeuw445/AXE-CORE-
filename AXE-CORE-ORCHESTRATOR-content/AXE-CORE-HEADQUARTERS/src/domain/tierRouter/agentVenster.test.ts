import { describe, it, expect } from 'vitest';
import { gewoneTaal, stappenUit, zichtbareVensters, VENSTER_NAGLOEI_MS, MAX_VENSTERS } from './agentVenster';
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
