import { describe, expect, it } from 'vitest';
import {
  agentRegel,
  bewustzijnVanJobs,
  goedkeuringVanJob,
  openGoedkeuringen,
} from './agentBewustzijn';
import type { AxeJob } from './tierRouter/axeJobRegels';

function job(over: Partial<AxeJob> = {}): AxeJob {
  return {
    id: 'j1',
    title: 'Fix AXE Core build',
    agent: 'developer',
    state: 'running',
    startedAt: 1,
    sourceText: 'fix the build stamp',
    ...over,
  };
}

describe('agentBewustzijn', () => {
  it('toont wat de agent doet, en geen goedkeuring binnen het plan', () => {
    const binnen = job({ stappen: ['Step 1: $ npx tsc --noEmit'] });
    expect(goedkeuringVanJob(binnen)).toBeNull();
    expect(agentRegel(binnen)).toMatch(/tsc|Fix AXE Core/i);
    expect(openGoedkeuringen([binnen])).toEqual([]);
  });

  it('een Northsea-send die het plan al toestaat is geen extra goedkeuring', () => {
    const mag = job({
      agent: 'northsea',
      title: 'Send the qualification email to the seller',
      sourceText: 'send the qualification email to the seller',
      state: 'waiting',
    });
    expect(goedkeuringVanJob(mag)).toBeNull();
    expect(openGoedkeuringen([mag])).toEqual([]);
  });

  it('zet een send als goedkeuring met wat, waarom en wat ja doet', () => {
    const send = job({
      agent: 'northsea',
      title: 'Send the offer to the buyer',
      sourceText: 'send the offer to the buyer',
      state: 'waiting',
      approvalId: 'a1',
      approvalVraag: 'send the offer',
    });
    const vraag = goedkeuringVanJob(send);
    expect(vraag?.wat).toMatch(/Dit is/);
    expect(vraag?.waarom).toMatch(/Waarom/);
    expect(vraag?.ja).toMatch(/Ja betekent/);
    expect(agentRegel(send)).toMatch(/Dit is/);
    const open = openGoedkeuringen([send]);
    expect(open).toHaveLength(1);
    expect(open[0].goedkeuring.tekst).toMatch(/Waarom/);
  });

  it('houdt idle managers stil, en noemt wie wél iets zegt', () => {
    const stand = bewustzijnVanJobs([
      job({ agent: 'trading', title: 'Analyse EURUSD on demo', stappen: ['Reading the ledger'] }),
    ]);
    const trading = stand.find((s) => s.agentId === 'trading');
    const northsea = stand.find((s) => s.agentId === 'northsea');
    expect(trading?.regel).toMatch(/ledger|Analyse/i);
    expect(trading?.goedkeuring).toBeNull();
    expect(northsea?.regel).toBe('');
  });
});
