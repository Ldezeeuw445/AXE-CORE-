import { describe, expect, it } from 'vitest';
import { appSleutel, appsGezondheid, eenRegel, fixAlsNodig, runsNaarUren, uurReeks } from '@/domain/homeAppsHealth';

const NU = Date.parse('2026-11-25T20:00:00Z');
const uurTerug = (h: number) => new Date(NU - h * 3600_000).toISOString();

describe('appsGezondheid', () => {
  it('geeft AXE Core en de vier apps, in vaste volgorde', () => {
    const a = appsGezondheid({ runs: [], schemas: [], diensten: [], sessies: [], nu: NU });
    expect(a.map((x) => x.naam)).toEqual(['AXE Core', 'AXE Companion', 'Trading OS', 'AXON Memory', 'NorthSea Desk']);
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
    const ns = appsGezondheid({ runs: runsNaarUren(runs), schemas: [], diensten: [], sessies: [], nu: NU }).find((x) => x.id === 'northsea')!;
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

describe('servertelling per uur (v5)', () => {
  const uur = (h: number) => new Date(Math.floor(NU / 3600_000) * 3600_000 - h * 3600_000).toISOString();

  it('uurReeks zet de servertellers in 24 vakken, het lopende uur achteraan', () => {
    const rijen = [
      { app: 'axe_core', uur: uur(0), ok: 199, fout: 0 },
      { app: 'axe_core', uur: uur(1), ok: 446, fout: 1 },
      { app: 'northsea', uur: uur(1), ok: 6, fout: 0 },
      { app: 'axe_core', uur: uur(30), ok: 999, fout: 9 },
    ];
    const kern = uurReeks(rijen, NU, 'axe_core')!;
    expect(kern.ok).toHaveLength(24);
    expect(kern.ok[23]).toBe(199);
    expect(kern.ok[22]).toBe(446);
    expect(kern.fout[22]).toBe(1);
    // Buiten het venster telt niet mee; zonder app = alles samen.
    expect(kern.ok.reduce((a, b) => a + b, 0)).toBe(645);
    expect(uurReeks(rijen, NU)!.ok[22]).toBe(452);
    expect(uurReeks(null, NU)).toBeNull();
  });

  it('telt meer dan 1.000 runs zonder ze als rijen op te halen', () => {
    const rijen = Array.from({ length: 24 }, (_, h) => ({ app: 'axe_core', uur: uur(h), ok: 170, fout: h === 2 ? 1 : 0 }));
    const kern = appsGezondheid({ runs: rijen, schemas: [], diensten: [], sessies: [], nu: NU }).find((x) => x.id === 'axe_core')!;
    expect(kern.kpi).toBe('4,081');
    expect(kern.kpiSub).toBe('runs · 1 failed');
  });

  it('runsNaarUren telt ruwe rijen (terugval) per app en uur', () => {
    const u = runsNaarUren([
      { app: 'northsea', status: 'ok', created_at: uurTerug(0.1) },
      { app: 'northsea', status: 'timeout', created_at: uurTerug(0.2) },
      { app: null, status: 'ok', created_at: uurTerug(0.2) },
    ]);
    expect(u.find((r) => r.app === 'northsea')).toMatchObject({ ok: 1, fout: 1 });
    expect(u.find((r) => r.app === 'axe_core')).toMatchObject({ ok: 1, fout: 0 });
  });
});

describe('AXE Core: mislukte schema\'s duidelijk in Apps health (v5)', () => {
  it('toont Review Desk ×15 en Planner ×4, met een Fix naar Cron Manager', () => {
    const kern = appsGezondheid({
      runs: [{ app: 'axe_core', uur: new Date(NU - 600_000).toISOString(), ok: 200, fout: 0 }],
      diensten: [{ id: 'w', name: 'Workers', ok: true }], sessies: [], nu: NU,
      schemas: [
        { id: 'p', name: 'Planner: agents plannen hun werk', app: 'axe_core', enabled: true, last_status: 'fail', last_run_at: uurTerug(1), consecutive_failures: 4 },
        { id: 'r', name: 'Review Desk: bronnen lezen (Gmail, Sites, Stripe, Metricool)', app: 'axe_core', enabled: true, last_status: 'fail', last_run_at: uurTerug(1), consecutive_failures: 15 },
        { id: 'o', name: 'Ok-job', app: 'axe_core', enabled: true, last_status: 'ok', last_run_at: uurTerug(1), consecutive_failures: 0 },
        { id: 'x', name: 'Uit: oud', app: 'axe_core', enabled: false, last_status: 'fail', last_run_at: uurTerug(1), consecutive_failures: 9 },
      ],
    }).find((x) => x.id === 'axe_core')!;
    expect(kern.stand).toBe('Failing');
    expect(kern.toon).toBe('fout');
    expect(kern.kapot).toEqual([{ id: 'r', naam: 'Review Desk', keer: 15 }, { id: 'p', naam: 'Planner', keer: 4 }]);
    expect(kern.kpiSub).toBe('Review Desk ×15, Planner ×4 failing');
    expect(kern.fix).toEqual({ soort: 'open', route: '/cron-manager?open=r', uitleg: 'Review Desk ×15, Planner ×4 failing. Open Review Desk in Cron Manager.' });
  });
});

describe('Trading OS heet trading_os (CHECK op core_schedules), met aliassen', () => {
  it('appSleutel maakt van elke spelling één sleutel', () => {
    for (const a of ['trading_os', 'trading-os', 'tradingos', 'Trading OS', 'TRADING_OS', 'trading']) expect(appSleutel(a)).toBe('trading_os');
    expect(appSleutel('axe-core')).toBe('axe_core');
    expect(appSleutel(null)).toBe('axe_core');
    expect(appSleutel('iets_anders')).toBe('iets_anders');
  });
  it('runs en schema\'s onder elke spelling landen in de Trading OS-rij', () => {
    const nu = Date.parse('2026-11-25T22:00:00Z');
    const tos = appsGezondheid({
      runs: [
        { app: 'trading_os', uur: new Date(nu - 600_000).toISOString(), ok: 12, fout: 0 },
        { app: 'trading-os', uur: new Date(nu - 4000_000).toISOString(), ok: 10, fout: 1 },
        { app: 'tradingos', uur: new Date(nu - 8000_000).toISOString(), ok: 2, fout: 0 },
      ],
      schemas: [
        { id: 's1', name: 'TOS collector', app: 'trading_os', enabled: true, last_status: 'ok', last_run_at: new Date(nu - 120_000).toISOString(), consecutive_failures: 0 },
        { id: 's2', name: 'TOS brief', app: 'trading-os', enabled: true, last_status: 'fail', last_run_at: new Date(nu - 300_000).toISOString(), consecutive_failures: 2 },
      ],
      diensten: [], sessies: [], nu,
    }).find((x) => x.id === 'trading_os')!;
    expect(tos.kpi).toBe('25');
    expect(tos.kapot).toEqual([{ id: 's2', naam: 'TOS brief', keer: 2 }]);
    expect(tos.laatst).toBeGreaterThanOrEqual(nu - 120_000);
  });
  it('runsNaarUren voegt aliassen samen', () => {
    const r = runsNaarUren([
      { app: 'trading-os', status: 'ok', created_at: '2026-11-25T21:10:00Z' },
      { app: 'trading_os', status: 'ok', created_at: '2026-11-25T21:20:00Z' },
    ]);
    expect(r).toEqual([{ app: 'trading_os', uur: '2026-11-25T21:00:00.000Z', ok: 2, fout: 0 }]);
  });
});
