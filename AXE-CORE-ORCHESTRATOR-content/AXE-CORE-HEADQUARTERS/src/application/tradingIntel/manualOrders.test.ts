/**
 * Een handmatige order kan geen geklapte poort meer omzeilen.
 *
 * Echt: manualOrders → preTradeGateService → evaluatePreTradeGate →
 * brokerConnector (met de verificatie van de toelating), de circuit breaker, de
 * kill-switch-trip en het risicoprofiel. Vervangen: alleen de buitenste rand —
 * MetaAPI, de instellingenopslag, de accountlijst en de koers. Of er een order
 * naar de broker ging, lezen we af aan metaApiMarketOrder zelf.
 *
 * Er wordt niets echt verhandeld: metaApiMarketOrder is een vi.fn().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
});

const ACCOUNT = { token: 'tok', accountId: 'acct-A', region: 'london', enabled: true, updatedAt: '2026-09-01' };

const h = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  equity: 100_000,
  balance: 100_000,
  positions: [] as Array<Record<string, unknown>>,
  deals: [] as Array<Record<string, unknown>>,
  knownAccounts: ['acct-A'] as string[],
  active: null as null | Record<string, unknown>,
  releases: [] as Array<{ date: string; name: string }>,
}));

vi.mock('@/infrastructure/persistence/userSettingsService', () => ({
  loadSetting: vi.fn(async (k: string, fb: unknown) => (h.settings.has(k) ? h.settings.get(k) : fb)),
  saveSetting: vi.fn(async (k: string, v: unknown) => { h.settings.set(k, v); }),
}));

vi.mock('@/infrastructure/gateways/metaApiService', () => ({
  getMetaApiConfig: vi.fn(async () => h.active),
  metaApiGetAccount: vi.fn(),
  metaApiMarketOrder: vi.fn(async () => ({ ok: true, orderId: 'ord-1' })),
  metaApiPendingOrder: vi.fn(async () => ({ ok: true, orderId: 'pend-1' })),
  metaApiAccountInfoFor: vi.fn(async () => ({ ok: true, info: { equity: h.equity, balance: h.balance, currency: 'USD' } })),
  // Goud: 0,01 tick, $1 per tick per lot (100 oz) — zoals een MT5-broker het opgeeft.
  metaApiInstrumentSpecFor: vi.fn(async (_c: unknown, symbol: string) => ({
    ok: true,
    spec: { symbol, brokerSymbol: symbol, tickSize: 0.01, lossTickValue: 1, contractSize: 100, minVolume: 0.01, maxVolume: 50, volumeStep: 0.01 },
  })),
  metaApiPositionsFor: vi.fn(async () => ({ ok: true, positions: h.positions })),
  metaApiGetHistoryDealsFor: vi.fn(async () => ({ ok: true, deals: h.deals })),
  qtyToLots: vi.fn((_s: string, q: number) => q),
  toMt5Symbol: vi.fn((s: string) => s.toUpperCase()),
}));

vi.mock('@/infrastructure/gateways/marketDataService', () => ({
  fetchMarketSnapshot: vi.fn(async () => ({ last: 2400, bars: [] })),
}));

vi.mock('@/infrastructure/persistence/demoTradingService', () => ({
  executeDemoTrade: vi.fn(async () => ({ trade: { id: 'mirror-1' } })),
  getDemoAccount: vi.fn(async () => ({ cash: 0, positions: [], trades: [] })),
  markPositions: vi.fn(async () => ({})),
}));

vi.mock('@/infrastructure/gateways/researchSources', () => ({
  fetchEconomicReleases: vi.fn(async () => h.releases),
}));

vi.mock('@/infrastructure/persistence/tradingAccountsService', () => ({
  getAccounts: vi.fn(async () => ({
    accounts: h.knownAccounts.map(id => ({ id: `row-${id}`, label: id, token: 'tok', accountId: id, region: 'london', enabled: true, addedAt: '' })),
    activeId: null,
  })),
  accountLabel: vi.fn(async (id: string) => id),
}));

import { placeManualMarketOrder, placeManualPendingOrder } from './manualOrders';
import { brokerPlaceOrder, __resetPlacedToday } from '@/infrastructure/gateways/brokerConnector';
import { forceTripCircuitBreaker } from '@/infrastructure/persistence/tradingCircuitBreakerService';
import { saveRiskProfile } from '@/infrastructure/persistence/tradingRiskService';
import { DEFAULT_FUNDED_RISK } from '@/domain/tradingIntel/botTypes';
import * as meta from '@/infrastructure/gateways/metaApiService';
import * as demo from '@/infrastructure/persistence/demoTradingService';

const today = () => new Date().toISOString().slice(0, 10);
const opening = (i: number) => ({
  type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_IN', symbol: 'XAUUSD',
  time: `${today()}T00:00:${String(i).padStart(2, '0')}.000Z`,
});

function noOrderReachedTheBroker() {
  expect(meta.metaApiMarketOrder).not.toHaveBeenCalled();
  expect(meta.metaApiPendingOrder).not.toHaveBeenCalled();
  expect(demo.executeDemoTrade).not.toHaveBeenCalled();
}

beforeEach(async () => {
  vi.clearAllMocks();
  h.settings.clear();
  mem.clear();
  h.equity = 100_000;
  h.balance = 100_000;
  h.positions = [];
  h.deals = [];
  h.knownAccounts = ['acct-A'];
  h.active = { ...ACCOUNT };
  __resetPlacedToday();
  await saveRiskProfile({ ...DEFAULT_FUNDED_RISK, maxTradesPerDay: 8, allowShort: false, maxDrawdownPct: 0.1, updatedAt: '' }, 'acct-A');
});

describe('handmatige order door de poort', () => {
  it('gaat door als alles groen is — precies één order, op het juiste account, in lots', async () => {
    // 0,1 lot, stop 10 onder 2400: 1000 ticks × $1 × 0,1 = $100 risico.
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 0.1, stopLoss: 2390 });
    expect(res.ok).toBe(true);
    expect(meta.metaApiMarketOrder).toHaveBeenCalledTimes(1);
    expect(vi.mocked(meta.metaApiMarketOrder).mock.calls[0][0]).toMatchObject({
      account: { accountId: 'acct-A' }, side: 'buy', volume: 0.1, stopLoss: 2390,
    });
    const open = res.checks.find(c => c.id === 'openRisk');
    expect(open).toMatchObject({ status: 'PASS', detail: '100.00 USD of 1500.00 USD at risk' });
  });

  it('weigert een handmatige order zonder stop als het account open risico begrenst', async () => {
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 0.1 });
    expect(res).toMatchObject({ ok: false, stage: 'gate' });
    expect(res.ok === false && res.error).toMatch(/no stop-loss/);
    noOrderReachedTheBroker();
  });

  it('dagverlies: na het verlies van vandaag gaat er niets meer open', async () => {
    // Saldo 100k, vandaag -3100 gerealiseerd: dagstart 103 100, limiet 3% = 3093.
    h.balance = 100_000; h.equity = 100_000;
    h.deals = [{ type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', symbol: 'XAUUSD', time: `${today()}T00:00:01.000Z`, profit: -3100 }];
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 0.1, stopLoss: 2390 });
    expect(res).toMatchObject({ ok: false, stage: 'gate' });
    expect(res.ok === false && res.error).toMatch(/Daily loss 3100\.00 USD reached the 3% limit/);
    noOrderReachedTheBroker();
  });

  it('open risico: bestaande stops plus deze order boven de grens', async () => {
    // Open long 1 lot met stop 14 onder instap = $1400; plus $200 > $1500.
    h.positions = [{ symbol: 'XAUUSD', type: 'POSITION_TYPE_BUY', volume: 1, openPrice: 2400, stopLoss: 2386 }];
    const res = await placeManualMarketOrder({ symbol: 'EURUSD', side: 'buy', qty: 0.2, stopLoss: 2390 });
    expect(res.ok === false && res.error).toMatch(/Open risk 1400\.00 USD \+ 200\.00 USD exceeds 1\.5%/);
    noOrderReachedTheBroker();
  });

  it('statische drawdown: een echte doorbraak laat de breaker klappen', async () => {
    await saveRiskProfile({
      ...DEFAULT_FUNDED_RISK, maxTradesPerDay: 8, allowShort: false, maxDrawdownPct: 0.1,
      drawdownType: 'static', initialBalance: 100_000, updatedAt: '',
    }, 'acct-A');
    // Eerste klik legt een piek vast op 91k (trailing ziet dan niets), daarna 89,9k: onder de vloer van 90k.
    h.equity = 91_000; h.balance = 91_000;
    await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 0.01, stopLoss: 2390 });
    vi.clearAllMocks();
    h.equity = 89_900; h.balance = 89_900;
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 0.01, stopLoss: 2390 });
    expect(res.ok === false && res.error).toMatch(/static floor 90000\.00 USD/);
    noOrderReachedTheBroker();
    // En daarna blokkeert de breaker zelf, ook als de equity terugkomt.
    h.equity = 95_000; h.balance = 95_000;
    const again = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 0.01, stopLoss: 2390 });
    expect(again).toMatchObject({ ok: false, stage: 'gate' });
    expect(again.checks.find(c => c.id === 'breaker')?.status).toBe('BLOCK');
  });

  it('nieuws: geen opening op een dag met een high-impact release, als het profiel dat vraagt', async () => {
    await saveRiskProfile({
      ...DEFAULT_FUNDED_RISK, maxTradesPerDay: 8, allowShort: false, maxDrawdownPct: 0.1,
      newsRestriction: 'high_impact_day', updatedAt: '',
    }, 'acct-A');
    const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
    h.releases = [{ date: ny, name: 'Consumer Price Index' }];
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 0.01, stopLoss: 2390 });
    expect(res.ok === false && res.error).toMatch(/High-impact release today/);
    noOrderReachedTheBroker();
    h.releases = [];
  });

  it('weigert na de kill switch (geforceerde breaker) — en valt niet terug op MetaAPI of papier', async () => {
    await forceTripCircuitBreaker('Manual kill switch', 100_000, 'live', 'acct-A');
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1 });
    expect(res).toMatchObject({ ok: false, stage: 'gate', error: 'Manual kill switch' });
    noOrderReachedTheBroker();
  });

  it('laat de breaker klappen op een drawdown die pas bij de klik zichtbaar wordt', async () => {
    // Piek 100k vastgelegd, nu 85k: 15% > 10% limiet van dit account.
    await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1 });
    vi.clearAllMocks();
    h.equity = 85_000;
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1 });
    expect(res).toMatchObject({ ok: false, stage: 'gate' });
    expect(res.ok === false && res.error).toMatch(/drawdown 15\.0%/);
    noOrderReachedTheBroker();
  });

  it('weigert als het dagmaximum bij de broker bereikt is', async () => {
    h.deals = Array.from({ length: 8 }, (_, i) => opening(i));
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1 });
    expect(res).toMatchObject({ ok: false, stage: 'gate', error: 'Max trades/day (8) [funded_challenge]' });
    noOrderReachedTheBroker();
  });

  it('weigert als de broker-telling onleesbaar is', async () => {
    vi.mocked(meta.metaApiGetHistoryDealsFor).mockResolvedValueOnce({ ok: false, error: 'quota' } as never);
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1 });
    expect(res).toMatchObject({ ok: false, stage: 'gate' });
    noOrderReachedTheBroker();
  });

  it('weigert een short als shorts uit staan op dit account', async () => {
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'sell', qty: 1 });
    expect(res).toMatchObject({ ok: false, stage: 'gate', error: 'Shorts disabled on this account [funded_challenge]' });
    noOrderReachedTheBroker();
  });

  it('weigert een account dat niet in de accountlijst staat', async () => {
    h.knownAccounts = ['acct-B'];
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1 });
    expect(res).toMatchObject({ ok: false, stage: 'gate', error: 'Account not registered in Trading accounts' });
    noOrderReachedTheBroker();
  });

  it('weigert zonder broker — geen papieren vulling meer', async () => {
    h.active = null;
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1 });
    expect(res).toMatchObject({ ok: false, stage: 'gate' });
    noOrderReachedTheBroker();
  });

  it('een wachtende order gaat door dezelfde poort (sell_limit = short)', async () => {
    await forceTripCircuitBreaker('Manual kill switch', 100_000, 'live', 'acct-A');
    const res = await placeManualPendingOrder({ symbol: 'XAUUSD', type: 'buy_limit', qty: 1, openPrice: 2300 });
    expect(res).toMatchObject({ ok: false, stage: 'gate' });
    noOrderReachedTheBroker();
  });

  it('een wachtende sell_limit wordt als short beoordeeld', async () => {
    const res = await placeManualPendingOrder({ symbol: 'XAUUSD', type: 'sell_limit', qty: 1, openPrice: 2500 });
    expect(res).toMatchObject({ ok: false, stage: 'gate', error: expect.stringMatching(/Shorts disabled/) });
    noOrderReachedTheBroker();
  });
});

describe('de broker-grens zelf', () => {
  it('brokerPlaceOrder verstuurt niets zonder toelating, ook niet via een omzeild type', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await brokerPlaceOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1, reason: 'x', confidence: 1, clearance: undefined as any });
    expect(res).toMatchObject({ ok: false, venue: 'gate' });
    noOrderReachedTheBroker();
  });

  it('een toelating voor account A opent niets op account B', async () => {
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 0.1, stopLoss: 2390 });
    expect(res.ok).toBe(true);
    vi.clearAllMocks();
    // Dezelfde soort toelating, maar het actieve account is intussen gewisseld.
    const { evaluatePreTradeGate } = await import('@/domain/tradingIntel/preTradeGate');
    const clearance = evaluatePreTradeGate({
      origin: 'manual', symbol: 'XAUUSD', side: 'buy', accountId: 'acct-A', mode: 'x',
      account: { known: true, available: true }, breaker: { tripped: false },
      dayLimit: { tradesToday: 0, unverified: false, max: 8 }, allowShort: false, longPositionQty: 0,
    }).clearance!;
    h.active = { ...ACCOUNT, accountId: 'acct-B' };
    const moved = await brokerPlaceOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1, reason: 'x', confidence: 1, clearance });
    expect(moved).toMatchObject({ ok: false, venue: 'gate' });
    noOrderReachedTheBroker();
  });
});
