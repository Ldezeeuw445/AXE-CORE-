import { describe, it, expect } from 'vitest';
import { draadVanJob, draadVoorAgent } from './agentDraad';
import type { AxeJob } from './axeJobRegels';

function job(over: Partial<AxeJob> = {}): AxeJob {
  return {
    id: 'j1',
    title: 'Check NorthSea deals',
    agent: 'northsea',
    state: 'running',
    startedAt: 1,
    sourceText: 'check northsea deals on the Mac mini',
    ...over,
  };
}

describe('agentDraad', () => {
  it('is een live draad: opdracht, stappen, goedkeuring — niet alleen status', () => {
    const berichten = draadVanJob(job({
      state: 'waiting',
      stappen: ['AXE started working directly, with a budget of 40 steps.', 'Step 1: $ ls'],
      approvalVraag: 'May I run systemctl restart axe-core-api?',
    }));
    expect(berichten.map((b) => b.soort)).toEqual(['instruction', 'step', 'step', 'approval']);
    expect(berichten[0].tekst).toMatch(/mac mini/i);
    expect(berichten.some((b) => b.soort === 'approval')).toBe(true);
  });

  it('plakt opvolging van dezelfde agent aan dezelfde draad', () => {
    const eerste = job({ id: 'a', startedAt: 1 });
    const opvolging = job({
      id: 'b',
      startedAt: 2,
      bron: 'followup',
      sourceText: 'also list the counterparties',
      state: 'queued',
    });
    const draad = draadVoorAgent([opvolging, eerste], 'northsea');
    expect(draad[0].soort).toBe('instruction');
    expect(draad.some((b) => b.soort === 'followup' && /counterparties/.test(b.tekst))).toBe(true);
  });
});
