import { describe, expect, it } from 'vitest';
import { appPlanVan, staandeAppPlannen } from './appPlan';
import {
  goedkeuringVoorActie,
  northseaSendBinnenPlan,
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
    const ns = appPlanVan('northsea');
    expect(ns.magNiet).not.toMatch(/geen mail, geen auto_send/i);
    expect(ns.is + ns.wordt).toMatch(/automatisch|toestaat/i);
    expect(appPlanVan('trading_os').magNiet).toMatch(/live order/i);
    expect(appPlanVan('axe_core').magNiet).toMatch(/mail/i);
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
      expect(verlaatAppPlan(`${t.title} ${t.goal ?? ''}`, t.app)).toBeNull();
      expect(goedkeuringVoorActie(t), t.title).toBeNull();
    }
  });

  it('een Northsea-send die het plan al toestaat vraagt geen extra akkoord', () => {
    const mag = { title: 'Send the qualification email to the seller', app: 'northsea' as const };
    expect(northseaSendBinnenPlan(mag.title)).toBe(true);
    expect(taakBinnenPlan(mag)).toBe(true);
    expect(goedkeuringVoorActie(mag)).toBeNull();
    expect(goedkeuringVoorActie({ title: 'Follow-up on open qualification points', app: 'northsea' })).toBeNull();
    expect(goedkeuringVoorActie({ title: 'Send a non-binding reply to the buyer', app: 'northsea' })).toBeNull();
    expect(goedkeuringVoorActie({ title: 'Send the qualification email to the seller', app: 'axe_core' })).not.toBeNull();
    expect(goedkeuringVoorActie({ title: 'Send an email to the buyer', app: 'northsea' })).not.toBeNull();
  });

  it('een send die het Northsea-plan niet toestaat vraagt, met wat, aan wie en waarom', () => {
    const vraag = goedkeuringVoorActie({
      title: 'Send the offer to the buyer',
      app: 'northsea',
    });
    expect(northseaSendBinnenPlan('Send the offer to the buyer')).toBe(false);
    expect(taakBinnenPlan({ title: 'Send the offer to the buyer', app: 'northsea' })).toBe(false);
    expect(vraag).not.toBeNull();
    expect(vraag?.wat).toMatch(/Dit is/);
    expect(vraag?.aan).toMatch(/buyer/i);
    expect(vraag?.waarom).toMatch(/Waarom/);
    expect(vraag?.tekst).toMatch(/Dit is/);
    expect(vraag?.tekst).toMatch(/Aan wie/);
    expect(vraag?.tekst).toMatch(/Waarom/);
  });

  it('vraagt bij geld of een deal, en bij een send zonder Northsea-plan', () => {
    const geld = goedkeuringVoorActie({ title: 'Place a live order on gold', app: 'trading_os' });
    expect(geld?.tekst).toMatch(/Dit is/);
    expect(geld?.tekst).toMatch(/Waarom/);
    const deal = goedkeuringVoorActie({ title: 'Move the deal to closed won', app: 'northsea' });
    expect(deal?.tekst).toMatch(/deal/);
    expect(goedkeuringVoorActie({ title: 'Pay the invoice to the seller', app: 'northsea' })?.tekst).toMatch(/Waarom/);
    expect(goedkeuringVoorActie({ title: 'Introduce us to the buyer', app: 'northsea' })?.tekst).toMatch(/Waarom/);
  });
});
