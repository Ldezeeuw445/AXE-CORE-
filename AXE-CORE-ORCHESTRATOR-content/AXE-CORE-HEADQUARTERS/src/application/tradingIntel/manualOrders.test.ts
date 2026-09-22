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
  positions: [] as Array<Record<string, unknown>>,
  deals: [] as Array<Record<string, unknown>>,
  knownAccounts: ['acct-A'] as string[],
  active: null as null | Record<string, unknown>,
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
  metaApiAccountInfoFor: vi.fn(async () => ({ ok: true, info: { equity: h.equity } })),
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
  h.positions = [];
  h.deals = [];
  h.knownAccounts = ['acct-A'];
  h.active = { ...ACCOUNT };
  __resetPlacedToday();
  await saveRiskProfile({ ...DEFAULT_FUNDED_RISK, maxTradesPerDay: 8, allowShort: false, maxDrawdownPct: 0.1, updatedAt: '' }, 'acct-A');
});

describe('handmatige order door de poort', () => {
  it('gaat door als alles groen is — precies één order, op het juiste account', async () => {
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1 });
    expect(res.ok).toBe(true);
    expect(meta.metaApiMarketOrder).toHaveBeenCalledTimes(1);
    expect(vi.mocked(meta.metaApiMarketOrder).mock.calls[0][0]).toMatchObject({ account: { accountId: 'acct-A' }, side: 'buy' });
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
    const res = await placeManualMarketOrder({ symbol: 'XAUUSD', side: 'buy', qty: 1 });
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
