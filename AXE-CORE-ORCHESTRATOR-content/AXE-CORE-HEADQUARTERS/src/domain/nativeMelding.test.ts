import { describe, expect, it } from 'vitest';
import { isNativeSchaduwMelding, nativeMeldingSoort } from './nativeMelding';

describe('nativeMeldingSoort', () => {
  it('herkent een goedkeuring zoals vraag_luka die schrijft', () => {
    expect(nativeMeldingSoort('Goedkeuring nodig: Agent wil een commando draaien.'))
      .toBe('approval');
    expect(nativeMeldingSoort('Trader needs your OK before it runs the order.'))
      .toBe('approval');
  });

  it('herkent een mislukte taak zoals TaskCompletionToasts die schrijft', () => {
    expect(nativeMeldingSoort('Stuck: Import positions: Import positions'))
      .toBe('task_failed');
  });

  it('herkent een klaar-agent zoals TaskCompletionToasts die schrijft', () => {
    expect(nativeMeldingSoort('Done: NorthSea Desk Manager: NorthSea Desk Manager'))
      .toBe('agent_done');
  });

  it('herkent NorthSea needs-your-OK zoals de crew die schrijft', () => {
    expect(nativeMeldingSoort('Yes needed: DEAL-002 — Copper Cathode: Buyer: Qinzhou'))
      .toBe('northsea_ok');
  });

  it('laat provider-ruis buiten het schaduwscherm', () => {
    expect(nativeMeldingSoort("OpenAI (Primair) is niet meer bereikbaar: AXE's chat-provider viel weg"))
      .toBeNull();
    expect(isNativeSchaduwMelding('Daily Briefing: None')).toBe(false);
  });
});
