/**
 * demoTradingService — paper trading account for the AXE Trading Agent.
 * localStorage + settings mirror. Not live capital.
 */
import { saveSetting, loadSetting } from '@/infrastructure/persistence/userSettingsService';
import type { DemoAccount, DemoTrade, DemoPosition, DemoSide } from '@/domain/tradingIntel/demoTypes';
import { DEMO_START_CASH } from '@/domain/tradingIntel/demoTypes';
import { recordTradeOutcome } from '@/infrastructure/persistence/tradingLearningService';
import { recordTradeOpened, updateOpenTrade, recordTradeClosed } from '@/infrastructure/persistence/tradingTradesService';

const KEY = 'axe_demo_trading_account';

function emptyAccount(): DemoAccount {
  const now = new Date().toISOString();
  return {
    cash: DEMO_START_CASH,
    currency: 'USD',
    positions: [],
    trades: [],
    startedAt: now,
    updatedAt: now,
  };
}

function loadLocal(): DemoAccount {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw.cash === 'number') return raw as DemoAccount;
  } catch { /* ignore */ }
  return emptyAccount();
}

function saveLocal(acc: DemoAccount): void {
  localStorage.setItem(KEY, JSON.stringify(acc));
  void saveSetting(KEY, acc);
}

export async function getDemoAccount(): Promise<DemoAccount> {
  const cloud = await loadSetting<DemoAccount | null>(KEY, null);
  if (cloud && typeof cloud.cash === 'number') {
    localStorage.setItem(KEY, JSON.stringify(cloud));
    return cloud;
  }
  const local = loadLocal();
  if (!localStorage.getItem(KEY)) saveLocal(local);
  return local;
}

export async function resetDemoAccount(): Promise<DemoAccount> {
  const acc = emptyAccount();
  saveLocal(acc);
  return acc;
}

export function equity(acc: DemoAccount): number {
  const pos = acc.positions.reduce((s, p) => s + p.qty * (p.markPrice ?? p.avgPrice), 0);
  return acc.cash + pos;
}

export function unrealizedPnl(acc: DemoAccount): number {
  return acc.positions.reduce((s, p) => {
    const mark = p.markPrice ?? p.avgPrice;
    return s + (mark - p.avgPrice) * p.qty;
  }, 0);
}

export async function markPositions(
  marks: Record<string, number>,
): Promise<DemoAccount> {
  const acc = await getDemoAccount();
  acc.positions = acc.positions.map(p => ({
    ...p,
    markPrice: marks[p.symbol] ?? p.markPrice,
    updatedAt: new Date().toISOString(),
  }));
  acc.updatedAt = new Date().toISOString();
  saveLocal(acc);
  return acc;
}

export async function executeDemoTrade(input: {
  symbol: string;
  side: DemoSide;
  qty: number;
  price: number;
  reason: string;
  confidence: number;
  intelReportId?: string;
  strategy?: string;
  /** The timeframe the decision was taken on — one of the five things every
   *  trade row must show. */
  timeframe?: string;
  stopLoss?: number | null;
  takeProfit?: number | null;
  /** Which account this fill actually belongs to, when known (MetaAPI-mirrored
   *  fills only — the paper book itself has no account of its own). Threaded
   *  through so core_trading_trades records the real account instead of
   *  showing every fill as pure paper. */
  accountId?: string | null;
  accountLabel?: string | null;
  venue?: 'paper' | 'metaapi';
}): Promise<{ account: DemoAccount; trade: DemoTrade } | { error: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  const qty = Math.abs(Number(input.qty));
  const price = Number(input.price);
  if (!symbol || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
    return { error: 'Invalid symbol, qty, or price' };
  }

  const acc = await getDemoAccount();
  const notional = qty * price;
  // Set only when this fill closes (fully or partially) existing exposure —
  // this app never opens shorts (risk.allowShort defaults false, enforced in
  // tradingAgentEngine), so every 'sell' fill here is a close against an
  // existing long, never a fresh short. That's what makes "realized PnL on
  // the closing qty, at the existing avgPrice" correct without needing full
  // FIFO/flip handling.
  let realizedPnl: number | null = null;
  /** Realized return as a fraction of the closed leg's entry notional. */
  let realizedReturnPct: number | null = null;
  /** Snapshot of the position as it stood BEFORE this fill mutated/removed
   *  it — the close-time reporting below (recordTradeOutcome and the
   *  core_trading_trades close) has to describe the ORIGINAL entry decision,
   *  not this closing call's own strategy/confidence/reason. */
  let closedEntrySnapshot: DemoPosition | null = null;
  let openedPositionId: string | null = null;
  /** Set when an averaging buy folds into an already-open row, so the trades
   *  table row can be kept in sync rather than left stale. */
  let averagedPositionId: string | null = null;
  let averagedQty: number | null = null;
  let averagedEntryPrice: number | null = null;

  if (input.side === 'buy') {
    if (notional > acc.cash + 1e-9) {
      return { error: `Insufficient cash (need ${notional.toFixed(2)}, have ${acc.cash.toFixed(2)})` };
    }
    acc.cash -= notional;
    const existing = acc.positions.find(p => p.symbol === symbol);
    if (existing) {
      const totalQty = existing.qty + qty;
      existing.avgPrice = (existing.avgPrice * existing.qty + price * qty) / totalQty;
      existing.qty = totalQty;
      existing.markPrice = price;
      existing.updatedAt = new Date().toISOString();
      averagedPositionId = existing.id ?? null;
      averagedQty = existing.qty;
      averagedEntryPrice = existing.avgPrice;
    } else {
      openedPositionId = crypto.randomUUID?.() ?? `pos-${Date.now()}`;
      acc.positions.push({
        symbol,
        qty,
        avgPrice: price,
        markPrice: price,
        updatedAt: new Date().toISOString(),
        // Entry snapshot — carried so the eventual close reports what was
        // actually decided when this position opened, not whatever the
        // closing call happens to pass in.
        id: openedPositionId,
        strategy: input.strategy,
        timeframe: input.timeframe,
        reason: input.reason.slice(0, 500),
        confidence: input.confidence,
        intelReportId: input.intelReportId,
        stopLoss: input.stopLoss ?? null,
        takeProfit: input.takeProfit ?? null,
        openedAt: new Date().toISOString(),
      });
    }
  } else {
    const existing = acc.positions.find(p => p.symbol === symbol);
    if (!existing || existing.qty < qty) {
      return { error: `Insufficient position to sell (have ${existing?.qty ?? 0})` };
    }
    closedEntrySnapshot = { ...existing };
    realizedPnl = (price - existing.avgPrice) * qty;
    realizedReturnPct = existing.avgPrice > 0 ? (price - existing.avgPrice) / existing.avgPrice : null;
    acc.cash += notional;
    existing.qty -= qty;
    existing.markPrice = price;
    existing.updatedAt = new Date().toISOString();
    if (existing.qty <= 1e-12) {
      acc.positions = acc.positions.filter(p => p.symbol !== symbol);
    }
  }

  const trade: DemoTrade = {
    id: crypto.randomUUID?.() ?? `dt-${Date.now()}`,
    symbol,
    side: input.side,
    qty,
    price,
    notional,
    status: 'filled',
    reason: input.reason.slice(0, 500),
    intelReportId: input.intelReportId,
    confidence: input.confidence,
    strategy: input.strategy,
    // Carried so the row can show all five. Without it the local book showed a
    // timeframe-less trade next to MT5 rows that had one, on the same screen.
    timeframe: input.timeframe,
    createdAt: new Date().toISOString(),
  };
  acc.trades = [trade, ...acc.trades].slice(0, 200);
  acc.updatedAt = new Date().toISOString();
  saveLocal(acc);

  // Feed the close back into the learning loop — this is what makes
  // "self-improving" actually true instead of dead code. Fire-and-forget:
  // the trade itself already succeeded, a learning-write hiccup shouldn't
  // fail the fill.
  if (realizedPnl != null) {
    // Report the ORIGINAL entry decision, not this closing call's own
    // strategy/confidence/timeframe — those describe why the position is
    // being closed, not what opened it. Falls back to the closing call's
    // values only when no entry snapshot exists (a position opened before
    // this snapshot existed, or rebuilt from a broker fill).
    const entryStrategy = closedEntrySnapshot?.strategy ?? input.strategy;
    const entryTimeframe = closedEntrySnapshot?.timeframe ?? input.timeframe;
    const entryConfidence = closedEntrySnapshot?.confidence ?? input.confidence;
    const openTradeId = closedEntrySnapshot?.id ?? trade.id;
    void recordTradeOutcome({
      symbol,
      pnl: realizedPnl,
      confidence: entryConfidence,
      tradeId: openTradeId,
      exitReason: input.reason,
      strategy: entryStrategy,
      timeframe: entryTimeframe,
      returnPct: realizedReturnPct ?? undefined,
      side: 'buy', // the demo book never opens shorts — every close is against a long
      account: input.accountLabel ?? undefined,
    }).catch(() => { /* non-fatal */ });

    void recordTradeClosed({
      localTradeId: closedEntrySnapshot?.id ?? null,
      accountId: input.accountId ?? null,
      accountLabel: input.accountLabel ?? null,
      venue: input.venue ?? 'paper',
      symbol,
      side: 'buy',
      qty,
      entryPrice: closedEntrySnapshot?.avgPrice,
      exitPrice: price,
      strategy: entryStrategy,
      timeframe: entryTimeframe,
      confidence: entryConfidence,
      pnl: realizedPnl,
      returnPct: realizedReturnPct ?? undefined,
      exitReason: input.reason,
    }).catch(() => { /* non-fatal */ });
  } else if (openedPositionId) {
    // Fresh position — write the open half of the journal row now, so it
    // already exists (status 'open') by the time the eventual close arrives.
    void recordTradeOpened({
      localTradeId: openedPositionId,
      accountId: input.accountId ?? null,
      accountLabel: input.accountLabel ?? null,
      venue: input.venue ?? 'paper',
      symbol,
      side: 'buy',
      qty,
      entryPrice: price,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      strategy: input.strategy,
      timeframe: input.timeframe,
      confidence: input.confidence,
      rationale: input.reason,
      intelReportId: input.intelReportId,
    }).catch(() => { /* non-fatal */ });
  } else if (averagedPositionId && averagedQty != null && averagedEntryPrice != null) {
    // Averaging into an already-open position — keep its trades-table row's
    // qty/entry_price in sync rather than leaving it describing only the
    // first fill.
    void updateOpenTrade(averagedPositionId, {
      qty: averagedQty,
      entryPrice: averagedEntryPrice,
    }).catch(() => { /* non-fatal */ });
  }

  return { account: acc, trade };
}

export function positionFor(acc: DemoAccount, symbol: string): DemoPosition | undefined {
  return acc.positions.find(p => p.symbol === symbol.toUpperCase());
}
