import { describe, it, expect } from 'vitest';
import { splitsAxeBeurten, jobStukkenVan } from '@/domain/tierRouter/splitsAxeBeurten';
import { startJobsParallel } from './stuurAxeJobs';

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
