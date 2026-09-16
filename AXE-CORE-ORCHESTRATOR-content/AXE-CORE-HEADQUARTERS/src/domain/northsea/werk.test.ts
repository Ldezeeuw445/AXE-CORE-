import { describe, expect, it } from 'vitest';
import { isNorthseaWerk, northseaAgenda, northseaTaken, prioriteitVan } from './werk';
import { appMeta } from '../apps';

describe('prioriteitVan', () => {
  it('vertaalt het getal van AXE Commodities naar de vier banden', () => {
    expect(prioriteitVan(78)).toBe('critical');
    expect(prioriteitVan(50)).toBe('high');
    expect(prioriteitVan(30)).toBe('medium');
    expect(prioriteitVan(5)).toBe('low');
  });

  it('zonder cijfer wordt het medium, niet low', () => {
    expect(prioriteitVan(null)).toBe('medium');
    expect(prioriteitVan('geen getal')).toBe('medium');
  });
});

describe('northseaTaken', () => {
  it('zet bron en dealcode in de regel eronder, en wachten is geblokkeerd', () => {
    const [a, b] = northseaTaken([
      { id: '1', bron: 'deal_task', titel: 'Resolve blocker', status: 'waiting', prioriteit: 78, deal_code: 'DEAL-002', due_at: '2026-09-20T10:00:00Z' },
      { id: '2', bron: 'action_queue', titel: '', status: 'in_progress', prioriteit: null },
    ]);
    expect(a.id).toBe('ns:1');
    expect(a.van).toBe('Deal task · DEAL-002');
    expect(a.stand).toBe('blocked');
    expect(a.deadline).toBe(Date.parse('2026-09-20T10:00:00Z'));
    expect(b.titel).toBe('Untitled task');
    expect(b.van).toBe('Action queue');
    expect(b.stand).toBe('in-progress');
  });

  it('merkt zijn eigen rijen zodat de takenlijst ze niet probeert te beheren', () => {
    expect(isNorthseaWerk('ns:1')).toBe(true);
    expect(isNorthseaWerk('abc')).toBe(false);
  });
});

describe('northseaAgenda', () => {
  it('geeft elk item de kleur van de app, met het soort in de tekst', () => {
    const items = northseaAgenda([
      { id: 'deal:7', soort: 'next_action', wanneer: '2026-09-18T09:30:00Z', titel: 'Call supplier', deal_code: 'DEAL-002' },
      { id: 'campagne:3', soort: 'campagne', wanneer: 'geen datum', titel: 'Screen candidates' },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kleur).toBe(appMeta('northsea').kleur);
    expect(items[0].titel).toBe('DEAL-002 · Call supplier');
    expect(items[0].soort).toBe('next action');
  });
});
