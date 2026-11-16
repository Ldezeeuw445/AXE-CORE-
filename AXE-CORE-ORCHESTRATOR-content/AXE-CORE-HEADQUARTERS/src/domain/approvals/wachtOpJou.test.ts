import { describe, expect, it } from 'vitest';
import { hoeLang, samen, vanAxe, vanNorthsea, zonderUuid } from './wachtOpJou';

describe('wacht op jou', () => {
  it('haalt UUIDs en "Yes needed" weg', () => {
    expect(zonderUuid('Yes needed: 2356eac9-dc0e-4a3f-8986-3d86f3ee7db3 — Copper Cathode')).toBe('Copper Cathode');
  });

  it('zet AXE- en NorthSea-vragen in één lijst, oudste eerst, met wat/waarom/wie', () => {
    const axe = vanAxe([{ id: 'a1', task_id: 't1', title: 'Sleutel vernieuwen', detail: 'Login verlopen',
      created_at: '2026-11-16T10:00:00Z' }], { t1: 'projectsmgr' });
    const ns = vanNorthsea([{ approval_id: 'd1', kind: 'reply_draft', subject: 'Copper — supply qualification',
      created_at: '2026-11-01T10:00:00Z' }]);
    const lijst = samen(axe, ns);
    expect(lijst.map((i) => i.bron)).toEqual(['northsea', 'axe']);
    expect(lijst[0].wat).toBe('Mail klaar om te versturen: Copper — supply qualification');
    expect(lijst[0].kanHierBeslissen).toBe(false);
    expect(lijst[1]).toMatchObject({ wie: 'Projects Manager', wat: 'Sleutel vernieuwen', waarom: 'Login verlopen', kanHierBeslissen: true });
  });

  it('dubbelen tellen één keer', () => {
    const a = vanAxe([{ id: 'a1', task_id: 't1', created_at: '2026-11-16T10:00:00Z' }]);
    expect(samen(a, a)).toHaveLength(1);
  });

  it('zegt hoe lang iets wacht', () => {
    const nu = new Date('2026-11-16T12:00:00Z');
    expect(hoeLang('2026-11-16T11:30:00Z', nu)).toBe('30 min');
    expect(hoeLang('2026-11-13T12:00:00Z', nu)).toBe('3 dagen');
  });
});
