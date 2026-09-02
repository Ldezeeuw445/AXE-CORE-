/**
 * One account's scorecard: its own book, its own breaker, its own risk.
 *
 * The scorecard used to read whichever account was "active", so a desk running
 * three accounts saw one book under a heading that did not name it. With the
 * fan-out live — one NAS100 signal filled on all three within two seconds on
 * 2026-08-25 — that view could not answer the only question worth asking:
 * which of them is actually doing well.
 *
 * Every number here is fetched FOR this account by id. Nothing is inherited
 * from the active-account path, because a panel that silently falls back to
 * another account's numbers is worse than an empty one.
 */
import { useCallback, useEffect, useState } from 'react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { StatTile, AnalyticsPanel } from './scorecardParts';
import {
  metaApiGetHistoryDealsFor, metaApiAccountInfoFor, type MetaApiConfig,
} from '@/infrastructure/gateways/metaApiService';
import {
  metaApiDealsToJournalTrades, computeJournalAnalytics, type JournalAnalytics,
} from '@/application/tradingIntel/csvJournalAnalytics';
import {
  getCircuitBreakerState, resetCircuitBreaker,
} from '@/infrastructure/persistence/tradingCircuitBreakerService';
import type { CircuitBreakerState } from '@/domain/tradingIntel/botTypes';
import { getRiskProfile, setRiskMode } from '@/infrastructure/persistence/tradingRiskService';
import type { RiskProfile, RiskMode } from '@/domain/tradingIntel/botTypes';
import type { TradingAccount } from '@/infrastructure/persistence/tradingAccountsService';
import { OWN_BOOK_LOOKBACK_DAYS } from './useTradingDeskState';
import { planRetry } from '@/domain/tradingIntel/transientError';
import { ProvenanceLine } from '@/presentation/components/axe-core/ProvenanceLine';

const RISK_MODES: Array<{ id: RiskMode; label: string; hint: string }> = [
  { id: 'personal_demo', label: 'Personal', hint: 'Wider stops, higher risk per trade — a demo you are allowed to blow up.' },
  { id: 'funded_live_rules', label: 'Funded', hint: '0.4% a trade, 2.5% daily, 6% total — prop-challenge rules.' },
];

function useAccountCard(account: TradingAccount) {
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [equity, setEquity] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('');
  const [breaker, setBreaker] = useState<CircuitBreakerState | null>(null);
  const [risk, setRisk] = useState<RiskProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A backoff lasts a minute; the panel loaded once and never asked again, so a
  // sixty-second condition sat on screen as a permanent one — on all four cards
  // at once, because the budget keys on the subscription. This is what makes it
  // ask again.
  const [retryIn, setRetryIn] = useState<number | null>(null);
  /** When this card's figures were actually read, not when it rendered. */
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cfg: MetaApiConfig = {
      token: account.token, accountId: account.accountId, region: account.region,
      enabled: true, updatedAt: account.addedAt,
    };
    setLoading(true);
    const end = new Date();
    const start = new Date(end.getTime() - OWN_BOOK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const [deals, info, cb, rp] = await Promise.all([
      metaApiGetHistoryDealsFor(cfg, start.toISOString(), end.toISOString()).catch(e => ({ ok: false as const, error: String(e) })),
      metaApiAccountInfoFor(cfg).catch(() => null),
      getCircuitBreakerState(account.accountId).catch(() => null),
      getRiskProfile(account.accountId).catch(() => null),
    ]);
    setLoading(false);
    setBreaker(cb);
    setRisk(rp);
    if (info && 'ok' in info && info.ok) {
      setEquity(info.info.equity ?? null);
      setCurrency(info.info.currency ?? '');
    }
    if (deals.ok) {
      setLoadedAt(new Date().toISOString());
      const trades = metaApiDealsToJournalTrades(deals.deals);
      setAnalytics(trades.length ? computeJournalAnalytics(trades) : null);
      setError(null);
    } else {
      // Named, never swapped for another account's book.
      setError(deals.error);
      setAnalytics(null);
      const plan = planRetry(deals.error);
      setRetryIn(plan.retryable ? Math.round(plan.waitMs / 1000) : null);
    }
  }, [account.accountId, account.token, account.region, account.addedAt]);

  // Deferred by a tick: calling load() straight from the effect body sets
  // state during the same render pass, which cascades. Same pattern as
  // AccountsBar and AgentOverviewPanel.
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Try again once the self-clearing condition has had time to clear. Only for
  // failures that clear on their own — a bad key or a missing account is left
  // alone, because retrying those hides a problem that needs a person.
  useEffect(() => {
    if (retryIn == null) return;
    const t = setTimeout(() => { setRetryIn(null); void load(); }, retryIn * 1000);
    return () => clearTimeout(t);
  }, [retryIn, load]);

  const changeMode = useCallback(async (mode: RiskMode) => {
    setRisk(await setRiskMode(mode, account.accountId));
  }, [account.accountId]);

  return { analytics, equity, currency, breaker, risk, loading, error, retryIn, loadedAt, load, changeMode };
}

/** Row one: this account's breaker, with its name and equity in the title. */
export function AccountBreakerCard({ account }: { account: TradingAccount }) {
  const { equity, currency, breaker, loading, load } = useAccountCard(account);
  const tripped = breaker?.tripped === true;

  return (
    <div className="h-full min-w-0">
      <WidgetCard
        title={`${account.label} · ${equity != null ? `${equity.toFixed(2)} ${currency}` : loading ? '…' : '—'}`}
        headerAction={tripped ? (
          <button
            type="button"
            className="text-[10px]"
            style={{ color: '#fca5a5' }}
            onClick={() => void resetCircuitBreaker(equity ?? breaker?.peakEquity ?? 0, 'live', account.accountId).then(() => void load())}
          >
            Reset breaker
          </button>
        ) : (
          <button type="button" onClick={() => void load()} className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Refresh
          </button>
        )}
      >
        {breaker ? (
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Status" value={tripped ? 'TRIPPED' : 'Armed'} color={tripped ? '#fca5a5' : '#6ee7b7'} />
            <StatTile label="Peak equity" value={breaker.peakEquity.toFixed(0)} />
          </div>
        ) : (
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Arms itself on this account's first cycle.
          </p>
        )}
        {tripped && breaker?.trippedReason && (
          <p className="text-[10px] mt-1.5" style={{ color: '#fca5a5' }}>{breaker.trippedReason}</p>
        )}
      </WidgetCard>
    </div>
  );
}

/** Row two: what this account is allowed to risk. */
export function AccountRiskCard({ account }: { account: TradingAccount }) {
  const { risk, changeMode } = useAccountCard(account);

  return (
    <div className="h-full min-w-0">
      <WidgetCard title="Risk — this account only">
        <div className="flex gap-1.5 mb-1.5">
          {RISK_MODES.map(m => {
            const on = risk?.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => void changeMode(m.id)}
                className="px-2 py-1 rounded-lg text-[10px] flex-1"
                style={{
                  background: on ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${on ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  color: on ? '#6ee7b7' : 'rgba(255,255,255,0.45)',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        {risk && (
          <div className="grid grid-cols-3 gap-1.5">
            <StatTile label="Per trade" value={`${(risk.riskPerTradePct * 100).toFixed(2)}%`} />
            <StatTile label="Daily stop" value={`${(risk.maxDailyLossPct * 100).toFixed(1)}%`} />
            <StatTile
              label="Max DD"
              value={risk.maxDrawdownPct != null ? `${(risk.maxDrawdownPct * 100).toFixed(1)}%` : '—'}
            />
          </div>
        )}
        <p className="text-[9px] mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {RISK_MODES.find(m => m.id === risk?.mode)?.hint}
        </p>
      </WidgetCard>
    </div>
  );
}

/** Row three: this account's closed-trade record. */
export function AccountBookAnalytics({ account }: { account: TradingAccount }) {
  const { analytics, loading, error, retryIn, loadedAt } = useAccountCard(account);

  return (
    <div className="h-full min-w-0">
      <WidgetCard title={`Its own book — last ${OWN_BOOK_LOOKBACK_DAYS} days`}>
        {loading ? (
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Loading this account's history…</p>
        ) : error ? (
          // The account is named in the heading, so this error belongs to it.
          <div>
            {/* A wait and a fault look identical if only the text is shown. */}
            <p className="text-[10px]" style={{ color: retryIn != null ? '#fbbf24' : '#fca5a5' }}>
              {retryIn != null ? 'Waiting on the broker' : 'History unreadable'} — {error}
            </p>
            {retryIn != null && (
              <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {`Nothing to do — ${planRetry(error).reason}. Trying again in about ${retryIn}s.`}
              </p>
            )}
          </div>
        ) : analytics ? (
          <>
          {/* Under the numbers, always: this card showed a sixty-second local
              backoff as a permanent broker refusal for hours, and a line naming
              the source would have ended that in seconds. */}
          <ProvenanceLine
            source="MetaAPI history-deals"
            scope={`${account.label} · last ${OWN_BOOK_LOOKBACK_DAYS} days`}
            at={loadedAt}
            staleAfterMs={30 * 60_000}
          />
          <AnalyticsPanel
            analytics={analytics}
            byStrategyHint="Grouping by strategy needs trade comments on the deals."
          />
          </>
        ) : (
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            No closed trades on this account in this window.
          </p>
        )}
      </WidgetCard>
    </div>
  );
}
