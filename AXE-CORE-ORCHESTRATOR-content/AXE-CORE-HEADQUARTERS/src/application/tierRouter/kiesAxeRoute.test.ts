import { describe, it, expect } from 'vitest';
import { kiesAxeRoute } from './kiesAxeRoute';

describe('kiesAxeRoute — fallback', () => {
  it('hey axe blijft tier 1 via regels, zonder model', async () => {
    const r = await kiesAxeRoute('hey axe', {
      vraagModel: async () => {
        throw new Error('model mag niet worden aangeroepen');
      },
    });
    expect(r.tier).toBe(1);
    expect(r.via).toBe('rules');
    expect(r.intercept).toBe(true);
    expect(r.kind).toBe('greeting');
    expect(r.latencyMs).toBeLessThan(20);
  });

  it('stop blijft op het huidige pad', async () => {
    const r = await kiesAxeRoute('stop');
    expect(r.intercept).toBe(false);
    expect(r.via).toBe('fallback');
    expect(r.reason).toMatch(/fast:stop/);
  });

  it('timeout van het model valt terug op het huidige pad', async () => {
    const r = await kiesAxeRoute(
      'this is a longer ambiguous note about several moving pieces and no clear verb',
      {
        timeoutMs: 15,
        vraagModel: () => new Promise((resolve) => {
          setTimeout(() => resolve('{"tier":3,"agent":"developer"}'), 200);
        }),
      },
    );
    expect(r.intercept).toBe(false);
    expect(r.via).toBe('fallback');
    expect(r.reason).toMatch(/timeout/);
  });

  it('een throw van het model valt terug op het huidige pad', async () => {
    const r = await kiesAxeRoute(
      'this is a longer ambiguous note about several moving pieces and no clear verb',
      {
        vraagModel: async () => {
          throw new Error('groq 429');
        },
      },
    );
    expect(r.intercept).toBe(false);
    expect(r.via).toBe('fallback');
    expect(r.reason).toMatch(/classifier fail/);
  });

  it('een geldig modelantwoord bij twijfel onderschept wél', async () => {
    const r = await kiesAxeRoute(
      'this is a longer ambiguous note about several moving pieces and no clear verb',
      {
        vraagModel: async () => '{"tier":2,"agent":"axe"}',
      },
    );
    expect(r.intercept).toBe(true);
    expect(r.via).toBe('model');
    expect(r.tier).toBe(2);
  });

  it('geen model + twijfel = huidig pad', async () => {
    const r = await kiesAxeRoute(
      'this is a longer ambiguous note about several moving pieces and no clear verb',
    );
    expect(r.intercept).toBe(false);
    expect(r.via).toBe('fallback');
  });

  it('tier 3-regel onderschept en noemt de agent', async () => {
    const r = await kiesAxeRoute('open a long on XAUUSD');
    expect(r.intercept).toBe(true);
    expect(r.tier).toBe(3);
    expect(r.agent).toBe('trading');
  });
});
