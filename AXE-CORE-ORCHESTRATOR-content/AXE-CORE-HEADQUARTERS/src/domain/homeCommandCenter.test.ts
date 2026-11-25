import { describe, expect, it } from 'vitest';
import { feedRegels, geledenTekst, kiesMachines, llmTelling, providerTegels, ringToon, ringWaarde, vandaagVanafNu } from './homeCommandCenter';

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
    expect(llmTelling({ a: { configured: true, reachable: true }, b: { configured: true, reachable: false } })).toEqual({ verbonden: 1, ingesteld: 2 });
    expect(llmTelling(undefined)).toBeNull();
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
      { id: 'vps', name: 'VPS', online: true, cpu: 1, mem: 1, disk: 1 },
      { id: 'mac-mini', name: 'Mac mini', online: true, cpu: 1, mem: 1, disk: 1 },
    ]);
    expect(m.map((x) => x.name)).toEqual(['Mac mini', 'VPS']);
    expect(kiesMachines(null)).toEqual([]);
  });

  it('tijdlijn: alleen vandaag vanaf nu, op volgorde', () => {
    const items = [
      { id: 'a', datum: '2026-11-25', tijd: '18:00', titel: 'Cron · Brief', soort: 'job', kleur: '#fff' },
      { id: 'b', datum: '2026-11-25', tijd: '09:00', titel: 'Cron · Early', soort: 'job', kleur: '#fff' },
      { id: 'c', datum: '2026-11-26', tijd: '10:00', titel: 'Tomorrow', soort: 'job', kleur: '#fff' },
      { id: 'd', datum: '2026-11-25', tijd: '13:30', titel: 'Call', soort: 'event', kleur: '#fff' },
    ];
    expect(vandaagVanafNu(items, '2026-11-25', '12:00').map((i) => i.titel)).toEqual(['Call', 'Brief']);
  });
});
