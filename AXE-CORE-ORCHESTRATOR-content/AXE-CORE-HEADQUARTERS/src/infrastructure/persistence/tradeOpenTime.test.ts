import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Een ingelezen trade houdt zijn ECHTE openingstijd.
 *
 * Gemeten 9 september op `core_trading_trades`: alle 43 rijen met
 * `exit_reason = 'broker_close'` hadden `opened_at = closed_at`. Bij de broker
 * staat er wél een openingstijd -- een trade liep van 06:27 tot 13:25 en stond
 * in het journaal als een trade van nul seconden.
 *
 * Dat is de vervelendste soort fout: het veld is gevuld, dus er is niets aan te
 * zien, en elke berekening over hoe lang een positie openstond klopt niet.
 */

const insert = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({
  getSupabase: () => ({ from: () => ({ insert }) }),
}));

const { recordTradeClosed } = await import('@/infrastructure/persistence/tradingTradesService');

beforeEach(() => insert.mockClear());

const basis = {
  localTradeId: null,
  accountId: 'mt5-100k',
  accountLabel: 'MT5 100K DEMO',
  venue: 'metaapi',
  symbol: 'XAUUSD',
  side: 'buy' as const,
  pnl: 11.1,
  exitReason: 'broker_close',
  closedAt: '2026-09-08T13:25:02.498Z',
};

describe('een trade zonder open rij in het journaal', () => {
  it('bewaart de openingstijd van de broker', async () => {
    await recordTradeClosed({ ...basis, openedAt: '2026-09-08T06:27:19.196Z' });

    const rij = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(rij.opened_at).toBe('2026-09-08T06:27:19.196Z');
    expect(rij.closed_at).toBe('2026-09-08T13:25:02.498Z');
    // En dus een echte looptijd, geen nul.
    expect(Date.parse(rij.closed_at as string) - Date.parse(rij.opened_at as string))
      .toBeGreaterThan(0);
  });

  it('valt alleen terug op de sluittijd als de openingstijd ontbreekt', async () => {
    // Een trade die buiten AXE om is geplaatst kan hem missen; dan is een
    // gelijke tijd beter dan een lege kolom, maar het blijft een terugval.
    await recordTradeClosed(basis);

    const rij = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(rij.opened_at).toBe(basis.closedAt);
  });
});
