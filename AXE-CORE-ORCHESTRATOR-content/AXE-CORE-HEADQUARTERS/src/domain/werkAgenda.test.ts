import { describe, expect, it } from 'vitest';
import { werkAgenda } from './werkAgenda';
import { appMeta } from './apps';

describe('werkAgenda', () => {
  it('zet elk soort werk op zijn moment, in de kleur van zijn app, met zichtbare oorsprong', () => {
    const items = werkAgenda(
      [
        { id: 'a', title: 'Deal-kaart', status: 'pending', created_at: '2026-09-14T09:00:00', metadata: { planner: true, app: 'northsea', agent: 'northsea' }, planner: true },
        { id: 'b', title: 'Factuur', status: 'queued', created_at: '2026-09-01T09:00:00', requested_by: 'luka', metadata: { dueAt: '2026-09-15T14:30:00', app: 'axe_companion', requested_by: 'luka' } },
        { id: 'c', title: 'Zonder deadline', status: 'queued', created_at: '2026-09-01T09:00:00', metadata: {} },
      ],
      [
        { id: 'x', name: 'Ochtendrapport', enabled: true, next_run_at: '2026-09-15T07:00:00', metadata: { app: 'trading_os' } },
        { id: 'y', name: 'Uit', enabled: false, next_run_at: '2026-09-15T08:00:00' },
      ],
    );
    expect(items.map(i => [i.titel, i.datum, i.tijd, i.kleur])).toEqual([
      ['Deal-kaart', '2026-09-14', '09:00', appMeta('northsea').kleur],
      ['Ochtendrapport', '2026-09-15', '07:00', appMeta('trading_os').kleur],
      ['Factuur', '2026-09-15', '14:30', appMeta('axe_companion').kleur],
    ]);
    expect(items[0].soort).toMatch(/planner/i);
    expect(items[1].soort).toMatch(/Cron/);
    expect(items[2].soort).toMatch(/spoken request/);
  });

  it('een afgeronde planner-taak staat op zijn afronding, en dubbelen tellen één keer', () => {
    const t = { id: 'p', title: 'Onderzoek', status: 'completed', created_at: '2026-09-13T01:00:00', completed_at: '2026-09-13T01:40:00', planner: true };
    const items = werkAgenda([t, t], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ titel: '✓ Onderzoek', tijd: '01:40', kleur: appMeta('axe_core').kleur });
  });

  it('toont geen wees zonder eigenaar alsof iemand hem vroeg', () => {
    const items = werkAgenda(
      [{ id: 'g', title: 'Ghost', status: 'queued', created_at: '2026-09-01T09:00:00', metadata: { dueAt: '2026-09-15T16:00:00' } }],
      [],
    );
    expect(items).toEqual([]);
  });
});
