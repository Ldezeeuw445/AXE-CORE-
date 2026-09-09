/**
 * The day-limit's meter.
 *
 * On 8 September 18 XAUUSD orders reached one MT5 account between 19:15:59 and
 * 19:16:13 — under a maxTradesPerDay of 20 — because the count the cap was
 * tested against came from getDemoAccount(), the paper mirror, and not from
 * what the broker actually held. A brake that reads the wrong meter is not a
 * brake. These tests pin the meter to the broker, and prove the two ways a
 * burst used to slip through are now closed:
 *
 *   1. the count came from the wrong book, and
 *   2. orders fired faster than they could surface in that book.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { MetaApiDeal } from '@/infrastructure/gateways/metaApiService';
import {
  countBrokerOpeningsToday,
  dayLimitState,
  placedTodayInProcess,
  __resetPlacedToday,
} from '@/infrastructure/gateways/brokerConnector';

const DAY = '2026-09-08';

function opening(symbol: string, side: 'BUY' | 'SELL', time: string): MetaApiDeal {
  return { type: `DEAL_TYPE_${side}`, entryType: 'DEAL_ENTRY_IN', symbol, time };
}

describe('countBrokerOpeningsToday', () => {
  it('counts the 8-Sept burst as the eighteen opens it was', () => {
    const deals = Array.from({ length: 18 }, (_, i) =>
      opening('XAUUSD', 'BUY', `${DAY}T19:15:${String(59 + i).padStart(2, '0')}.000Z`),
    );
    expect(countBrokerOpeningsToday(deals, DAY)).toBe(18);
  });

  it('counts opens only — closes and balance ops are not trades started today', () => {
    const deals: MetaApiDeal[] = [
      opening('XAUUSD', 'BUY', `${DAY}T10:00:00.000Z`),
      { type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', symbol: 'XAUUSD', time: `${DAY}T11:00:00.000Z` },
      { type: 'DEAL_TYPE_BALANCE', entryType: 'DEAL_ENTRY_IN', symbol: '', time: `${DAY}T09:00:00.000Z` },
    ];
    expect(countBrokerOpeningsToday(deals, DAY)).toBe(1);
  });

  it('counts a reversal (INOUT) as an opening', () => {
    const deals: MetaApiDeal[] = [
      { type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_INOUT', symbol: 'XAUUSD', time: `${DAY}T12:00:00.000Z` },
    ];
    expect(countBrokerOpeningsToday(deals, DAY)).toBe(1);
  });

  it('ignores deals from other days', () => {
    const deals: MetaApiDeal[] = [
      opening('XAUUSD', 'BUY', `${DAY}T10:00:00.000Z`),
      opening('XAUUSD', 'BUY', '2026-09-07T23:59:59.000Z'),
    ];
    expect(countBrokerOpeningsToday(deals, DAY)).toBe(1);
  });
});

describe('dayLimitState', () => {
  it('blocks the 8-Sept burst: 18 real opens under a cap of 20 leaves the cap trippable, and the paper mirror at 0 no longer overrules the broker', () => {
    // The exact bug: broker had 18, the paper mirror had 0 (a fresh local book),
    // so the old code read 0 and never came close to the cap.
    const state = dayLimitState({ isReal: true, brokerCount: 18, inProcessCount: 0, paperCount: 0 });
    expect(state.tradesToday).toBe(18);
    expect(state.unverified).toBe(false);
  });

  it('a real account whose broker count is unreadable holds rather than trading blind', () => {
    const state = dayLimitState({ isReal: true, brokerCount: null, inProcessCount: 0, paperCount: 99 });
    expect(state.unverified).toBe(true);
    // The paper mirror is never trusted for a real account, even when the broker
    // is dark — that is the substitution that caused the burst.
    expect(state.tradesToday).toBe(0);
  });

  it('covers the gap before a fill reaches history: in-process count wins when it is ahead of the broker', () => {
    // A fresh fill this run has not yet surfaced in history-deals; without the
    // in-process tally the broker would still read the pre-burst number.
    const state = dayLimitState({ isReal: true, brokerCount: 3, inProcessCount: 5, paperCount: 0 });
    expect(state.tradesToday).toBe(5);
  });

  it('paper account still counts its own mirror', () => {
    const state = dayLimitState({ isReal: false, brokerCount: null, inProcessCount: 0, paperCount: 4 });
    expect(state.tradesToday).toBe(4);
    expect(state.unverified).toBe(false);
  });
});

describe('placedTodayInProcess', () => {
  beforeEach(() => __resetPlacedToday());

  it('is zero for an account that has placed nothing', () => {
    expect(placedTodayInProcess('acc-1')).toBe(0);
    expect(placedTodayInProcess(null)).toBe(0);
    expect(placedTodayInProcess(undefined)).toBe(0);
  });
});
