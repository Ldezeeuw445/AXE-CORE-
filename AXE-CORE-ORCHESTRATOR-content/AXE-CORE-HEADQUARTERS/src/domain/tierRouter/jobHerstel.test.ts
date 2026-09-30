/**
 * Wat er van lopend werk overblijft als de app dicht gaat, en wanneer een
 * monitor het opgeeft.
 *
 * De situatie die dit moet voorkomen: je sluit de app terwijl NorthSea draait,
 * je opent hem een uur later, en de balk staat vol "running" terwijl er
 * niemand meer kijkt en de taak op de VPS allang klaar is.
 */
import { describe, it, expect } from 'vitest';
import {
  JOB_BEWAAR_MS,
  JOB_MAX_LOOPTIJD_MS,
  bewaarbareJobs,
  hervatbareJobs,
  monitorMoetStoppen,
  verweesdeJobs,
  volgendePollMs,
} from './jobHerstel';
import type { AxeJob } from './axeJobRegels';

const NU = 10_000_000;

const job = (over: Partial<AxeJob> = {}): AxeJob => ({
  id: 'j1', title: 'scan', agent: 'trading', state: 'running',
  startedAt: NU - 60_000, taskId: 'task-1', sourceText: 'scan', ...over,
});

describe('bewaarbareJobs', () => {
  it('houdt wat nog loopt, ook zonder eindtijd', () => {
    const uit = bewaarbareJobs([job({ state: 'running' }), job({ id: 'q', state: 'queued' })], NU);
    expect(uit.map((j) => j.id)).toEqual(['j1', 'q']);
  });

  it('gooit een afgeronde job weg die ouder is dan de bewaartermijn', () => {
    const oud = job({ id: 'oud', state: 'done', finishedAt: NU - JOB_BEWAAR_MS - 1 });
    const vers = job({ id: 'vers', state: 'done', finishedAt: NU - 60_000 });
    expect(bewaarbareJobs([oud, vers], NU).map((j) => j.id)).toEqual(['vers']);
  });

  /* `stappen` groeit per poll aan en is na een herstart niets waard -- de
     monitor haalt verse stappen meteen weer op. Het zou alleen ruimte kosten
     die het gesprek harder nodig heeft. */
  it('bewaart de stappen niet', () => {
    const uit = bewaarbareJobs([job({ stappen: ['een', 'twee'] })], NU);
    expect(uit[0].stappen).toBeUndefined();
    expect(uit[0].title).toBe('scan');
  });

  it('houdt hoogstens het maximum, de nieuwste', () => {
    const veel = Array.from({ length: 30 }, (_, i) => job({ id: `j${i}` }));
    const uit = bewaarbareJobs(veel, NU, 5);
    expect(uit).toHaveLength(5);
    expect(uit[4].id).toBe('j29');
  });
});

describe('wat er na een herstart moet gebeuren', () => {
  it('een lopende job met taskId wordt weer gevolgd', () => {
    const uit = hervatbareJobs([job(), job({ id: 'klaar', state: 'done' })]);
    expect(uit.map((j) => j.id)).toEqual(['j1']);
  });

  /* Zonder taskId is het aanmaken nooit afgerond: er draait niets, dus hij mag
     niet als lopend blijven staan. Dat is de job die anders eeuwig "queued"
     in de balk stond. */
  it('een lopende job zonder taskId is nooit gestart', () => {
    const wees = job({ id: 'wees', state: 'queued', taskId: undefined });
    expect(verweesdeJobs([job(), wees]).map((j) => j.id)).toEqual(['wees']);
    expect(hervatbareJobs([wees])).toEqual([]);
  });
});

describe('volgendePollMs', () => {
  it('begint op vier seconden', () => {
    expect(volgendePollMs(0)).toBe(4_000);
  });

  it('loopt op en blijft onder een halve minuut', () => {
    expect(volgendePollMs(1)).toBeGreaterThan(volgendePollMs(0));
    expect(volgendePollMs(3)).toBeGreaterThan(volgendePollMs(2));
    for (const n of [0, 1, 4, 8, 99]) expect(volgendePollMs(n)).toBeLessThanOrEqual(30_000);
  });
});

describe('monitorMoetStoppen', () => {
  it('laat een verse taak met rust', () => {
    expect(monitorMoetStoppen(job(), NU)).toBeNull();
  });

  it('stopt met kijken na de maximale looptijd', () => {
    expect(monitorMoetStoppen(job({ startedAt: NU - JOB_MAX_LOOPTIJD_MS - 1 }), NU)).toBe('timeout');
  });
});
