/**
 * tradingTradesService — the queryable trade journal (`core_trading_trades`).
 *
 * Everything else that touches a closed trade is either bounded (the 200-cap
 * paper mirror, the ~20-trace decision log, the ~2-day cycle journal) or
 * write-only (the per-trade Obsidian note). None of them is a SQL table you
 * can filter, join or aggregate over, and none joins "why it entered"
 * (strategy, timeframe, confidence, rationale) to "what happened" (exit
 * price, pnl, exit reason) in one row you can query.
 *
 * This is that row. One per trade, open -> closed:
 *   - recordTradeOpened() writes it the moment a position opens (paper fill
 *     or MetaAPI-mirrored live fill) — status 'open'.
 *   - updateOpenTrade() folds an averaging buy into the same open row.
 *   - recordTradeClosed() closes it by local_trade_id when the app itself
 *     saw the close (demoTradingService); when it can't find a match (a
 *     broker-side SL/TP close the reconciler discovered, with no local
 *     open row to point at) it inserts a standalone closed row instead of
 *     dropping the trade on the floor.
 *   - matchOpenTradeForReconcile() lets the reconciler find the open row a
 *     broker-side close belongs to, so that close can update it in place
 *     rather than creating an orphan.
 *   - listTrades() is what the UI (DemoBookTab's Trade Journal section)
 *     reads.
 *
 * Every write here is best-effort and fire-and-forget from the caller's
 * point of view: a journal hiccup must never be able to fail a fill or a
 * reconcile pass. Failures are logged and swallowed, matching the pattern
 * already established by recordTradeOutcome/writeTradeNote.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { frameworkOf } from '@/domain/tradingIntel/strategyColors';

const TABLE = 'core_trading_trades';

export interface TradeRecord {
  id: string;
  local_trade_id: string | null;
  account_id: string | null;
  account_label: string | null;
  venue: string;
  symbol: string;
  side: string;
  qty: number | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  strategy: string | null;
  framework: string | null;
  timeframe: string | null;
  confidence: number | null;
  rationale: string | null;
  intel_report_id: string | null;
  comment: string | null;
  status: 'open' | 'closed';
  pnl: number | null;
  return_pct: number | null;
  exit_reason: string | null;
  obsidian_note_path: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

function frameworkFor(strategy?: string | null): string | null {
  if (!strategy) return null;
  return frameworkOf(strategy) ?? 'axe';
}

export async function recordTradeOpened(input: {
  /** Joins this row to the position that will close it — DemoPosition.id. */
  localTradeId: string;
  accountId?: string | null;
  accountLabel?: string | null;
  venue?: 'paper' | 'metaapi';
  symbol: string;
  side: string;
  qty?: number;
  entryPrice?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  strategy?: string;
  timeframe?: string;
  confidence?: number;
  rationale?: string;
  intelReportId?: string;
  comment?: string;
  openedAt?: string;
}): Promise<string | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const now = new Date().toISOString();
    const row = {
      local_trade_id: input.localTradeId,
      account_id: input.accountId ?? null,
      account_label: input.accountLabel ?? null,
      venue: input.venue ?? 'paper',
      symbol: input.symbol.toUpperCase(),
      side: input.side,
      qty: input.qty ?? null,
      entry_price: input.entryPrice ?? null,
      stop_loss: input.stopLoss ?? null,
      take_profit: input.takeProfit ?? null,
      strategy: input.strategy ?? null,
      framework: frameworkFor(input.strategy),
      timeframe: input.timeframe ?? null,
      confidence: input.confidence ?? null,
      rationale: input.rationale ? input.rationale.slice(0, 2000) : null,
      intel_report_id: input.intelReportId ?? null,
      comment: input.comment ?? null,
      status: 'open' as const,
      opened_at: input.openedAt ?? now,
      updated_at: now,
    };
    const { data, error } = await sb.from(TABLE).insert(row).select('id').maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  } catch (e) {
    console.warn('[tradingTrades] recordTradeOpened failed', e);
    return null;
  }
}

/** Folds an averaging buy (adding to an already-open position) into its row. */
export async function updateOpenTrade(
  localTradeId: string,
  patch: { qty?: number; entryPrice?: number },
): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.qty != null) update.qty = patch.qty;
    if (patch.entryPrice != null) update.entry_price = patch.entryPrice;
    const { error } = await sb
      .from(TABLE)
      .update(update)
      .eq('local_trade_id', localTradeId)
      .eq('status', 'open');
    if (error) throw error;
  } catch (e) {
    console.warn('[tradingTrades] updateOpenTrade failed', e);
  }
}

export async function recordTradeClosed(input: {
  /** When known, closes that exact open row. Null/omitted for a broker-side
   *  close the app never opened locally (reconciler, no match found). */
  localTradeId?: string | null;
  accountId?: string | null;
  accountLabel?: string | null;
  venue?: 'paper' | 'metaapi';
  symbol: string;
  side?: string;
  qty?: number;
  entryPrice?: number;
  exitPrice?: number;
  strategy?: string;
  timeframe?: string;
  confidence?: number;
  pnl: number;
  returnPct?: number;
  exitReason?: string;
  obsidianNotePath?: string;
  closedAt?: string;
}): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const closedAt = input.closedAt ?? new Date().toISOString();

    if (input.localTradeId) {
      const { data, error } = await sb
        .from(TABLE)
        .update({
          status: 'closed',
          exit_price: input.exitPrice ?? null,
          pnl: input.pnl,
          return_pct: input.returnPct ?? null,
          exit_reason: input.exitReason ?? null,
          obsidian_note_path: input.obsidianNotePath ?? null,
          closed_at: closedAt,
          updated_at: closedAt,
        })
        .eq('local_trade_id', input.localTradeId)
        .eq('status', 'open')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (data?.id) return; // matched an open row and closed it
    }

    // No open row to close — record it anyway, standalone, rather than let a
    // real outcome (usually a broker-side SL/TP the app never directly saw)
    // vanish because nothing local matched it.
    const { error: insertError } = await sb.from(TABLE).insert({
      local_trade_id: input.localTradeId ?? null,
      account_id: input.accountId ?? null,
      account_label: input.accountLabel ?? null,
      venue: input.venue ?? 'metaapi',
      symbol: input.symbol.toUpperCase(),
      side: input.side ?? 'unknown',
      qty: input.qty ?? null,
      entry_price: input.entryPrice ?? null,
      exit_price: input.exitPrice ?? null,
      strategy: input.strategy ?? null,
      framework: frameworkFor(input.strategy),
      timeframe: input.timeframe ?? null,
      confidence: input.confidence ?? null,
      status: 'closed',
      pnl: input.pnl,
      return_pct: input.returnPct ?? null,
      exit_reason: input.exitReason ?? null,
      obsidian_note_path: input.obsidianNotePath ?? null,
      opened_at: closedAt,
      closed_at: closedAt,
      updated_at: closedAt,
    });
    if (insertError) throw insertError;
  } catch (e) {
    console.warn('[tradingTrades] recordTradeClosed failed', e);
  }
}

/**
 * Finds the oldest still-open row for this account+symbol — what the
 * reconciler matches a broker-side close against. Oldest first (FIFO)
 * because that is the only ordering that doesn't require guessing which of
 * several open lots a partial close belongs to.
 *
 * `accountId: null` matches pure-paper rows (no MetaAPI account attached)
 * rather than any-account, so a live close can never mistakenly close a
 * paper-only row and vice versa.
 */
export async function matchOpenTradeForReconcile(
  accountId: string | null,
  symbol: string,
): Promise<{
  localTradeId: string;
  strategy: string | null;
  timeframe: string | null;
  confidence: number | null;
  entryPrice: number | null;
  qty: number | null;
} | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    let q = sb
      .from(TABLE)
      .select('local_trade_id, strategy, timeframe, confidence, entry_price, qty')
      .eq('status', 'open')
      .eq('symbol', symbol.toUpperCase())
      .order('opened_at', { ascending: true })
      .limit(1);
    q = accountId ? q.eq('account_id', accountId) : q.is('account_id', null);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    if (!data?.local_trade_id) return null;
    return {
      localTradeId: data.local_trade_id,
      strategy: data.strategy,
      timeframe: data.timeframe,
      confidence: data.confidence,
      entryPrice: data.entry_price,
      qty: data.qty,
    };
  } catch (e) {
    console.warn('[tradingTrades] matchOpenTradeForReconcile failed', e);
    return null;
  }
}

export async function listTrades(opts: {
  limit?: number;
  status?: 'open' | 'closed';
  accountId?: string;
  symbol?: string;
} = {}): Promise<TradeRecord[]> {
  try {
    const sb = getSupabase();
    if (!sb) return [];
    let q = sb
      .from(TABLE)
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.accountId) q = q.eq('account_id', opts.accountId);
    if (opts.symbol) q = q.eq('symbol', opts.symbol.toUpperCase());
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as TradeRecord[];
  } catch (e) {
    console.warn('[tradingTrades] listTrades failed', e);
    return [];
  }
}
