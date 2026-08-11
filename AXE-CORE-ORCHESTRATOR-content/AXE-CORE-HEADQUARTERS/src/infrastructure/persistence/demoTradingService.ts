/**
 * demoTradingService — paper trading account for the AXE Trading Agent.
 * localStorage + settings mirror. Not live capital.
 */
import { saveSetting, loadSetting } from '@/infrastructure/persistence/userSettingsService';
import type { DemoAccount, DemoTrade, DemoPosition, DemoSide } from '@/domain/tradingIntel/demoTypes';
import { DEMO_START_CASH } from '@/domain/tradingIntel/demoTypes';
import { recordTradeOutcome } from '@/infrastructure/persistence/tradingLearningService';

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
    } else {
      acc.positions.push({
        symbol,
        qty,
        avgPrice: price,
        markPrice: price,
        updatedAt: new Date().toISOString(),
      });
    }
  } else {
    const existing = acc.positions.find(p => p.symbol === symbol);
    if (!existing || existing.qty < qty) {
      return { error: `Insufficient position to sell (have ${existing?.qty ?? 0})` };
    }
    realizedPnl = (price - existing.avgPrice) * qty;
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
    void recordTradeOutcome({
      symbol,
      pnl: realizedPnl,
      confidence: input.confidence,
      tradeId: trade.id,
      exitReason: input.reason,
    }).catch(() => { /* non-fatal */ });
  }

  return { account: acc, trade };
}

export function positionFor(acc: DemoAccount, symbol: string): DemoPosition | undefined {
  return acc.positions.find(p => p.symbol === symbol.toUpperCase());
}
