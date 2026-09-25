import { describe, it, expect } from 'vitest';
import { planBeurt, planInvoer } from './planBeurt';

const GOED = '{"reply":"Doe ik.","jobs":[{"agent":"northsea","title":"Leads","request":"Count last night\'s NorthSea leads."}],"remember":[],"reminders":[]}';

describe('planBeurt', () => {
  it('valt door naar het volgende model als Groq zijn dagtegoed op heeft', async () => {
    const gevraagd: string[] = [];
    const plan = await planBeurt('kijk de leads na', {
      modellen: [
        async () => { gevraagd.push('groq'); throw new Error('429 tokens per day'); },
        async () => { gevraagd.push('openai'); return GOED; },
      ],
    });
    expect(gevraagd).toEqual(['groq', 'openai']);
    expect(plan?.jobs[0].agent).toBe('northsea');
  });

  it('een model dat te lang doet telt als mislukt', async () => {
    const plan = await planBeurt('x', {
      timeoutMs: 20,
      modellen: [() => new Promise((r) => setTimeout(() => r(GOED), 200))],
    });
    expect(plan).toBeNull();
  });

  it('zet recente beurten erbij zodat "die van net" iets betekent', () => {
    const invoer = planInvoer('doe die van net ook', [
      { role: 'user', text: 'check de VPS' },
      { role: 'axe', text: 'VPS is gezond.' },
    ]);
    expect(invoer).toMatch(/Luka: check de VPS\nAXE: VPS is gezond\./);
    expect(invoer).toMatch(/Luka now says: doe die van net ook$/);
  });
});

describe('planBeurt tegelijk', () => {
  it('een snel tweede model wint van een traag eerste', async () => {
    const t0 = Date.now();
    const plan = await planBeurt('x', {
      timeoutMs: 2_000,
      modellen: [
        () => new Promise((r) => setTimeout(() => r(GOED), 1_000)),
        async () => GOED.replace('Doe ik.', 'Snel.'),
      ],
    });
    expect(plan?.reply).toBe('Snel.');
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('geen enkel geldig plan = null, niet wachten op de limiet', async () => {
    const t0 = Date.now();
    const plan = await planBeurt('x', { timeoutMs: 2_000, modellen: [async () => 'geen json', async () => { throw new Error('402'); }] });
    expect(plan).toBeNull();
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
