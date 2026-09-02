/**
 * Every connected account's book, fetched once and shared.
 *
 * The cards and the calendar are two views of the same trades, so they are
 * fetched in one place. Letting each component fetch its own would double the
 * MetaAPI calls — the exact thing this codebase keeps getting throttled for —
 * and, worse, would let the columns and the calendar disagree about a day.
 *
 * Per account, by id. Nothing here reads the "active account" path: a book
 * that quietly shows another account's trades under this account's name is
 * the bug this whole tab was rebuilt to remove.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  metaApiGetHistoryDealsFor, metaApiPositionsFor, metaApiAccountInfoFor,
  type MetaApiConfig,
} from '@/infrastructure/gateways/metaApiService';
import {
  metaApiDealsToJournalTrades, type JournalTrade,
} from '@/application/tradingIntel/csvJournalAnalytics';
import { getAccounts, type TradingAccount } from '@/infrastructure/persistence/tradingAccountsService';
import { OWN_BOOK_LOOKBACK_DAYS } from './useTradingDeskState';

export interface AccountBook {
  account: TradingAccount;
  balance: number | null;
  equity: number | null;
  freeMargin: number | null;
  currency: string;
  positions: Array<Record<string, unknown>>;
  trades: JournalTrade[];
  /** Named per account, never swapped for another account's data. */
  historyError: string | null;
  loading: boolean;
}

function cfgOf(a: TradingAccount): MetaApiConfig {
  return {
    token: a.token, accountId: a.accountId, region: a.region,
    enabled: true, updatedAt: a.addedAt,
  };
}

export function useAccountBooks(): {
  books: AccountBook[];
  loading: boolean;
  reload: () => void;
} {
  const [books, setBooks] = useState<AccountBook[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const state = await getAccounts().catch(() => null);
    const accounts = (state?.accounts ?? []).filter(a => a.token && a.accountId);
    if (!accounts.length) {
      setBooks([]);
      setLoading(false);
      return;
    }

    // Placeholders first so the columns appear immediately and fill in.
    setBooks(accounts.map(a => ({
      account: a, balance: null, equity: null, freeMargin: null, currency: '',
      positions: [], trades: [], historyError: null, loading: true,
    })));

    const end = new Date();
    const start = new Date(end.getTime() - OWN_BOOK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // ONE ACCOUNT AT A TIME, AND THE HISTORY LAST.
    //
    // Fetching all three accounts in parallel is what this tab did first, and
    // MetaAPI answered it the way it always does: `history-deals 429
    // TooManyRequestsError — you are trying to access too many unexisting or
    // undeployed trading accounts`. Three 180-day histories at once is a burst,
    // and the throttle that follows takes down the account that happened to be
    // third rather than the one that caused it.
    //
    // Sequential, with the cheap calls first, so balance and open positions are
    // already on screen for every account before the expensive history starts.
    // A slower fill is worth far more than a red panel on a healthy account.
    const results: AccountBook[] = [];
    for (const a of accounts) {
      const cfg = cfgOf(a);
      const [info, pos] = await Promise.all([
        metaApiAccountInfoFor(cfg).catch(() => null),
        metaApiPositionsFor(cfg).catch(() => null),
      ]);
      const deals = await metaApiGetHistoryDealsFor(cfg, start.toISOString(), end.toISOString())
        .catch(e => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));

      results.push({
        account: a,
        balance: info && 'ok' in info && info.ok ? info.info.balance ?? null : null,
        equity: info && 'ok' in info && info.ok ? info.info.equity ?? null : null,
        freeMargin: info && 'ok' in info && info.ok ? info.info.freeMargin ?? null : null,
        currency: info && 'ok' in info && info.ok ? info.info.currency ?? '' : '',
        positions: pos && pos.ok ? (pos.positions as Array<Record<string, unknown>>) : [],
        trades: deals.ok ? metaApiDealsToJournalTrades(deals.deals) : [],
        historyError: deals.ok ? null : deals.error,
        loading: false,
      });

      // Show what has arrived rather than making the user wait for all three.
      setBooks([...results, ...accounts.slice(results.length).map(rest => ({
        account: rest, balance: null, equity: null, freeMargin: null, currency: '',
        positions: [], trades: [], historyError: null, loading: true,
      }))]);
    }

    setBooks(results);
    setLoading(false);
  }, []);

  // Deferred a tick: setting state straight from the effect body cascades.
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  return { books, loading, reload: () => void load() };
}
