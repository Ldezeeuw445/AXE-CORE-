import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Vraag de broker niet naar wat hij niet voert.
 *
 * Dit is geen netheid maar de oorzaak van een storing die vijf keer verkeerd
 * gelezen is. Er is één MetaAPI-config voor elk symbool -- het standaardaccount
 * -- en de scanlijst staat vol indices en crypto die een MT5-demo niet voert.
 * Elke ronde geeft dat NotFoundErrors, MetaAPI telt die en knijpt de hele
 * subscriptie af, en dáárna faalt ook XAUUSD (dat alle accounts wél voeren) met
 * "No broker price (got synthetic)".
 *
 * De test kijkt daarom naar de enige vraag die telt: is de kandelaanvraag
 * VERTROKKEN. Een test op het eindresultaat zou slagen zolang er maar géén
 * brokerprijs uitkomt -- en dat is precies wat er ook zonder de controle
 * gebeurt.
 */

const candles = vi.fn();
const supports = vi.fn();

vi.mock('@/infrastructure/gateways/metaApiService', () => ({
  getMetaApiConfig: () => Promise.resolve({ token: 't', accountId: 'a', enabled: true }),
  accountSupportsSymbol: (...a: unknown[]) => supports(...a),
  toMt5Symbol: (s: string) => s,
}));

vi.mock('@/infrastructure/gateways/metaApiMarketData', () => ({
  metaApiGetHistoricalCandles: (...a: unknown[]) => candles(...a),
}));

const { fetchMarketSnapshot } = await import('@/infrastructure/gateways/marketDataService');

beforeEach(() => {
  candles.mockReset();
  supports.mockReset();
  // De terugvallen (Binance, Stooq) mogen het net niet op; ze eindigen dan in
  // de synthetische reeks, en dat is precies het pad dat we willen zien.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('geen net in een test'))));
});

describe('een prijsopvraag bij het standaardaccount', () => {
  it('vertrekt NIET voor een symbool dat dit account niet voert', async () => {
    supports.mockResolvedValue(false);
    const snap = await fetchMarketSnapshot('NAS100', 'h1');
    expect(candles).not.toHaveBeenCalled();
    // En de uitkomst is geen brokerprijs, dus de beslisbewaker weigert straks
    // terecht -- zichtbaar, in plaats van de subscriptie meeslepen.
    expect(snap.source).not.toBe('metaapi');
  });

  it('vertrekt WEL voor een symbool dat het account voert', async () => {
    supports.mockResolvedValue(true);
    candles.mockResolvedValue({
      ok: true,
      candles: Array.from({ length: 10 }, (_, i) => ({
        time: new Date(Date.UTC(2026, 8, 9, i)).toISOString(),
        open: 4300 + i, high: 4310 + i, low: 4290 + i, close: 4305 + i, volume: 1,
      })),
    });
    const snap = await fetchMarketSnapshot('XAUUSD', 'h1');
    expect(candles).toHaveBeenCalledTimes(1);
    expect(snap.source).toBe('metaapi');
  });

  it('vraagt tóch als de catalogus onleesbaar is', async () => {
    // Niet kunnen kijken is geen reden om te stoppen met handelen -- dezelfde
    // regel als in accountSupportsSymbol zelf, waar een lege lijst "wel" is.
    supports.mockRejectedValue(new Error('catalogus onbereikbaar'));
    candles.mockResolvedValue({ ok: false, error: 'whatever' });
    await fetchMarketSnapshot('XAUUSD', 'h1');
    expect(candles).toHaveBeenCalledTimes(1);
  });
});
