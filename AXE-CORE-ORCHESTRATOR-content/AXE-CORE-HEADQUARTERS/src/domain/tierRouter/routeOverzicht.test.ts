/**
 * Settings hoort te tonen wat er gebeurt, niet wat er ooit bedacht is.
 *
 * Het oude paneel beschreef branch A/B/C: de LangGraph-orchestrator op de VPS.
 * Die wordt aangeroepen vanuit de binnenste van vijf sendMessage-wikkels en
 * bijna nooit bereikt. Deze telling leest het echte routeringslog.
 */
import { describe, it, expect } from 'vitest';
import { routeOverzicht, tierVan, laatsteBeurtTekst, type RouteBeurt } from './routeOverzicht';

const beurt = (over: Partial<RouteBeurt> = {}): RouteBeurt => ({ ts: 1_000, ...over });

describe('tierVan', () => {
  it('neemt routeTier als die er staat', () => {
    expect(tierVan(beurt({ routeTier: 2, via: 'rules' }))).toBe(2);
  });

  /* Oudere beurten hebben geen routeTier. Zonder deze afleiding valt een log
     van gisteren stil weg als "onbekend", en lijkt het paneel leeg terwijl er
     wel degelijk gewerkt is. */
  it('leidt hem af uit `via` als routeTier ontbreekt', () => {
    expect(tierVan(beurt({ via: 'rules' }))).toBe(1);
    expect(tierVan(beurt({ via: 'tier2' }))).toBe(2);
    expect(tierVan(beurt({ via: 'tier3' }))).toBe(3);
    expect(tierVan(beurt({ via: 'crew' }))).toBe(3);
  });

  it('geeft null als er niets te zeggen valt', () => {
    expect(tierVan(beurt({ via: 'langgraph' }))).toBeNull();
    expect(tierVan(beurt())).toBeNull();
  });
});

describe('routeOverzicht', () => {
  it('toont altijd alle drie de wegen, ook die op nul staan', () => {
    const r = routeOverzicht([beurt({ routeTier: 1 })]);
    expect(r.map((x) => x.tier)).toEqual([1, 2, 3]);
    expect(r[1].aantal).toBe(0);
    expect(r[1].deel).toBe(0);
  });

  it('telt het aandeel over de gemeten beurten', () => {
    const r = routeOverzicht([
      beurt({ ts: 3, routeTier: 1 }),
      beurt({ ts: 2, routeTier: 1 }),
      beurt({ ts: 1, routeTier: 3 }),
    ]);
    expect(r[0].aantal).toBe(2);
    expect(r[0].deel).toBeCloseTo(2 / 3);
    expect(r[2].aantal).toBe(1);
  });

  it('noemt de motor die het laatst via die weg antwoordde', () => {
    const r = routeOverzicht([
      beurt({ ts: 2, routeTier: 2, winner: 'groq', winnerModel: 'llama-3.1-8b-instant' }),
      beurt({ ts: 1, routeTier: 2, winner: 'google' }),
    ]);
    expect(r[1].laatsteMotor).toBe('groq · llama-3.1-8b-instant');
  });

  it('noemt de agent alleen bij tier 3, want alleen daar werkt er een', () => {
    const r = routeOverzicht([
      beurt({ ts: 2, routeTier: 3, delegate: 'trading' }),
      beurt({ ts: 1, routeTier: 1, delegate: 'axe' }),
    ]);
    expect(r[2].laatsteAgent).toBe('trading');
    expect(r[0].laatsteAgent).toBeNull();
  });

  it('kijkt niet verder terug dan gevraagd', () => {
    const veel = Array.from({ length: 80 }, (_, i) => beurt({ ts: i, routeTier: 1 }));
    expect(routeOverzicht(veel, 10)[0].aantal).toBe(10);
  });

  it('een leeg log is geen fout', () => {
    const r = routeOverzicht([]);
    expect(r).toHaveLength(3);
    expect(r.every((x) => x.aantal === 0 && x.deel === 0)).toBe(true);
    expect(laatsteBeurtTekst([])).toBeNull();
  });
});

describe('laatsteBeurtTekst', () => {
  it('zegt welke weg en welke motor', () => {
    const t = laatsteBeurtTekst([beurt({ ts: 5, routeTier: 3, winner: 'anthropic', winnerModel: 'claude-sonnet-5' })]);
    expect(t).toContain('tier 3');
    expect(t).toContain('anthropic · claude-sonnet-5');
  });
});
