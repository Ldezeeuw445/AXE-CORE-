import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { settingsKaartKpis, dienstTelling, type SettingsKpiBronnen } from './settingsKaartKpis';

const NU = Date.parse('2026-11-27T15:00:00Z');

function leeg(): SettingsKpiBronnen {
  return {
    nu: NU,
    agents: { stand: 'fout', lijst: [], approvals: 0, rosterTotaal: 12 },
    seats: { stand: 'fout', lijst: [] },
    abonnementen: { stand: 'fout', lijst: [] },
    keys: { stand: 'fout', apps: [], werkt: 0, stuk: 0, totaal: 0 },
    usage: { stand: 'fout', seats: [], appsMet: 0, appsTotaal: 0, maandCredits: null },
    providers: { catalogus: 19, lokaal: 0, server: null, getestOk: 0, getestFout: 0, ollamaModellen: 0, ollamaOk: 0, ollamaFout: 0 },
    voice: { mic: 'prompt', herkenning: false, wake: false, clap: false },
    trust: { stand: 'fout', rijen: 0, autoAan: 0, categorieen: 9, autoRuns: 0, nativeTools: false, tools: 45 },
    routing: { beurten: 0, perTier: [0, 0, 0], standaardModel: null, capabilities: null, lopend: 0 },
    system: { stand: 'fout', services: [], repos: 0, reposMetToken: 0 },
  };
}

describe('settings card KPIs', () => {
  it('gives every one of the 9 cards 2–4 tiles', () => {
    const k = settingsKaartKpis(leeg());
    expect(Object.keys(k)).toEqual(['agents', 'accounts', 'keys', 'usage', 'providers', 'voice', 'trust', 'routing', 'system']);
    for (const tegels of Object.values(k)) {
      expect(tegels.length).toBeGreaterThanOrEqual(2);
      expect(tegels.length).toBeLessThanOrEqual(4);
    }
  });

  it('says "Not connected" instead of inventing numbers when a source fails', () => {
    const k = settingsKaartKpis(leeg());
    expect(k.agents[0]).toMatchObject({ waarde: '—', regel: 'Not connected' });
    expect(k.keys[0]).toMatchObject({ waarde: '—', regel: 'Not connected' });
    expect(k.system[0]).toMatchObject({ waarde: '—', regel: 'Not connected' });
    expect(k.usage.find((t) => t.label === 'Credits · month')).toMatchObject({ waarde: '—', regel: 'not measured yet' });
    expect(k.routing.find((t) => t.label === 'Capabilities')).toMatchObject({ waarde: '—' });
  });

  it('shows a loading tile, not "Not connected", while a source is still loading', () => {
    const b = leeg();
    b.keys.stand = 'laden';
    expect(settingsKaartKpis(b).keys[0]).toMatchObject({ waarde: '…', regel: 'Loading' });
  });

  it('counts agents online, busy and waiting from the server stand', () => {
    const b = leeg();
    b.agents = {
      stand: 'ok', approvals: 2, rosterTotaal: 12,
      lijst: [
        { status: 'WORKING', last_event_at: '2026-11-27T14:58:00Z' },
        { status: 'SLEEPING', last_event_at: '2026-11-27T12:00:00Z' },
        { status: 'VERIFYING', last_event_at: null },
        { status: 'MONITORING' },
      ],
    };
    const [online, bezig, nodig, laatste] = settingsKaartKpis(b).agents;
    expect(online.waarde).toBe('3/4');
    expect(bezig.waarde).toBe('2');
    expect(nodig).toMatchObject({ waarde: '2', toon: 'let-op' });
    expect(laatste.waarde).toBe('2m ago');
  });

  it('keys: apps complete, missing and broken are counts only', () => {
    const b = leeg();
    b.keys = { stand: 'ok', werkt: 5, stuk: 1, totaal: 7, apps: [
      { app: 'AXE Core', counts: { works: 4 } },
      { app: 'Trading OS', counts: { works: 1, missing: 2 } },
      { app: 'AXON', counts: { broken: 1 } },
    ] };
    const k = settingsKaartKpis(b).keys;
    expect(k.map((t) => t.waarde)).toEqual(['1/3', '5/7', '2', '1']);
    expect(k[3].toon).toBe('fout');
  });

  it('usage: sessions today with per-seat bars and the busiest seat', () => {
    const b = leeg();
    b.usage = { stand: 'ok', appsMet: 2, appsTotaal: 4, maandCredits: 3.456, seats: [
      { label: 'Claude', sessions_today: 2 }, { label: 'Cursor', sessions_today: 8 },
    ] };
    const [sessies, top, budget, credits] = settingsKaartKpis(b).usage;
    expect(sessies).toMatchObject({ waarde: '10', balken: [0.25, 1] });
    expect(top.waarde).toBe('Cursor');
    expect(budget.waarde).toBe('2/4');
    expect(credits.waarde).toBe('3.46');
  });

  it('providers: keys out of the catalogue, never a key value', () => {
    const b = leeg();
    b.providers = { ...b.providers, lokaal: 3, server: 6, getestOk: 4, getestFout: 1, ollamaModellen: 10 };
    const k = settingsKaartKpis(b).providers;
    expect(k[0].waarde).toBe('6/19');
    expect(k[1]).toMatchObject({ waarde: '4/5', toon: 'let-op' });
    expect(JSON.stringify(k)).not.toMatch(/sk-|ghp_|AIza/);
  });

  it('trust: level from the auto-run switches', () => {
    const b = leeg();
    b.trust = { ...b.trust, stand: 'ok', rijen: 9, autoAan: 2, autoRuns: 7 };
    const [niveau, runs] = settingsKaartKpis(b).trust;
    expect(niveau).toMatchObject({ waarde: 'Partial', regel: '2/9 auto-run' });
    expect(runs.waarde).toBe('7');
  });

  it('system: services up/down and the terminal row', () => {
    const b = leeg();
    b.system = { stand: 'ok', repos: 5, reposMetToken: 1, services: [
      { service: 'supabase', status: 'online' }, { service: 'terminal', status: 'online' },
      { service: 'livekit', status: 'offline' }, { service: 'n8n', status: 'unknown' },
    ] };
    const [up, terminal, repos] = settingsKaartKpis(b).system;
    expect(up).toMatchObject({ waarde: '2/4', regel: '1 down', toon: 'fout' });
    expect(terminal.waarde).toBe('Online');
    expect(repos).toMatchObject({ waarde: '5', regel: '1 with token' });
    expect(dienstTelling(b.system.services)).toEqual({ op: 2, traag: 0, neer: 1, overig: 1, totaal: 4 });
  });
});

describe('settings dashboard wiring (t80u / t81u)', () => {
  const pagina = readFileSync(resolve(__dirname, '../../presentation/pages/SettingsPage.tsx'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../../presentation/components/settings/settingsDashboard.css'), 'utf8');

  it('every section card renders its KPIs and still opens its window', () => {
    expect(pagina).toContain('<SettingsKaartKpis kpis={kpis[item.id');
    expect(pagina).toContain('onKlik={() => kiesSectie(item.id)}');
  });

  it('System is one dashboard, not three scrolling columns', () => {
    expect(pagina).toContain('<SystemSectie');
    expect(pagina).not.toMatch(/<ServiceHealthSection \/>|<RemoteTerminalSection \/>/);
  });

  it('the wide section window has no black backdrop slab', () => {
    expect(css).toMatch(/\.axe-dash-venster\.axe-dash-venster--breed \{[^}]*background: transparent/);
  });

  it('cards inside a section window never scroll on their own', () => {
    expect(css).toMatch(/\.axe-settings-v3-panel \.widget-card[^{]*\{[^}]*overflow: visible/);
  });
});
