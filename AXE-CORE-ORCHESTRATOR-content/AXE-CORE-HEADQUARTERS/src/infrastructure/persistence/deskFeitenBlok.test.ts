import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ getSupabase: () => null }));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ AXE_USER_ID: 'test-axe-core' }));

const { deskFeitenBlok } = await import('@/infrastructure/persistence/deskFeitenService');

const NU = Date.parse('2026-09-10T20:00:00Z');

describe('deskFeitenBlok', () => {
  it('zegt "niet gemeten" en niet "rustig" als er niets is', () => {
    // Een agent die stilte als gunstig leest, neemt de positie die hij bij een
    // gemeten hoge correlatie niet had genomen.
    const t = deskFeitenBlok([], NU);
    expect(t).toContain('niet gemeten');
    expect(t).toContain('onbekend, niet als gunstig');
  });

  it('zet de ouderdom erbij in minuten', () => {
    const t = deskFeitenBlok([{
      soort: 'correlatie', sleutel: 'H1',
      agentTekst: 'CORRELATIE (H1)', gemetenOp: new Date(NU - 20 * 60_000).toISOString(),
    }], NU);
    expect(t).toContain('20 min geleden');
  });

  it('schakelt over op uren zodra minuten onleesbaar worden', () => {
    const t = deskFeitenBlok([{
      soort: 'correlatie', sleutel: 'H1',
      agentTekst: 'CORRELATIE (H1)', gemetenOp: new Date(NU - 3 * 3_600_000).toISOString(),
    }], NU);
    expect(t).toContain('3 uur geleden');
    expect(t).not.toContain('180 min');
  });

  it('geeft de agenttekst onveranderd door', () => {
    // Opgeslagen zoals hij luidde bij het meten. Opnieuw opbouwen zou betekenen
    // dat een latere wijziging in de opmaak met terugwerkende kracht verandert
    // wat er toen tegen de agent is gezegd.
    const tekst = 'CORRELATIE (H1)\nLoopt samen: XAGUSD~XAUUSD 0.82';
    const t = deskFeitenBlok([{
      soort: 'correlatie', sleutel: 'H1', agentTekst: tekst,
      gemetenOp: new Date(NU - 60_000).toISOString(),
    }], NU);
    expect(t).toContain('XAGUSD~XAUUSD 0.82');
  });

  it('zet meerdere feiten onder elkaar', () => {
    const t = deskFeitenBlok([
      { soort: 'correlatie', sleutel: 'H1', agentTekst: 'EEN', gemetenOp: new Date(NU).toISOString() },
      { soort: 'gebeurtenis_impact', sleutel: 'NFP|XAUUSD|60', agentTekst: 'TWEE', gemetenOp: new Date(NU).toISOString() },
    ], NU);
    expect(t).toContain('EEN');
    expect(t).toContain('TWEE');
  });
});
