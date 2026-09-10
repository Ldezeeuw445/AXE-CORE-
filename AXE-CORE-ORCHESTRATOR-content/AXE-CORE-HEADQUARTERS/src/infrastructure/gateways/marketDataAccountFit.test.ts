import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Een symbool wordt geprijsd door een account dat het VOERT, of door niemand.
 *
 * Dit is geen netheid maar de oorzaak van een storing die vijf keer verkeerd
 * gelezen is. Er was één MetaAPI-config voor elk symbool -- het standaardaccount
 * -- en de scanlijst staat vol indices en crypto die een MT5-demo niet voert.
 * Elke ronde gaf dat NotFoundErrors, MetaAPI telt die en knijpt de hele
 * subscriptie af, en dáárna faalde ook XAUUSD (dat alle accounts wél voeren) met
 * "No broker price (got synthetic)".
 *
 * De tests kijken naar de enige vraag die telt: is de kandelaanvraag VERTROKKEN,
 * en zo ja NAAR WELK ACCOUNT. Een test op het eindresultaat zou slagen zolang er
 * maar géén brokerprijs uitkomt -- en dat is precies wat er ook zonder de
 * controle gebeurt.
 */

const candles = vi.fn();
const supports = vi.fn();
const accounts = vi.fn();

const STANDAARD = { token: 'tok-mt5', accountId: 'mt5-100k', region: 'london', enabled: true };
const OANDA = { token: 'tok-oanda', accountId: 'oanda-50k', region: 'london', enabled: true };

vi.mock('@/infrastructure/gateways/metaApiService', () => ({
  getMetaApiConfig: () => Promise.resolve(STANDAARD),
  accountSupportsSymbol: (cfg: { accountId: string }, sym: string) => supports(cfg.accountId, sym),
  toMt5Symbol: (s: string) => s,
}));

vi.mock('@/infrastructure/persistence/tradingAccountsService', () => ({
  tradeableAccounts: () => accounts(),
}));

vi.mock('@/infrastructure/gateways/metaApiMarketData', () => ({
  metaApiGetHistoricalCandles: (...a: unknown[]) => candles(...a),
}));

const { fetchMarketSnapshot, __resetPrijsRekeningCache } =
  await import('@/infrastructure/gateways/marketDataService');

const echteKandels = {
  ok: true,
  candles: Array.from({ length: 10 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 8, 9, i)).toISOString(),
    open: 4300 + i, high: 4310 + i, low: 4290 + i, close: 4305 + i, volume: 1,
  })),
};

beforeEach(() => {
  candles.mockReset();
  supports.mockReset();
  accounts.mockReset();
  accounts.mockResolvedValue([STANDAARD, OANDA]);
  __resetPrijsRekeningCache();
  // De terugvallen (Binance, Stooq) mogen het net niet op; ze eindigen dan in
  // de synthetische reeks, en dat is precies het pad dat we willen zien.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('geen net in een test'))));
});

describe('bij welk account een prijs wordt opgehaald', () => {
  it('gebruikt het standaardaccount als dat het symbool voert', async () => {
    supports.mockImplementation((id: string) => Promise.resolve(id === 'mt5-100k'));
    candles.mockResolvedValue(echteKandels);

    const snap = await fetchMarketSnapshot('XAUUSD', 'h1');

    expect(snap.source).toBe('metaapi');
    expect(candles).toHaveBeenCalledTimes(1);
    expect(candles.mock.calls[0][0].account.accountId).toBe('mt5-100k');
  });

  it('wijkt uit naar het account dat het symbool wél voert', async () => {
    // NAS100 staat alleen bij OANDA. Vroeger ging deze vraag naar het
    // MT5-account: een NotFoundError, en genoeg daarvan sloopte de subscriptie.
    supports.mockImplementation((id: string) => Promise.resolve(id === 'oanda-50k'));
    candles.mockResolvedValue(echteKandels);

    const snap = await fetchMarketSnapshot('NAS100', 'h1');

    expect(candles).toHaveBeenCalledTimes(1);
    expect(candles.mock.calls[0][0].account.accountId).toBe('oanda-50k');
    expect(candles.mock.calls[0][0].account.token).toBe('tok-oanda');
    expect(snap.source).toBe('metaapi');
  });

  it('vraagt NIEMAND als geen enkel account het voert', async () => {
    supports.mockResolvedValue(false);

    const snap = await fetchMarketSnapshot('BTCUSD', 'h1');

    expect(candles).not.toHaveBeenCalled();
    // Geen brokerprijs, dus de beslisbewaker weigert straks terecht --
    // zichtbaar, in plaats van de subscriptie meeslepen.
    expect(snap.source).not.toBe('metaapi');
  });

  it('vraagt tóch bij het standaardaccount als de catalogus onleesbaar is', async () => {
    // Niet kunnen kijken is geen reden om te stoppen met handelen -- dezelfde
    // regel als in accountSupportsSymbol zelf, waar een lege lijst "wel" is.
    supports.mockRejectedValue(new Error('catalogus onbereikbaar'));
    candles.mockResolvedValue({ ok: false, error: 'whatever' });

    await fetchMarketSnapshot('XAUUSD', 'h1');

    expect(candles).toHaveBeenCalledTimes(1);
    expect(candles.mock.calls[0][0].account.accountId).toBe('mt5-100k');
  });

  it('onthoudt de keuze, zodat de catalogus niet per aanvraag gelopen wordt', async () => {
    supports.mockImplementation((id: string) => Promise.resolve(id === 'oanda-50k'));
    candles.mockResolvedValue(echteKandels);

    await fetchMarketSnapshot('NAS100', 'h1');
    const naEerste = supports.mock.calls.length;
    await fetchMarketSnapshot('NAS100', 'h1');

    expect(supports.mock.calls.length).toBe(naEerste);
    expect(candles).toHaveBeenCalledTimes(2);
  });
});
