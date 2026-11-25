import { describe, expect, it } from 'vitest';
import { appsGezondheid, eenRegel, fixAlsNodig } from '@/domain/homeAppsHealth';

const NU = Date.parse('2026-11-25T20:00:00Z');
const uurTerug = (h: number) => new Date(NU - h * 3600_000).toISOString();

describe('appsGezondheid', () => {
  it('geeft de vier apps, in vaste volgorde', () => {
    const a = appsGezondheid({ runs: [], schemas: [], diensten: [], sessies: [], nu: NU });
    expect(a.map((x) => x.naam)).toEqual(['AXE Companion', 'Trading OS', 'AXON Memory', 'NorthSea Desk']);
    // Niets gemeten = eerlijk "No checks", geen groen.
    expect(a.every((x) => x.toon === 'stil' && x.stand === 'No checks' && x.fix === null)).toBe(true);
  });

  it('telt runs en fouten per uur en geeft bij fouten een Fix die de ledger opent', () => {
    const runs = [
      { app: 'northsea', status: 'ok', created_at: uurTerug(1) },
      { app: 'northsea', status: 'ok', created_at: uurTerug(2) },
      { app: 'northsea', status: 'fail', created_at: uurTerug(3) },
      { app: 'axe_core', status: 'fail', created_at: uurTerug(1) },
    ];
    const ns = appsGezondheid({ runs, schemas: [], diensten: [], sessies: [], nu: NU }).find((x) => x.id === 'northsea')!;
    expect(ns.kpi).toBe('3');
    expect(ns.runs?.reduce((s, n) => s + n, 0)).toBe(2);
    expect(ns.fouten?.reduce((s, n) => s + n, 0)).toBe(1);
    expect(ns.toon).toBe('let-op');
    expect(ns.fix).toMatchObject({ soort: 'open', route: '/ledger' });
  });

  it('een dienst die down is wint, en de Fix herstart niets maar opent Apps', () => {
    const ns = appsGezondheid({
      runs: [], schemas: [], diensten: [{ id: 'ns', name: 'NorthSea', ok: false }], sessies: [], nu: NU,
    }).find((x) => x.id === 'northsea')!;
    expect(ns.stand).toBe('Down');
    expect(ns.fix).toMatchObject({ soort: 'open', route: '/apps' });
  });

  it('een mislukt schema opent dat schema in Cron', () => {
    const ns = appsGezondheid({
      runs: [], diensten: [], sessies: [], nu: NU,
      schemas: [{ id: 's1', name: 'Mailbox sync', app: 'northsea', enabled: true, last_status: 'fail', last_run_at: uurTerug(1), consecutive_failures: 2 }],
    }).find((x) => x.id === 'northsea')!;
    expect(ns.stand).toBe('Failing');
    expect(ns.fix).toMatchObject({ soort: 'open', route: '/cron-manager?open=s1' });
  });

  it('AXON Memory toont het totaal en wat er in 24 uur bij kwam; sessies tellen voor de andere apps', () => {
    const a = appsGezondheid({
      runs: [], schemas: [], diensten: [], nu: NU,
      sessies: [{ id: 'trading-os', sessions_today: 12, sessions_min: 2, sessions_max: 4, stand: 'over' }],
      geheugenTotaal: 3068, geheugen24u: [uurTerug(1), uurTerug(5)],
    });
    const axon = a.find((x) => x.id === 'axon_memory')!;
    expect(axon.kpi).toBe('3,068');
    expect(axon.kpiSub).toBe('+2 24h');
    expect(axon.runs?.reduce((s, n) => s + n, 0)).toBe(2);
    expect(axon.stand).toBe('Healthy');
    const tos = a.find((x) => x.id === 'trading_os')!;
    expect(tos.kpi).toBe('12');
    expect(tos.toon).toBe('ok');
  });
});

describe('fixAlsNodig', () => {
  it('alleen bij let-op of fout', () => {
    const f = { soort: 'open' as const, route: '/x', uitleg: '' };
    expect(fixAlsNodig('ok', f)).toBeNull();
    expect(fixAlsNodig('uit', f)).toBeNull();
    expect(fixAlsNodig('let-op', f)).toBe(f);
    expect(fixAlsNodig('fout', f)).toBe(f);
  });
});

describe('eenRegel', () => {
  it('maakt van ruwe JSON één leesbare regel', () => {
    expect(eenRegel('DAX watch {"signal":"long","price":18234.5,"meta":{"x":1}}')).toBe('DAX watch · signal long · price 18234.5');
  });
  it('leest afgekapte JSON zo goed mogelijk', () => {
    expect(eenRegel('DAX watch {"status":"triggered","change_pct":1.25,"note":"abc')).toBe('DAX watch · status triggered · change pct 1.25');
  });
  it('laat gewone tekst staan en toont nooit accolades', () => {
    expect(eenRegel('Import positions: done')).toBe('Import positions: done');
    expect(eenRegel('{}')).toBe('Event (no readable details)');
    expect(eenRegel('Batch [1,2,3]')).toBe('Batch · items 3');
  });
});
