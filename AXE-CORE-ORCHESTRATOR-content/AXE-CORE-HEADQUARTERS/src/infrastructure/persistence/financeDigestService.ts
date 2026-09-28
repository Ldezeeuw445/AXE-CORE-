/**
 * financeDigestService.ts
 * ------------------------------------------------------------------
 * Daily Finance Digest — the finance agent's real (and only) loop.
 *
 * Reconciles two things that have never been checked against each other:
 *   1. The manual personal income ledger (incomeLedgerService) — Luka's own
 *      log of what he earned, including a "trading" source that is meant to
 *      represent payouts/withdrawals from AXE Algo.
 *   2. AXE Algo's own trade journal (`core_trading_trades`) — what the
 *      trading agent actually closed.
 *
 * Nobody had ever compared these. A manual "trading" income entry could sit
 * next to a period where AXE Algo closed zero trades and nothing would say
 * so.
 *
 * ## Why a calendar day, not a rolling 24h window
 *
 * `IncomeEntry.date` is a bare `YYYY-MM-DD` — no time of day. A rolling "last
 * 24h" window compared against that would silently misalign by up to 23
 * hours depending on the moment the digest happens to run, which is exactly
 * the kind of fabricated precision this whole pass exists to avoid. So the
 * default period is "today" (local calendar day): income entries are matched
 * by `date`, trades by `closed_at` falling inside that same day's
 * [00:00, 24:00) window. Both sides then describe the same day, honestly.
 *
 * ## Why demo/live classification goes through accountEnvironment(), not a
 * column or a label
 *
 * `user_broker_accounts.trading_mode` was checked live and found to say
 * 'live' for demo accounts too (only Alpaca-provider rows are correct there).
 * A label/provider substring heuristic ("contains DEMO") is just as fragile
 * — it depends on Luka naming things consistently, which is not a safe
 * assumption to build financial reporting on. `accountEnvironment()`
 * (tradingAccountsService.ts) is the one place that already gets this right:
 * a configured override first, then the broker's own reported trade mode,
 * and — critically — unknown never silently becomes 'live'. This service
 * reuses that function unchanged and preserves its fail-safe property one
 * level up: any trade whose account environment resolves to null is put in
 * an explicit "unclassified" bucket, never folded into demo or live.
 *
 * ## Verdict
 *
 * 'unknown' when there is nothing to reconcile against (no income entries
 * logged for the day) — forcing 'good' or 'poor' out of silence would be the
 * same honesty failure this service exists to catch. 'poor' when a concrete
 * discrepancy is found: a manual "trading" income entry with zero matching
 * closed-trade activity that day, a sign mismatch between manual trading
 * income and AXE Algo's own demo+live pnl, or a "trading" income entry
 * logged in a non-EUR currency — which `summarizeIncome()`'s EUR-only
 * default silently drops from the total, so it would otherwise vanish from
 * this very reconciliation without a trace. 'good' otherwise.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { openEpisode, closeEpisode } from '@/infrastructure/persistence/agentFeedbackService';
import { writeReflection } from '@/infrastructure/persistence/reflectionService';
import { accountEnvironment } from '@/infrastructure/persistence/tradingAccountsService';
import {
  listIncomeEntries,
  summarizeIncome,
  type IncomeEntry,
  type IncomeSource,
} from '@/infrastructure/persistence/incomeLedgerService';
import type { Verdict } from '@/domain/memory/agentLoop';

const LS_LAST_RUN = 'axe_finance_digest_last_run';
const LS_STATS = 'axe_finance_digest_stats';

/** Generous but bounded — a real day of trading is nowhere near this, and a
 *  hit against the cap is worth flagging rather than silently truncating. */
const TRADES_QUERY_LIMIT = 5000;

export interface FinanceDigestPeriod {
  /** Inclusive ISO start. */
  start: string;
  /** Exclusive ISO end. */
  end: string;
  /** Human label, e.g. "2026-09-23". Matches IncomeEntry.date's granularity. */
  label: string;
  /** Same value as `label` — the YYYY-MM-DD key used to filter income entries. */
  dateKey: string;
}

/** Today, local calendar day. See file header for why this beats a rolling 24h window. */
function todayPeriod(now: Date = new Date()): FinanceDigestPeriod {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const dateKey = start.toISOString().slice(0, 10);
  return { start: start.toISOString(), end: end.toISOString(), label: dateKey, dateKey };
}

export interface FinanceDigest {
  /** Human label for the period, e.g. "2026-09-23". */
  period: string;
  periodStart: string;
  periodEnd: string;

  realIncomeTotal: number;
  realIncomeBySource: Partial<Record<IncomeSource, number>>;

  algoDemoPnlTotal: number;
  algoDemoTradeCount: number;
  algoDemoWinRate: number;

  algoLivePnlTotal: number;
  algoLiveTradeCount: number;
  algoLiveWinRate: number;

  unclassifiedPnlTotal: number;
  unclassifiedTradeCount: number;

  /** 'good' | 'poor' | 'unknown' — see file header for what earns each. */
  verdict: Verdict;
  /** Plain-language explanation of the verdict, always present. */
  note: string;
  computedAt: string;
}

interface ClosedTradeRow {
  id: string;
  account_id: string | null;
  pnl: number | null;
  closed_at: string | null;
}

async function fetchClosedTrades(period: FinanceDigestPeriod): Promise<{ rows: ClosedTradeRow[]; truncated: boolean; queryFailed: boolean }> {
  const sb = getSupabase();
  if (!sb) return { rows: [], truncated: false, queryFailed: true };
  try {
    const { data, error } = await sb
      .from('core_trading_trades')
      .select('id, account_id, pnl, closed_at')
      .eq('status', 'closed')
      .gte('closed_at', period.start)
      .lt('closed_at', period.end)
      .limit(TRADES_QUERY_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as ClosedTradeRow[];
    return { rows, truncated: rows.length >= TRADES_QUERY_LIMIT, queryFailed: false };
  } catch (err) {
    console.warn('[financeDigest] core_trading_trades query failed:', err);
    return { rows: [], truncated: false, queryFailed: true };
  }
}

interface Bucket {
  pnlTotal: number;
  tradeCount: number;
  wins: number;
}

function emptyBucket(): Bucket {
  return { pnlTotal: 0, tradeCount: 0, wins: 0 };
}

function winRate(b: Bucket): number {
  return b.tradeCount > 0 ? b.wins / b.tradeCount : 0;
}

/**
 * Classifies every closed trade in the window into demo/live/unclassified,
 * deduping the broker lookup by account_id (not by row) — the same handful
 * of accounts repeat across hundreds of trades, and accountEnvironment()
 * already caches per-account for an hour, but there's no reason to even ask
 * twice in the same digest run, let alone risk hitting several distinct
 * accounts' brokers concurrently.
 */
async function classifyTrades(rows: ClosedTradeRow[]): Promise<{
  demo: Bucket;
  live: Bucket;
  unclassified: Bucket;
}> {
  const demo = emptyBucket();
  const live = emptyBucket();
  const unclassified = emptyBucket();

  const distinctAccountIds = Array.from(
    new Set(rows.map(r => r.account_id).filter((id): id is string => !!id)),
  );

  const envByAccount = new Map<string, 'demo' | 'live' | null>();
  // Sequential on purpose: distinct accounts are few (a handful, per the
  // design brief), and accountEnvironment()'s first call per account can hit
  // the broker over the network — parallelizing that across many accounts is
  // how you get rate-limited.
  for (const accountId of distinctAccountIds) {
    try {
      const { env } = await accountEnvironment(accountId);
      envByAccount.set(accountId, env);
    } catch (err) {
      console.warn('[financeDigest] accountEnvironment failed for', accountId, err);
      envByAccount.set(accountId, null);
    }
  }

  for (const row of rows) {
    const pnl = row.pnl ?? 0;
    const env = row.account_id ? envByAccount.get(row.account_id) ?? null : null;
    const bucket = env === 'demo' ? demo : env === 'live' ? live : unclassified;
    bucket.pnlTotal += pnl;
    bucket.tradeCount += 1;
    if (pnl > 0) bucket.wins += 1;
  }

  return { demo, live, unclassified };
}

/** Sum of a set of income entries in EUR only — the same filter summarizeIncome()
 *  applies by default. Used to spot the entries it would silently drop. */
function eurSum(entries: IncomeEntry[]): number {
  return entries.reduce((s, e) => s + (e.currency === 'EUR' ? e.amount : 0), 0);
}

function buildVerdict(
  periodLabel: string,
  periodEntries: IncomeEntry[],
  demo: Bucket,
  live: Bucket,
  unclassified: Bucket,
  tradesQueryFailed: boolean,
  tradesTruncated: boolean,
): { verdict: Verdict; note: string } {
  const notes: string[] = [];

  if (unclassified.tradeCount > 0) {
    notes.push(
      `${unclassified.tradeCount} closed trade(s) (pnl ${unclassified.pnlTotal.toFixed(2)}) could not be classified demo/live — ` +
      `account environment unknown (no configured override, broker check failed, or the account isn't in the accounts list). Not folded into either total.`,
    );
  }
  if (tradesTruncated) {
    notes.push(`Trade query hit its ${TRADES_QUERY_LIMIT}-row cap — totals may be incomplete for this period.`);
  }

  if (tradesQueryFailed) {
    return {
      verdict: 'unknown',
      note: ['Could not read core_trading_trades for this period — no reconciliation possible.', ...notes].join(' '),
    };
  }

  if (periodEntries.length === 0) {
    notes.unshift(`No income entries logged for ${periodLabel} — nothing to reconcile.`);
    return { verdict: 'unknown', note: notes.join(' ') };
  }

  const tradingEntries = periodEntries.filter(e => e.source === 'trading');
  let poor = false;

  if (tradingEntries.length > 0) {
    const totalClosedTrades = demo.tradeCount + live.tradeCount + unclassified.tradeCount;
    if (totalClosedTrades === 0) {
      poor = true;
      notes.push(
        `${tradingEntries.length} manual "trading" income entr${tradingEntries.length === 1 ? 'y' : 'ies'} logged for ${periodLabel}, ` +
        `but core_trading_trades shows zero closed trades in the same window.`,
      );
    }

    const tradingIncomeEur = eurSum(tradingEntries);
    const knownAlgoPnl = demo.pnlTotal + live.pnlTotal; // unclassified deliberately excluded — its sign isn't attributable
    if (tradingIncomeEur !== 0 && knownAlgoPnl !== 0) {
      const oppositeSign = Math.sign(tradingIncomeEur) !== Math.sign(knownAlgoPnl);
      if (oppositeSign && Math.abs(tradingIncomeEur) > 1 && Math.abs(knownAlgoPnl) > 1) {
        poor = true;
        notes.push(
          `Manual "trading" income (${tradingIncomeEur.toFixed(2)} EUR) and AXE Algo's own demo+live pnl ` +
          `(${knownAlgoPnl.toFixed(2)}) have opposite signs for ${periodLabel}.`,
        );
      }
    }

    const nonEurTrading = tradingEntries.filter(e => e.currency !== 'EUR');
    if (nonEurTrading.length > 0) {
      poor = true;
      const currencies = Array.from(new Set(nonEurTrading.map(e => e.currency))).join(', ');
      notes.push(
        `${nonEurTrading.length} "trading" income entr${nonEurTrading.length === 1 ? 'y' : 'ies'} logged in a non-EUR currency ` +
        `(${currencies}) — summarizeIncome()'s EUR-only default silently drops these from realIncomeTotal, so they would ` +
        `otherwise vanish from this reconciliation without a trace.`,
      );
    }
  }

  if (!poor) {
    notes.push(`Reconciled OK for ${periodLabel} — no discrepancy found between the income ledger and AXE Algo's trade journal.`);
  }

  return { verdict: poor ? 'poor' : 'good', note: notes.join(' ') };
}

function loadStatsSync(): FinanceDigest | null {
  try {
    return JSON.parse(localStorage.getItem(LS_STATS) || 'null');
  } catch {
    return null;
  }
}

function saveStats(digest: FinanceDigest): void {
  try {
    localStorage.setItem(LS_STATS, JSON.stringify(digest));
    localStorage.setItem(LS_LAST_RUN, digest.computedAt);
  } catch {
    /* best-effort */
  }
  void saveSetting(LS_STATS, digest);
}

/** Last computed digest, synchronous — for rendering the Finance tab without
 *  re-running the reconciliation on every page load. */
export function getLastFinanceDigest(): FinanceDigest | null {
  return loadStatsSync();
}

/**
 * Runs the digest once for the given period (default: today) and returns it.
 * This is the on-demand entry point — wire it to a "Run digest" button.
 *
 * Loop wiring (LOOP_AGENTS 'finance'): opens an episode before the
 * reconciliation runs, closes it with the real verdict computed above. No
 * memoryIds/memoryKeys — this digest doesn't read from RAG/global memory to
 * make its call, it reads the income ledger and the trade journal directly,
 * so there is nothing honest to attribute the verdict to.
 */
export async function runFinanceDigest(period: FinanceDigestPeriod = todayPeriod()): Promise<FinanceDigest> {
  const episodeId = await openEpisode({
    agent: 'finance',
    subject: `finance digest ${period.label}`,
  });

  const [entries, tradesResult] = await Promise.all([
    listIncomeEntries().catch(() => [] as IncomeEntry[]),
    fetchClosedTrades(period),
  ]);

  const periodEntries = entries.filter(e => e.date === period.dateKey);
  const summary = summarizeIncome(periodEntries); // EUR default, matches Finance.tsx's own convention
  const realIncomeBySource: Partial<Record<IncomeSource, number>> = {};
  for (const [src, agg] of Object.entries(summary.bySource)) {
    realIncomeBySource[src as IncomeSource] = agg.amount;
  }

  const { demo, live, unclassified } = await classifyTrades(tradesResult.rows);

  const { verdict, note } = buildVerdict(
    period.label,
    periodEntries,
    demo,
    live,
    unclassified,
    tradesResult.queryFailed,
    tradesResult.truncated,
  );

  void closeEpisode(episodeId, verdict, note.slice(0, 500));

  const digest: FinanceDigest = {
    period: period.label,
    periodStart: period.start,
    periodEnd: period.end,
    realIncomeTotal: summary.total,
    realIncomeBySource,
    algoDemoPnlTotal: demo.pnlTotal,
    algoDemoTradeCount: demo.tradeCount,
    algoDemoWinRate: winRate(demo),
    algoLivePnlTotal: live.pnlTotal,
    algoLiveTradeCount: live.tradeCount,
    algoLiveWinRate: winRate(live),
    unclassifiedPnlTotal: unclassified.pnlTotal,
    unclassifiedTradeCount: unclassified.tradeCount,
    verdict,
    note,
    computedAt: new Date().toISOString(),
  };

  saveStats(digest);

  try {
    await writeReflection({
      title: `Finance digest — ${period.label}`,
      whatHappened:
        `Real income logged: ${digest.realIncomeTotal.toFixed(2)} EUR. AXE Algo closed trades — ` +
        `demo: ${demo.tradeCount} (pnl ${demo.pnlTotal.toFixed(2)}), live: ${live.tradeCount} (pnl ${live.pnlTotal.toFixed(2)}), ` +
        `unclassified: ${unclassified.tradeCount} (pnl ${unclassified.pnlTotal.toFixed(2)}).`,
      lesson: note,
      outcome: verdict === 'poor' ? 'failed' : 'completed',
      category: 'finance_digest',
    });
  } catch (err) {
    console.warn('[financeDigest] reflection write failed:', err);
  }

  return digest;
}

/** Fire-and-forget, idempotent per calendar day — same pattern as
 *  maybeRunMemoryManager(). Wire this from bootstrap for a real daily loop
 *  without inventing a new scheduler. */
export function maybeRunFinanceDigest(): void {
  try {
    const lastDay = localStorage.getItem(LS_LAST_RUN)?.slice(0, 10);
    if (lastDay === todayPeriod().dateKey) return;
  } catch {
    /* continue and try anyway */
  }
  void runFinanceDigest().catch(err => console.warn('[financeDigest] skipped:', err));
}
