import { describe, expect, it } from 'vitest';
import {
  feedRegels, geledenTekst, kiesMachines, limietRegels, monitorRijen, llmTelling, perUur, pnlLijn, providerTegels, recenteToestellen, ringToon, ringWaarde,
  tijdlijnVandaag,
} from './homeCommandCenter';

describe('home command center', () => {
  it('providers: bereikbaar eerst, eerlijk leeg zonder meting', () => {
    expect(providerTegels(null)).toEqual([]);
    const t = providerTegels({
      ollama: { configured: false, reachable: false },
      openai: { configured: true, reachable: true },
      xai: { configured: true, reachable: false, detail: '401' },
    });
    expect(t.map((x) => [x.naam, x.toon])).toEqual([['OpenAI', 'ok'], ['xAI', 'let-op'], ['Ollama', 'uit']]);
    expect(t[1].regel).toBe('401');
    expect(llmTelling(t)).toEqual({ verbonden: 1, ingesteld: 2 });
    expect(llmTelling(undefined)).toBeNull();
  });

  it('providers: de volle lijst uit de sleutels, niet alleen wat de probe als eerste vond', () => {
    // Zo ziet 25 nov eruit: de probe stopt bij OpenAI, de sleutels kennen er meer.
    const t = providerTegels({ openai: { configured: true, reachable: true } }, [
      { provider: 'groq', status: 'present', usage: { last_status: 200 } },
      { provider: 'groq', status: 'present', usage: { last_status: 429 } },
      { provider: 'openrouter', status: 'present', usage: { last_status: 429 } },
      { provider: 'openrouter', status: 'unused', usage: null },
      { provider: 'cerebras', status: 'present', usage: { last_status: 402 } },
      { provider: 'google', status: 'present' },
      { provider: 'anthropic', status: 'unused' },
      { provider: 'ollama', status: 'optional' },
      { provider: 'elevenlabs', status: 'present', usage: { last_status: 200 } },
      { provider: 'exa', status: 'present' },
      { provider: null, status: 'present' },
    ]);
    expect(t.map((x) => [x.naam, x.toon, x.regel])).toEqual([
      ['Groq', 'ok', 'Answering'],
      ['OpenAI', 'ok', 'Connected'],
      ['Cerebras', 'let-op', 'Out of credit'],
      ['OpenRouter', 'let-op', 'Rate limited'],
      ['Gemini', 'stil', 'Key set · idle'],
      ['Anthropic', 'uit', 'Not used'],
      ['Ollama', 'uit', 'Not used'],
    ]);
    expect(llmTelling(t)).toEqual({ verbonden: 2, ingesteld: 5 });
  });

  it('feed: nieuwste eerst, dubbele weg, taken zonder tijd achteraan', () => {
    const r = feedRegels({
      fouten: [{ at: '2026-11-25T10:00:00Z', app: 'axe_core', name: 'Backup', status: 'failed', detail: 'exit=1', ref_id: 'x', source: 'schedule' }],
      meldingen: [
        { id: '1', type: 'info', title: 'PR #339 merged', detail: 'orchestrator', timestamp: Date.parse('2026-11-25T11:00:00Z'), read: false },
        { id: '2', type: 'info', title: 'PR #339 merged', detail: 'orchestrator', timestamp: Date.parse('2026-11-25T09:00:00Z'), read: true },
      ],
      recent: [{ id: 't', agent: 'Developer', titel: 'Fix lint', stand: 'completed' }],
    });
    expect(r.map((x) => x.titel)).toEqual(['PR #339 merged', 'Backup failed', 'Developer · done']);
  });

  it('feed: dezelfde job die steeds faalt is één regel met een teller', () => {
    const f = (at: string, detail: string) => ({ at, app: 'axe_core', name: 'files.list', status: 'failed', detail, ref_id: at, source: 'edge' });
    const r = feedRegels({ fouten: [f('2026-11-25T10:00:00Z', 'oud'), f('2026-11-25T12:00:00Z', 'nieuw'), f('2026-11-25T11:00:00Z', 'midden'),
      { ...f('2026-11-25T09:00:00Z', 'x'), name: 'Backup' }] });
    expect(r.map((x) => x.titel)).toEqual(['files.list failed ×3', 'Backup failed']);
    expect(r[0]).toMatchObject({ sub: 'nieuw', at: Date.parse('2026-11-25T12:00:00Z') });
    expect(r[1]).toMatchObject({ soort: 'fout', route: '/ledger' });
    expect(feedRegels({})).toEqual([]);
  });

  it('tijd, ringen en machines', () => {
    const nu = Date.parse('2026-11-25T12:00:00Z');
    expect([geledenTekst(null, nu), geledenTekst(nu - 10_000, nu), geledenTekst(nu - 300_000, nu), geledenTekst(nu - 7_200_000, nu)]).toEqual(['', 'now', '5m', '2h']);
    expect([ringWaarde(null), ringWaarde(42.6), ringWaarde(130)]).toEqual([null, 43, 100]);
    expect([ringToon(null), ringToon(20), ringToon(80), ringToon(95)]).toEqual(['uit', 'ok', 'let-op', 'fout']);
    const m = kiesMachines([
      { id: 'imac', name: 'iMac', online: true, cpu: 1, mem: 1, disk: 1 },
      { id: 'vps', name: 'VPS API', online: true, cpu: 1, mem: 1, disk: 1 },
      { id: 'mac-mini', name: 'Mac mini', online: true, cpu: 1, mem: 1, disk: 1 },
    ]);
    // 26 nov (Luka): alle machines, Macs eerst, dan de VPS'en.
    expect(m.map((x) => x.name)).toEqual(['Mac mini', 'iMac', 'VPS']);
    const alle = kiesMachines([
      { id: 'mt5bridge', name: 'VPS MT5 bridge', online: true, cpu: null, mem: null, disk: null },
      { id: 'modelbox', name: 'VPS Models', online: true, cpu: 1, mem: 1, disk: 1 },
      { id: 'vps', name: 'VPS API', online: true, cpu: 1, mem: 1, disk: 1 },
      { id: 'imac', name: 'iMac', online: true, cpu: 1, mem: 1, disk: 1 },
      { id: 'macmini', name: 'Mac mini', online: true, cpu: 1, mem: 1, disk: 1 },
    ]);
    expect(alle.map((x) => x.name)).toEqual(['Mac mini', 'iMac', 'VPS', 'VPS Models', 'VPS MT5']);
    expect([monitorRijen(1), monitorRijen(2), monitorRijen(5), monitorRijen(6)]).toEqual([1, 2, 3, 3]);
    expect(kiesMachines(null)).toEqual([]);
  });

  it('tijdlijn: herhalende crons één regel in het Engels, eenmalige op tijd', () => {
    const nu = new Date(2026, 10, 25, 12, 0);
    const op = (u: number, m = 0, dag = 25) => new Date(2026, 10, dag, u, m).toISOString();
    const jobs = [
      { key: 'a', at: op(18), naam: 'Brief', aantal: 1, herhaling: null, kleur: '#fff' },
      { key: 'b', at: op(9), naam: 'Early', aantal: 1, herhaling: null, kleur: '#fff' },
      { key: 'c', at: op(10, 0, 26), naam: 'Tomorrow', aantal: 1, herhaling: null, kleur: '#fff' },
      { key: 'd', at: op(13, 30), naam: 'Call', aantal: 1, herhaling: null, kleur: '#fff' },
      { key: 'e', at: op(12, 1), naam: 'Heartbeat', aantal: 719, herhaling: 'elke 1 min', kleur: '#fff' },
      { key: 'f', at: op(12, 10), naam: 'Sync', aantal: 72, herhaling: 'elke 10 min', kleur: '#fff' },
    ];
    const d = tijdlijnVandaag(jobs, nu);
    expect(d.eenmalig.map((i) => [i.tijd, i.titel])).toEqual([['13:30', 'Call'], ['18:00', 'Brief']]);
    expect(d.herhalend).toEqual({ jobs: 2, runs: 791, regel: '2 repeating jobs · every 1–10 min · 791 runs left' });
    expect(JSON.stringify(d)).not.toMatch(/elke/);
    expect(tijdlijnVandaag([], nu)).toEqual({ eenmalig: [], herhalend: null });
  });

  it('toestellen: alleen recent gezien, elke naam één keer, dit toestel altijd', () => {
    const nu = Date.parse('2026-11-25T12:00:00Z');
    const r = recenteToestellen([
      { device_id: '1', device_name: 'iPhone', last_seen: '2026-11-25T11:00:00Z', ditToestel: false },
      { device_id: '2', device_name: 'iPhone', last_seen: '2026-11-24T20:00:00Z', ditToestel: false },
      { device_id: '3', device_name: 'Old Android', last_seen: '2026-10-01T10:00:00Z', ditToestel: false },
      { device_id: '4', device_name: 'Mac mini', last_seen: null, ditToestel: true },
    ], nu);
    expect(r.map((x) => x.device_id)).toEqual(['1', '4']);
  });

  it('grafiekjes: per uur over 24 uur, het lopende uur achteraan', () => {
    const nu = Date.parse('2026-11-25T12:30:00Z');
    const r = perUur(['2026-11-25T12:10:00Z', '2026-11-25T12:20:00Z', '2026-11-25T11:59:00Z', '2026-11-24T13:05:00Z', '2026-11-24T12:00:00Z', null, 'onzin', '2026-11-25T13:00:00Z'], nu);
    expect(r).toHaveLength(24);
    expect(r[23]).toBe(2);
    expect(r[22]).toBe(1);
    expect(r[0]).toBe(1);
    expect(r.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('P&L-lijn: opgeteld op sluittijd, leeg zonder gesloten trades', () => {
    expect(pnlLijn([{ pnl: 5, closed_at: '2026-11-02T00:00:00Z' }, { pnl: -2, closed_at: '2026-11-01T00:00:00Z' }, { pnl: null, closed_at: null }])).toEqual([-2, 3]);
    expect(pnlLijn([])).toEqual([]);
  });

  it('AI-limieten: gemeten procent eerst, sessies voor de rest, uitgelogd samen', () => {
    const nu = Date.parse('2026-11-25T20:00:00Z');
    const r = limietRegels([
      { motor: 'claude', label: 'Claude · a@b', status: 'ok', sessie: { procent: 90, reset: '2026-11-25T20:10:00Z' }, week: { procent: 67, reset: null } },
      { motor: 'claude2', label: 'Claude Code 2 (not logged in)', status: 'not_logged_in' },
      { motor: 'codex', label: 'Codex · c@d', status: 'ok', sessie: { procent: 42, reset: null }, week: { procent: 6, reset: null } },
    ], [
      { id: 'claude2', label: 'Claude Pro 2', family: 'claude', sessions_today: 0, sessions_max: 3, rate_limited: false, logged_in: true, seen: true },
      { id: 'cursor', label: 'Cursor Pro', family: 'cursor', sessions_today: 2, sessions_max: 3, rate_limited: false, logged_in: true, seen: true },
      { id: 'xai2', label: 'Grok 2', family: 'grok', sessions_today: 0, sessions_max: 8, rate_limited: false, logged_in: null, seen: false },
      { id: 'ollama', label: 'Qwen', family: 'vps', sessions_today: 0, sessions_max: 24, rate_limited: false, logged_in: null, seen: true },
    ], nu);
    expect(r.map((x) => [x.naam, x.pct, x.toon])).toEqual([
      ['Claude', 90, 'let-op'], ['Cursor Pro', 67, 'ok'], ['Codex', 42, 'ok'], ['1 not logged in', null, 'uit'],
    ]);
    expect(r[0].regel).toBe('session 90% · week 67% · resets 10m');
    expect(r[1].regel).toBe('2/3 sessions today');
    expect(limietRegels([], [])).toEqual([]);
  });
});
