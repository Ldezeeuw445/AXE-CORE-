/**
 * One enabled account must mean that account trades.
 *
 * selectTradeable used to return [] below two enabled accounts so that callers
 * would "keep their single-account path". Three things silently depended on the
 * list being complete, and all three broke:
 *
 *   - the autopilot traded the *active* account instead of the enabled one, so
 *     trading a single account on its own was impossible;
 *   - emergencyFlattenAndStop iterates this list, so "stop everything" closed
 *     no MetaAPI position at all — and still reported success;
 *   - positionManager trailed and protected nothing, for the same reason.
 */
import { describe, it, expect } from 'vitest';
import { selectTradeable } from './tradingAccountsService';
import type { TradingAccount } from './tradingAccountsService';

const account = (over: Partial<TradingAccount> = {}): TradingAccount => ({
  id: 'local-1',
  label: 'Live 50k',
  token: 'tok',
  accountId: 'mt5-1',
  region: 'new-york',
  enabled: true,
  addedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('selectTradeable', () => {
  it('returns the single enabled account rather than nothing', () => {
    // The regression: this returned [] and the caller silently traded elsewhere.
    const got = selectTradeable([account()]);
    expect(got).toHaveLength(1);
    expect(got[0].accountId).toBe('mt5-1');
  });

  it('returns all three when all three are enabled', () => {
    const got = selectTradeable([
      account({ id: 'a', accountId: 'mt5-a' }),
      account({ id: 'b', accountId: 'mt5-b' }),
      account({ id: 'c', accountId: 'mt5-c' }),
    ]);
    expect(got.map(a => a.accountId)).toEqual(['mt5-a', 'mt5-b', 'mt5-c']);
  });

  it('leaves out the ones switched off', () => {
    const got = selectTradeable([
      account({ id: 'a', accountId: 'mt5-a' }),
      account({ id: 'b', accountId: 'mt5-b', enabled: false }),
      account({ id: 'c', accountId: 'mt5-c' }),
    ]);
    expect(got.map(a => a.accountId)).toEqual(['mt5-a', 'mt5-c']);
  });

  it('leaves out an account that has no credentials yet', () => {
    // A half-added account must not reach the broker as an empty id — that is
    // what MetaAPI answers with NotFoundError and then throttles on.
    expect(selectTradeable([account({ token: '' })])).toEqual([]);
    expect(selectTradeable([account({ accountId: '' })])).toEqual([]);
  });

  it('is empty only when nothing is enabled', () => {
    expect(selectTradeable([])).toEqual([]);
    expect(selectTradeable([account({ enabled: false })])).toEqual([]);
  });
});
