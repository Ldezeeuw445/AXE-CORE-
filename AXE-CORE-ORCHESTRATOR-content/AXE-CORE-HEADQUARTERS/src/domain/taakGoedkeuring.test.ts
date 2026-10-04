import { describe, expect, it } from 'vitest';
import { appPlanVan, staandeAppPlannen } from './appPlan';
import {
  goedkeuringVoorActie,
  taakBinnenPlan,
  verlaatAppPlan,
} from './taakGoedkeuring';

describe('staande appplannen', () => {
  it('schrijft AXE Core, Northsea Desk en de trading agent één keer', () => {
    const plannen = staandeAppPlannen();
    expect(appPlanVan('axe_core').pad).toBe('AXE/Workplaces/AXE Core/plan.md');
    expect(plannen.map((p) => p.app)).toEqual(['axe_core', 'northsea', 'trading_os']);
    expect(plannen.map((p) => p.pad)).toEqual([
      'AXE/Workplaces/AXE Core/plan.md',
      'AXE/Workplaces/Northsea Desk/plan.md',
      'AXE/Workplaces/Trading/plan.md',
    ]);
    for (const p of plannen) {
      expect(p.is.length).toBeGreaterThan(10);
      expect(p.wordt.length).toBeGreaterThan(10);
      expect(p.magNiet).toMatch(/mail|live order|auto_send/i);
    }
  });
});

describe('goedkeuring alleen buiten het plan', () => {
  it('maakt van een taak binnen het plan geen goedkeuring', () => {
    const binnen = [
      { title: 'Fix AXE Core build stamp', app: 'axe_core' as const },
      { title: 'Keep the NorthSea desk running', app: 'northsea' as const },
      { title: 'Analyse EURUSD on the demo ledger', app: 'trading_os' as const },
      { title: 'Continue: Check NorthSea deals', goal: 'review the queue', app: 'northsea' as const },
    ];
    for (const t of binnen) {
      expect(taakBinnenPlan(t), t.title).toBe(true);
      expect(verlaatAppPlan(`${t.title} ${t.goal ?? ''}`)).toBeNull();
      expect(goedkeuringVoorActie(t), t.title).toBeNull();
    }
  });

  it('vraagt bij versturen, in het Nederlands wat en waarom', () => {
    const vraag = goedkeuringVoorActie({
      title: 'Send the offer to the buyer',
      app: 'northsea',
    });
    expect(taakBinnenPlan({ title: 'Send the offer to the buyer', app: 'northsea' })).toBe(false);
    expect(vraag).not.toBeNull();
    expect(vraag?.wat).toMatch(/Dit is/);
    expect(vraag?.waarom).toMatch(/Waarom/);
    expect(vraag?.ja).toMatch(/Ja betekent/);
    expect(vraag?.tekst).toMatch(/Dit is/);
    expect(vraag?.tekst).toMatch(/Waarom/);
    expect(vraag?.tekst).toMatch(/bericht/);
  });

  it('vraagt ook bij geld, een deal, of auto_send', () => {
    const geld = goedkeuringVoorActie({ title: 'Place a live order on gold', app: 'trading_os' });
    expect(geld?.tekst).toMatch(/Dit is/);
    expect(geld?.tekst).toMatch(/Waarom/);
    const deal = goedkeuringVoorActie({ title: 'Move the deal to closed won', app: 'northsea' });
    expect(deal?.tekst).toMatch(/deal/);
    expect(goedkeuringVoorActie({ title: 'turn on auto_send_followups', app: 'northsea' })?.tekst).toMatch(/bericht/);
  });
});
