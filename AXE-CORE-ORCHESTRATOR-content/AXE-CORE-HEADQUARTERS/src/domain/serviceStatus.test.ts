import { describe, it, expect } from 'vitest';
import { statusVan, verdeel, NIET_INGESTELD } from './serviceStatus';

describe('statusVan', () => {
  it('noemt een dienst zonder adres of sleutel niet offline', () => {
    // Dit was de bug: n8n, xai, groq en smartthings stonden permanent rood
    // terwijl ze simpelweg nooit ingesteld waren.
    expect(statusVan({ ok: false, nietIngesteld: true })).toBe('unknown');
    expect(statusVan({ ok: false, nietIngesteld: true })).not.toBe('offline');
  });

  it('houdt een echte storing wél offline', () => {
    expect(statusVan({ ok: false })).toBe('offline');
  });

  it('een werkende dienst is online', () => {
    expect(statusVan({ ok: true })).toBe('online');
  });

  it('niet-ingesteld weegt zwaarder dan ok, want er is niets gemeten', () => {
    expect(statusVan({ ok: true, nietIngesteld: true })).toBe('unknown');
  });

  it('NIET_INGESTELD levert precies die stand op', () => {
    expect(statusVan(NIET_INGESTELD)).toBe('unknown');
    expect(NIET_INGESTELD.latency).toBe(0);
  });
});

describe('verdeel', () => {
  const diensten = [
    { naam: 'supabase', status: 'online' as const },
    { naam: 'api', status: 'offline' as const },
    { naam: 'trager', status: 'degraded' as const },
    { naam: 'n8n', status: 'unknown' as const },
    { naam: 'xai', status: 'unknown' as const },
  ];

  it('houdt niet-aangesloten diensten buiten de stukke', () => {
    const { stuk, nietAangesloten } = verdeel(diensten);
    expect(stuk.map((d) => d.naam)).toEqual(['api', 'trager']);
    expect(nietAangesloten.map((d) => d.naam)).toEqual(['n8n', 'xai']);
  });

  it('rekent een trage dienst tot de stukke, want die vraagt aandacht', () => {
    expect(verdeel(diensten).stuk).toHaveLength(2);
  });

  it('laat geen dienst vallen', () => {
    const { draaien, stuk, nietAangesloten } = verdeel(diensten);
    expect(draaien.length + stuk.length + nietAangesloten.length).toBe(diensten.length);
  });
});
