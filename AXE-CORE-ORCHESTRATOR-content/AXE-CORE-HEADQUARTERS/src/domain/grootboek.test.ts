import { describe, expect, it } from 'vitest';
import { appMeta } from './apps';
import {
  agendaVanJobs, bronWoord, duurTekst, filterAgenda, filterRegels, standPerApp, statusWoord, uitkomst, type GrootboekRegel,
} from './grootboek';

const regel = (over: Partial<GrootboekRegel>): GrootboekRegel => ({
  at: '2026-09-16T19:00:00Z', app: 'axe_core', source: 'schedule', kind: 'run', name: 'job', status: 'ok',
  duration_ms: 1200, detail: '', ref_id: Math.random().toString(), ...over,
});

describe('grootboek', () => {
  it('kleurt elk agenda-item met zijn app, en zet frequente jobs als één regel', () => {
    const items = agendaVanJobs([
      { key: 'pg:mt5:2026-09-16', app: 'axe_companion', naam: 'axe-companion-mt5-sync', executor: 'supabase', soort: 'pg_cron',
        at: '2026-09-16T00:00:00Z', aantal: 144, herhaling: 'elke 10 min', bron: 'pg_cron' },
      { key: 'planner', app: 'axe_core', naam: 'Planner', executor: 'mac', soort: 'planner', at: '2026-09-16T22:10:00Z',
        aantal: 1, herhaling: null, bron: 'schedule' },
    ]);
    expect(items[0].kleur).toBe(appMeta('axe_companion').kleur);
    expect(items[0].titel).toContain('elke 10 min (144×)');
    expect(items[0].soort).toBe('Supabase-cron');
    expect(items[1].app).toBe('axe_core');
    expect(items[1].soort).toBe('job op de Mac');
  });

  it('onbekende app valt terug op AXE Core in plaats van te verdwijnen', () => {
    const [i] = agendaVanJobs([{ key: 'x', app: 'iets', naam: 'x', executor: 'vps', soort: 'exec', at: '2026-09-16T10:00:00Z', aantal: 1, herhaling: null, bron: 'schedule' }]);
    expect(i.app).toBe('axe_core');
  });

  it('filtert de agenda per app maar laat eigen afspraken staan', () => {
    const items = [
      { id: 'a', titel: 'a', datum: '2026-09-16', tijd: '10:00', duurMin: 15, kleur: '', soort: '', app: 'northsea' as const },
      { id: 'b', titel: 'b', datum: '2026-09-16', tijd: '11:00', duurMin: 15, kleur: '', soort: '', app: 'axe_core' as const },
      { id: 'c', titel: 'eigen', datum: '2026-09-16', tijd: '12:00', duurMin: 60, kleur: '', soort: 'meeting' },
    ];
    expect(filterAgenda(items, 'northsea').map(i => i.id)).toEqual(['a', 'c']);
    expect(filterAgenda(items, 'alle')).toHaveLength(3);
  });

  it('telt per app, altijd alle vijf apps, met de laatste fout', () => {
    const stand = standPerApp([
      regel({ app: 'northsea', status: 'ok' }),
      regel({ app: 'northsea', status: 'fail', at: '2026-09-16T18:00:00Z', name: 'oud' }),
      regel({ app: 'northsea', status: 'timeout', at: '2026-09-16T19:30:00Z', name: 'nieuw' }),
      regel({ app: 'axe_companion', source: 'pg_cron', status: 'ok' }),
      regel({ app: 'axe_core', source: 'task', status: 'pending' }),
    ]);
    expect(stand.map(s => s.app)).toEqual(['axe_core', 'axe_companion', 'trading_os', 'axon_memory', 'northsea']);
    const ns = stand.find(s => s.app === 'northsea')!;
    expect([ns.totaal, ns.goed, ns.fout, ns.laatsteFout?.name]).toEqual([3, 1, 2, 'nieuw']);
    expect(stand.find(s => s.app === 'trading_os')!.totaal).toBe(0);
    expect(stand.find(s => s.app === 'axe_core')!.open).toBe(1);
  });

  it('filtert regels op app en bron', () => {
    const r = [regel({ app: 'northsea', source: 'task' }), regel({ app: 'northsea', source: 'schedule' }), regel({ app: 'axe_core' })];
    expect(filterRegels(r, 'northsea', 'task')).toHaveLength(1);
    expect(filterRegels(r, 'alle', 'schedule')).toHaveLength(2);
  });

  it('zegt status, bron en duur in gewone woorden', () => {
    expect([statusWoord('ok'), statusWoord('failed'), statusWoord('waiting_approval'), statusWoord('iets')]).toEqual(['gelukt', 'mislukt', 'wacht op akkoord', 'iets']);
    expect([uitkomst('completed'), uitkomst('timeout'), uitkomst('running'), uitkomst('pending')]).toEqual(['goed', 'fout', 'bezig', 'open']);
    expect([bronWoord('launchd'), bronWoord('schedule', 'vps'), bronWoord('task')]).toEqual(['Mac-onderhoud', 'job op de VPS', 'taak']);
    expect([duurTekst(250), duurTekst(4200), duurTekst(95000), duurTekst(null)]).toEqual(['250 ms', '4.2 s', '1 min 35 s', '']);
  });
});
