import { describe, expect, it } from 'vitest';
import { accountRegels, connectorRegels, mailStand, sleutelTelling } from '@/domain/homeStatusCards';

describe('connectorRegels', () => {
  const servers = [
    { id: 'a', naam: 'Supabase', klaar: true, sleutel: 'vault', categorie: 'infra' },
    { id: 'b', naam: 'Stripe', klaar: false, sleutel: 'ontbreekt', categorie: 'dev' },
    { id: 'c', naam: 'GitHub', klaar: true, sleutel: 'env', categorie: 'dev' },
  ];
  it('zegt zonder test "ready", nooit "works"', () => {
    const r = connectorRegels(servers);
    expect(r.werkt).toBe(0);
    expect(r.klaar).toBe(2);
    expect(r.regels.find((x) => x.id === 'a')).toMatchObject({ toon: 'stil', regel: 'ready · not tested' });
    expect(r.regels.find((x) => x.id === 'b')).toMatchObject({ toon: 'let-op', regel: 'key missing' });
  });
  it('een test maakt het waar; offline staat bovenaan', () => {
    const r = connectorRegels(servers, { a: { status: 'online', latency: 120.4 }, c: { status: 'offline', fout: 'timeout' } });
    expect(r.werkt).toBe(1);
    expect(r.regels[0]).toMatchObject({ id: 'c', toon: 'fout', regel: 'offline · timeout' });
    expect(r.regels.find((x) => x.id === 'a')?.regel).toBe('works · 120 ms');
  });
});

describe('accountRegels', () => {
  it('aan/uit, demo/live en de breaker per account', () => {
    const r = accountRegels([
      { id: '1', label: 'Live 50k', enabled: true, environment: 'live', serverOrProvider: 'ICMarkets-Live' },
      { id: '2', label: 'Demo', enabled: false, environment: 'demo' },
      { id: '3', label: 'Prop', enabled: true, run: 'run-2' },
    ], { 1: { tripped: false }, 3: { tripped: true, trippedReason: 'daily loss 3%' } });
    expect(r.aan).toBe(2);
    expect(r.gestopt).toBe(1);
    expect(r.regels[0]).toMatchObject({ toon: 'ok', regel: 'on · live · ICMarkets-Live · breaker armed' });
    expect(r.regels[1]).toMatchObject({ toon: 'uit', regel: 'off · demo' });
    expect(r.regels[2]).toMatchObject({ toon: 'fout', regel: 'breaker tripped · daily loss 3%' });
  });
});

describe('mailStand', () => {
  it('alleen wat er echt is; niets = uit', () => {
    expect(mailStand({ concepten: null, bounces: null, comms7d: null, wacht: null })).toEqual({ regels: [], toon: 'uit' });
    const m = mailStand({ concepten: 2, bounces: 0, comms7d: 31, wacht: 1 });
    expect(m.toon).toBe('let-op');
    expect(m.regels.map((r) => r.id)).toEqual(['concepten', 'wacht', 'bounces', 'comms']);
  });
});

describe('sleutelTelling', () => {
  it('telt over alle apps', () => {
    expect(sleutelTelling([{ counts: { works: 3, missing: 1 } }, { counts: { works: 2, present: 4, broken: 1 } }]))
      .toEqual({ werkt: 5, aanwezig: 4, ontbreekt: 1, kapot: 1 });
  });
});

describe('26 nov: accounts per app', () => {
  it('drie blokken, demo-testrijen als één regel, Trading OS eerlijk', async () => {
    const { accountGroepen } = await import('./homeStatusCards');
    const nu = Date.parse('2026-11-26T18:00:00Z');
    const g = accountGroepen({
      axeCore: [],
      companion: { accounts: [{ id: 'a', label: '100K 1STEP UPCOMERS', provider: 'mt5', verbonden: true, provider_status: 'connected', modus: 'live', laatste_sync: '2026-11-26T17:50:00Z' }], demo_testrijen: 28 },
      tradingOs: { bereikbaar: true, gedeeld_met_companion: true, mt5: [{ naam: 'Luka', server: 'Fundedelite-Server', bijgewerkt: '2026-04-21T08:18:25Z' }] },
      nu,
    });
    expect(g.map((x) => x.id)).toEqual(['axe_core', 'companion', 'trading_os']);
    expect(g[0].leeg).toContain('No accounts linked to AXE Algo');
    expect(g[1].regels[0]).toMatchObject({ naam: '100K 1STEP UPCOMERS', toon: 'ok' });
    expect(g[1].regels[0].regel).toContain('synced 10 min ago');
    expect(g[1].regels[1]).toMatchObject({ naam: '28 demo test rows', toon: 'stil' });
    expect(g[1].titel).toContain('Trading OS (shared broker hub)');
    expect(g[2].regels[0]).toMatchObject({ naam: 'Luka · MT5 snapshot', toon: 'let-op' });
    expect(g[2].regels[0].regel).toContain('Fundedelite-Server');
  });
});
