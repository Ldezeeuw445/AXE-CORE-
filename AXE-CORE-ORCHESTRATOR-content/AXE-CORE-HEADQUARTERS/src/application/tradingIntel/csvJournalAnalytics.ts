/**
 * csvJournalAnalytics — drop a broker trade-history CSV export (MT4/MT5
 * "Account History", or any export with the usual columns) and get instant
 * win-rate / profit-factor / drawdown / by-symbol / by-strategy analytics.
 *
 * There is no equivalent tool in AXE Companion to port — its journal only
 * syncs live via MetaAPI and computes thin tag-completion stats, no win
 * rate/profit factor/drawdown. This is new, purely client-side (no server,
 * no Node-only deps — just text parsing + arithmetic), which is exactly
 * what "instant" requires.
 *
 * Column names vary a lot between brokers/platforms, so parsing is
 * tolerant: it matches on a list of known aliases per field rather than
 * assuming one exact header row.
 */

export interface JournalTrade {
  symbol: string;
  side: 'buy' | 'sell' | null;
  volume: number | null;
  openTime: string | null;
  closeTime: string | null;
  openPrice: number | null;
  closePrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  commission: number;
  swap: number;
  profit: number;
  /** Free-text strategy/comment column, if the export has one — used for the by-strategy breakdown. */
  comment: string | null;
}

export interface JournalAnalytics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  netProfit: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  equityCurve: { time: string; equity: number }[];
  bySymbol: { symbol: string; trades: number; netProfit: number; winRate: number }[];
  byStrategy: { label: string; trades: number; netProfit: number; winRate: number }[];
  bySide: { side: string; trades: number; netProfit: number; winRate: number }[];
  /** The scoreboard: every (strategy, symbol) combination that's actually
   *  been traded, so "is Golden Pocket working on XAUUSD specifically" is
   *  answerable without cross-referencing byStrategy and bySymbol by hand. */
  byStrategyAndSymbol: { strategy: string; symbol: string; trades: number; netProfit: number; winRate: number }[];
  dateRange: { from: string | null; to: string | null };
}

const HEADER_ALIASES: Record<keyof Omit<JournalTrade, 'commission' | 'swap' | 'profit'>, string[]> = {
  symbol: ['symbol', 'item', 'instrument', 'pair'],
  side: ['type', 'side', 'direction', 'action'],
  volume: ['volume', 'lots', 'size', 'qty', 'quantity'],
  openTime: ['open time', 'opentime', 'time', 'date', 'open date'],
  closeTime: ['close time', 'closetime', 'close date'],
  openPrice: ['open price', 'price', 'entry price', 'entry'],
  closePrice: ['close price', 'exit price', 'exit'],
  stopLoss: ['s/l', 'sl', 'stop loss'],
  takeProfit: ['t/p', 'tp', 'take profit'],
  comment: ['comment', 'strategy', 'tag', 'label', 'notes'],
};
const PROFIT_ALIASES = ['profit', 'pnl', 'p/l', 'net profit', 'result'];
const COMMISSION_ALIASES = ['commission', 'comm'];
const SWAP_ALIASES = ['swap', 'rollover'];

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findCol(headers: string[], aliases: string[]): number {
  const normed = headers.map(norm);
  for (const alias of aliases) {
    const idx = normed.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Splits one CSV line respecting quoted fields (a plain split(',') breaks on "1,234.56" or quoted commas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function toNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const cleaned = v.replace(/[, ]/g, '').replace(/^\((.*)\)$/, '-$1'); // "(12.34)" → "-12.34"
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toSide(v: string | undefined): 'buy' | 'sell' | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s.startsWith('buy') || s === 'long' || s === '0') return 'buy';
  if (s.startsWith('sell') || s === 'short' || s === '1') return 'sell';
  return null;
}

export interface ParseCsvResult {
  ok: boolean;
  trades: JournalTrade[];
  error?: string;
  skippedRows: number;
}

/** Parses a raw CSV string (already read from the dropped File) into trade rows. */
export function parseJournalCsv(csvText: string): ParseCsvResult {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, trades: [], error: 'CSV has no data rows', skippedRows: 0 };
  }

  // Some MT5 exports use ';' or '\t' instead of ','. Detect from the header line.
  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t') ? '\t' : headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';
  const splitLine = delimiter === ',' ? splitCsvLine : (l: string) => l.split(delimiter);

  const headers = splitLine(headerLine).map(h => h.trim());
  const col = {
    symbol: findCol(headers, HEADER_ALIASES.symbol),
    side: findCol(headers, HEADER_ALIASES.side),
    volume: findCol(headers, HEADER_ALIASES.volume),
    openTime: findCol(headers, HEADER_ALIASES.openTime),
    closeTime: findCol(headers, HEADER_ALIASES.closeTime),
    openPrice: findCol(headers, HEADER_ALIASES.openPrice),
    closePrice: findCol(headers, HEADER_ALIASES.closePrice),
    stopLoss: findCol(headers, HEADER_ALIASES.stopLoss),
    takeProfit: findCol(headers, HEADER_ALIASES.takeProfit),
    comment: findCol(headers, HEADER_ALIASES.comment),
    profit: findCol(headers, PROFIT_ALIASES),
    commission: findCol(headers, COMMISSION_ALIASES),
    swap: findCol(headers, SWAP_ALIASES),
  };

  if (col.symbol === -1 || col.profit === -1) {
    return {
      ok: false,
      trades: [],
      error: `Couldn't find a Symbol + Profit column in the header row. Found: ${headers.join(', ')}`,
      skippedRows: 0,
    };
  }

  const trades: JournalTrade[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const symbol = (cells[col.symbol] || '').trim().toUpperCase();
    const profit = toNumber(cells[col.profit]);
    if (!symbol || profit == null) { skipped++; continue; }
    trades.push({
      symbol,
      side: toSide(cells[col.side]),
      volume: col.volume !== -1 ? toNumber(cells[col.volume]) : null,
      openTime: col.openTime !== -1 ? (cells[col.openTime] || '').trim() || null : null,
      closeTime: col.closeTime !== -1 ? (cells[col.closeTime] || '').trim() || null : null,
      openPrice: col.openPrice !== -1 ? toNumber(cells[col.openPrice]) : null,
      closePrice: col.closePrice !== -1 ? toNumber(cells[col.closePrice]) : null,
      stopLoss: col.stopLoss !== -1 ? toNumber(cells[col.stopLoss]) : null,
      takeProfit: col.takeProfit !== -1 ? toNumber(cells[col.takeProfit]) : null,
      commission: col.commission !== -1 ? (toNumber(cells[col.commission]) ?? 0) : 0,
      swap: col.swap !== -1 ? (toNumber(cells[col.swap]) ?? 0) : 0,
      profit,
      comment: col.comment !== -1 ? (cells[col.comment] || '').trim() || null : null,
    });
  }

  if (!trades.length) {
    return { ok: false, trades: [], error: 'No parseable trade rows found.', skippedRows: skipped };
  }
  return { ok: true, trades, skippedRows: skipped };
}

/**
 * demoTradesToJournalTrades — turns the agent's own fill history (the paper
 * book, which mirrors every trade regardless of venue — see brokerConnector
 * .brokerPlaceOrder's "mirror into local book for UI continuity") into
 * JournalTrade rows so computeJournalAnalytics() can run on the agent's
 * REAL activity automatically, with no CSV upload needed.
 *
 * DemoTrade is a raw fill (buy/sell qty @ price), not a closed round-trip
 * with its own profit — so this replays fills per symbol in time order,
 * average-costing the open side and realizing PnL only on the portion of
 * each fill that closes existing exposure (same idea as MT5's own realized
 * P/L: opening a position isn't a "trade" yet, closing it is).
 */
export function demoTradesToJournalTrades(
  trades: { id: string; symbol: string; side: 'buy' | 'sell'; qty: number; price: number; reason: string; strategy?: string; createdAt: string }[],
): JournalTrade[] {
  const sorted = [...trades].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const positions = new Map<string, { qty: number; avgPrice: number }>();
  const journal: JournalTrade[] = [];

  for (const t of sorted) {
    const pos = positions.get(t.symbol) ?? { qty: 0, avgPrice: 0 };
    const signedQty = t.side === 'buy' ? t.qty : -t.qty;
    const sameDirection = pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signedQty);

    if (sameDirection) {
      const newQty = pos.qty + signedQty;
      pos.avgPrice = newQty !== 0 ? (pos.avgPrice * pos.qty + t.price * signedQty) / newQty : 0;
      pos.qty = newQty;
    } else {
      const direction = pos.qty > 0 ? 1 : -1;
      const closingQty = Math.min(Math.abs(signedQty), Math.abs(pos.qty));
      const pnl = direction * (t.price - pos.avgPrice) * closingQty;
      journal.push({
        symbol: t.symbol,
        side: t.side,
        volume: closingQty,
        openTime: null,
        closeTime: t.createdAt,
        openPrice: pos.avgPrice,
        closePrice: t.price,
        stopLoss: null,
        takeProfit: null,
        commission: 0,
        swap: 0,
        profit: pnl,
        comment: t.strategy || null,
      });

      const remaining = Math.abs(signedQty) - closingQty;
      pos.qty = pos.qty - direction * closingQty;
      if (remaining > 0) {
        // The fill overshot the open position — the rest opens a new
        // position in the new direction (a "flip"), starting fresh at
        // this fill's price.
        pos.qty = signedQty > 0 ? remaining : -remaining;
        pos.avgPrice = t.price;
      }
    }
    positions.set(t.symbol, pos);
  }

  return journal;
}

/**
 * metaApiDealsToJournalTrades — the account's REAL closed-trade history,
 * ported directly from AXE Companion's normalizeDealsToClosedTrades
 * (src/lib/mt5/dealNormalization.ts): group raw MetaAPI deals by MT5
 * positionId, sum profit/commission/swap across the whole position's
 * in/out deals, take the first entry's open price/time and the last exit's
 * close price/time. This is what makes "his own book" reflect the actual
 * connected MT5 account instead of AXE's internal paper mirror — the paper
 * book only ever sees trades AXE itself placed through it, not the
 * account's real history (which can predate AXE connecting to it, or
 * include manual MT5 trades placed outside AXE entirely).
 */
export function metaApiDealsToJournalTrades(deals: MetaApiDealLike[]): JournalTrade[] {
  const isBuySellDeal = (d: MetaApiDealLike) => d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL';
  const inferSideFromOut = (out: MetaApiDealLike): 'buy' | 'sell' =>
    out.type === 'DEAL_TYPE_SELL' ? 'buy' : out.type === 'DEAL_TYPE_BUY' ? 'sell' : 'buy';

  const filtered = deals.filter(d => d.positionId && d.symbol && isBuySellDeal(d));

  const byPosition = new Map<string, MetaApiDealLike[]>();
  for (const d of filtered) {
    const pid = String(d.positionId);
    const arr = byPosition.get(pid) ?? [];
    arr.push(d);
    byPosition.set(pid, arr);
  }

  const journal: JournalTrade[] = [];
  for (const group of byPosition.values()) {
    group.sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')));

    const ins = group.filter(d => d.entryType === 'DEAL_ENTRY_IN' || d.entryType === 'DEAL_ENTRY_INOUT');
    const outs = group.filter(d => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_OUT_BY');
    if (!outs.length) continue; // still open — not a closed trade yet

    const firstIn = ins[0];
    const lastOut = outs[outs.length - 1];
    const side: 'buy' | 'sell' = firstIn?.type
      ? firstIn.type === 'DEAL_TYPE_BUY' ? 'buy' : firstIn.type === 'DEAL_TYPE_SELL' ? 'sell' : inferSideFromOut(lastOut)
      : inferSideFromOut(lastOut);

    let profit = 0;
    let fees = 0;
    for (const d of group) {
      profit += Number(d.profit ?? 0) || 0;
      fees += (Number(d.commission ?? 0) || 0) + (Number(d.swap ?? 0) || 0);
    }

    // The strategy tag rides on the OPENING deal's comment (see
    // brokerConnector.tradeComment: "AXE <strategy>"), best-effort since
    // some brokers strip/modify comments on their side.
    const openComment = firstIn?.comment ?? lastOut.comment ?? null;
    const strategyTag = openComment?.startsWith('AXE ') ? openComment.slice(4).trim() || null : null;

    journal.push({
      symbol: String(firstIn?.symbol ?? lastOut.symbol ?? '').toUpperCase(),
      side,
      volume: Number(firstIn?.volume ?? lastOut.volume ?? 0) || null,
      openTime: firstIn?.time ?? null,
      closeTime: lastOut.time ?? null,
      openPrice: firstIn?.price != null ? Number(firstIn.price) : null,
      closePrice: lastOut.price != null ? Number(lastOut.price) : null,
      stopLoss: null,
      takeProfit: null,
      commission: fees,
      swap: 0,
      profit,
      comment: strategyTag,
    });
  }
  return journal;
}

/** Minimal shape metaApiDealsToJournalTrades needs — matches metaApiService's MetaApiDeal. */
export interface MetaApiDealLike {
  type?: string;
  entryType?: string;
  symbol?: string;
  time?: string;
  volume?: number;
  price?: number;
  commission?: number;
  swap?: number;
  profit?: number;
  positionId?: string;
  comment?: string;
}

function groupBreakdown<K extends string>(
  trades: JournalTrade[],
  keyFn: (t: JournalTrade) => K | null,
): { key: K; trades: number; netProfit: number; winRate: number }[] {
  const groups = new Map<K, JournalTrade[]>();
  for (const t of trades) {
    const key = keyFn(t);
    if (key == null) continue;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .map(([key, arr]) => {
      const wins = arr.filter(t => t.profit > 0).length;
      return {
        key,
        trades: arr.length,
        netProfit: arr.reduce((s, t) => s + t.profit + t.commission + t.swap, 0),
        winRate: arr.length ? wins / arr.length : 0,
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit);
}

/** Computes full analytics from parsed trade rows — pure function, no I/O. */
export function computeJournalAnalytics(trades: JournalTrade[]): JournalAnalytics {
  const netOf = (t: JournalTrade) => t.profit + t.commission + t.swap;

  const sorted = [...trades].sort((a, b) => {
    const ta = a.closeTime ?? a.openTime ?? '';
    const tb = b.closeTime ?? b.openTime ?? '';
    return ta.localeCompare(tb);
  });

  const wins = trades.filter(t => netOf(t) > 0);
  const losses = trades.filter(t => netOf(t) < 0);
  const breakeven = trades.length - wins.length - losses.length;

  const grossProfit = wins.reduce((s, t) => s + netOf(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + netOf(t), 0));
  const netProfit = trades.reduce((s, t) => s + netOf(t), 0);

  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  let maxDDPct = 0;
  const equityCurve: { time: string; equity: number }[] = [];
  for (const t of sorted) {
    equity += netOf(t);
    peak = Math.max(peak, equity);
    const dd = peak - equity;
    maxDD = Math.max(maxDD, dd);
    if (peak > 0) maxDDPct = Math.max(maxDDPct, dd / peak);
    equityCurve.push({ time: t.closeTime ?? t.openTime ?? '', equity });
  }

  const bySymbol = groupBreakdown(trades, t => t.symbol).map(g => ({ symbol: g.key, trades: g.trades, netProfit: g.netProfit, winRate: g.winRate }));
  const byStrategy = groupBreakdown(trades, t => (t.comment && t.comment.length ? t.comment : null)).map(g => ({ label: g.key, trades: g.trades, netProfit: g.netProfit, winRate: g.winRate }));
  const bySide = groupBreakdown(trades, t => t.side).map(g => ({ side: g.key, trades: g.trades, netProfit: g.netProfit, winRate: g.winRate }));
  // Composite key, split back apart after — groupBreakdown only takes one key fn.
  const byStrategyAndSymbol = groupBreakdown(trades, t => (t.comment && t.comment.length ? `${t.comment}||${t.symbol}` : null))
    .map(g => {
      const [strategy, symbol] = g.key.split('||');
      return { strategy, symbol, trades: g.trades, netProfit: g.netProfit, winRate: g.winRate };
    });

  const times = trades.flatMap(t => [t.openTime, t.closeTime]).filter((v): v is string => !!v).sort();

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate: trades.length ? wins.length / trades.length : 0,
    netProfit,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    expectancy: trades.length ? netProfit / trades.length : 0,
    largestWin: wins.length ? Math.max(...wins.map(netOf)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map(netOf)) : 0,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    equityCurve,
    bySymbol,
    byStrategy,
    bySide,
    byStrategyAndSymbol,
    dateRange: { from: times[0] ?? null, to: times[times.length - 1] ?? null },
  };
}
