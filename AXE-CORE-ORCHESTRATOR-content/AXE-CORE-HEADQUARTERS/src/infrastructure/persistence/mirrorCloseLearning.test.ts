/**
 * Een spiegel van een broker-close leert niet; een echte papieren close wel.
 *
 * brokerPlaceOrder spiegelt elke MetaAPI-order in het papieren boek (venue
 * 'metaapi'). De reconciler leert al van dezelfde close uit de echte
 * dealhistorie; leerde de spiegel ook, dan stond elke door AXE gesloten trade
 * twee keer in het ledger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
});
vi.mock('@/infrastructure/persistence/userSettingsService', () => ({ loadSetting: vi.fn(async (_k: string, fb: unknown) => fb), saveSetting: vi.fn() }));
vi.mock('@/infrastructure/persistence/tradingLearningService', () => ({ recordTradeOutcome: vi.fn(async () => ({})) }));
vi.mock('@/infrastructure/persistence/tradingTradesService', () => ({
  recordTradeOpened: vi.fn(async () => undefined), updateOpenTrade: vi.fn(async () => undefined), recordTradeClosed: vi.fn(async () => undefined),
}));

import { executeDemoTrade } from './demoTradingService';
import { recordTradeOutcome } from './tradingLearningService';
import { recordTradeClosed } from './tradingTradesService';

const open = (venue: 'paper' | 'metaapi') => executeDemoTrade({ symbol: 'XAUUSD', side: 'buy', qty: 1, price: 2400, reason: 'o', confidence: 0.7, venue });
const close = (venue: 'paper' | 'metaapi') => executeDemoTrade({ symbol: 'XAUUSD', side: 'sell', qty: 1, price: 2410, reason: 'c', confidence: 0.7, venue });

beforeEach(() => {
  mem.clear(); vi.clearAllMocks();
  mem.set('axe_demo_trading_account', JSON.stringify({ cash: 1_000_000, positions: [], trades: [], updatedAt: '' }));
});

describe('papieren boek en de leerlus', () => {
  it('een papieren close leert, gelabeld als papier', async () => {
    const o = await open('paper'); const c = await close('paper');
    expect('error' in o ? o.error : 'ok').toBe('ok');
    expect('error' in c ? c.error : 'ok').toBe('ok');
    await Promise.resolve();
    expect(recordTradeOutcome).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordTradeOutcome).mock.calls[0][0]).toMatchObject({ environment: 'paper', pnl: 10 });
  });

  it('een spiegel van een MetaAPI-close leert niet (de reconciler doet dat), maar staat wel in het journaal', async () => {
    await open('metaapi'); await close('metaapi');
    await Promise.resolve();
    expect(recordTradeOutcome).not.toHaveBeenCalled();
    expect(recordTradeClosed).toHaveBeenCalledTimes(1);
  });
});
