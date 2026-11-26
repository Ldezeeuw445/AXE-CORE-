import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/persistence/incomeLedgerService', () => ({
  listIncomeEntries: vi.fn(async () => []),
  summarizeIncome: vi.fn(),
  INCOME_SOURCES: [],
}));

import { detectSymbol, resolveChart } from './chartResolver';

describe('26 nov: een grafiek alleen als hij klopt', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('geen BTC als standaard meer', () => {
    expect(detectSymbol('laat trading zien')).toBeNull();
    expect(detectSymbol('maak een chart van mijn week')).toBeNull();
    expect(detectSymbol('hoe staat bitcoin')).toBe('BTCUSDT');
    expect(detectSymbol('ETH koers')).toBe('ETHUSDT');
  });

  it('zonder symbool en zonder grootboek: niets neerzetten', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await resolveChart('laat de trading tab zien')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('met symbool: echte reeks van Binance, anders ook niets', async () => {
    const rij = (t: number, c: number) => [t, '0', '0', '0', String(c)];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [rij(0, 100), rij(3600000, 110)] })));
    const p = await resolveChart('hoe staat solana');
    expect(p?.title).toBe('SOL/USDT');
    expect((p?.data as { source: string }).source).toBe('binance');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await resolveChart('hoe staat solana')).toBeNull();
  });
});
