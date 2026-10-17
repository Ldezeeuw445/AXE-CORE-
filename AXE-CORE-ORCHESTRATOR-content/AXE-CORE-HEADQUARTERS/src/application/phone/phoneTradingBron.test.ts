import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPositions = vi.fn();
const snapshot = vi.fn();

vi.mock('@/infrastructure/gateways/metaApiService', () => ({
  metaApiGetPositions: () => getPositions(),
}));
vi.mock('@/infrastructure/gateways/marketDataService', () => ({
  fetchMarketSnapshot: (...a: unknown[]) => snapshot(...a),
}));

import { leesPhonePosities, leesPubliekeSpark, wisPhoneTradingBron } from './phoneTradingBron';

describe('phoneTradingBron', () => {
  beforeEach(() => {
    wisPhoneTradingBron();
    getPositions.mockReset();
    snapshot.mockReset();
  });

  it('deelt één positions-aanroep en toont geen ruwe 429-JSON', async () => {
    getPositions.mockResolvedValue({
      ok: false,
      error: 'positions 429: {"error":"MetaAPI quota was exceeded — backing off, and nothing cached for this call yet"}',
    });
    const [a, b] = await Promise.all([leesPhonePosities(), leesPhonePosities()]);
    expect(getPositions).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).toEqual({ soort: 'gepauzeerd', tekst: 'Positions paused.' });
    expect(JSON.stringify(a)).not.toMatch(/429|quota was exceeded/);
  });

  it('hergebruikt de cache zodat een tweede tab-render niet opnieuw pollt', async () => {
    getPositions.mockResolvedValue({ ok: true, positions: [] });
    await leesPhonePosities(1_000);
    await leesPhonePosities(1_000 + 60_000);
    expect(getPositions).toHaveBeenCalledTimes(1);
  });

  it('haalt publieke sparks zonder broker en weigert synthetic', async () => {
    snapshot.mockResolvedValue({ source: 'synthetic', bars: [{ c: 106 }] });
    expect(await leesPubliekeSpark('XAUUSD')).toEqual([]);
    expect(snapshot).toHaveBeenCalledWith('XAUUSD', 'h1', { priority: 'background', skipBroker: true });
  });
});
