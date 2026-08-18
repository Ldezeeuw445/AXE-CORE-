/**
 * tradingLedgerService — AXE Algo's "what works where" brain.
 *
 * The trading agent used to dump everything (decisions, cycles, lessons) into
 * one recency-ordered pile under global_memory/system_event, with no `strategy`
 * dimension — so it literally could not answer "which strategy actually works
 * for EURUSD vs XAUUSD?". This is the structured foundation that fixes that:
 * ONE durable row per (pair × strategy), holding the real live-trade track
 * record plus the latest self-test (backtest) prior, so per-pair strategy
 * selection and the growing Obsidian scorecards can all read one clean source.
 *
 * Storage: global_memory, its OWN category `trading_memory` (deliberately NOT
 * the system_event dumping ground), key `tl:<PAIR>:<strategy>`. memUpsert
 * upserts on (user_id, key), so each close read-modify-writes its own row in
 * place instead of appending. Autopilot runs symbols sequentially, so
 * same-key concurrent writes don't realistically race; a rare lost update on
 * one bucket is self-correcting as more trades land.
 */
import {
  saveGlobalMemory,
  loadGlobalMemories,
  type GlobalMemoryEntry,
} from '@/infrastructure/persistence/globalMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';

const CATEGORY = 'trading_memory';
const PREFIX = 'tl:';

/** Min live trades before the live record outweighs the backtest prior. */
export const MIN_LIVE_SAMPLE = 5;

export interface LedgerBacktestPrior {
  netReturnPct: number;
  winRate: number;
  profitFactor: number;
  trades: number;
  timeframe: string;
  bars: number;
  at: string;
}

export interface LedgerEntry {
  pair: string;
  strategy: string;
  // ── live track record (real demo/MT5 fills) ──
  trades: number;
  wins: number;
  losses: number;
  /** Sum of winning trades' return fractions (e.g. +0.012 = +1.2%). */
  grossWinPct: number;
  /** Sum of losing trades' return fractions (negative). */
  grossLossPct: number;
  /** Sum of every trade's return fraction — the simple net edge. */
  netReturnPct: number;
  lastTradeAt?: string;
  firstTradeAt?: string;
  // ── latest self-test (backtest) prior ──
  backtest?: LedgerBacktestPrior;
  updatedAt: string;
}

/** Read-side stats derived from the raw counters (never stored). */
export interface LedgerStats extends LedgerEntry {
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  /** Expected return per trade — the ranking metric. */
  expectancy: number;
  /** How much to trust the ranking: 0 (untested) … 1 (well-sampled). */
  confidence: number;
}

function normPair(p: string): string {
  return p.trim().toUpperCase();
}
function normStrategy(s: string | undefined): string {
  const v = (s ?? '').trim();
  return v || 'unspecified';
}
function ledgerKey(pair: string, strategy: string): string {
  return `${PREFIX}${normPair(pair)}:${normStrategy(strategy)}`;
}

function emptyEntry(pair: string, strategy: string | undefined): LedgerEntry {
  return {
    pair: normPair(pair),
    strategy: normStrategy(strategy),
    trades: 0, wins: 0, losses: 0,
    grossWinPct: 0, grossLossPct: 0, netReturnPct: 0,
    updatedAt: new Date().toISOString(),
  };
}

/** Derive read-side stats + a ranking metric from a raw entry. */
export function ledgerStats(e: LedgerEntry): LedgerStats {
  const winRate = e.trades > 0 ? e.wins / e.trades : 0;
  const avgWinPct = e.wins > 0 ? e.grossWinPct / e.wins : 0;
  const avgLossPct = e.losses > 0 ? e.grossLossPct / e.losses : 0;
  const profitFactor = e.grossLossPct < 0 ? e.grossWinPct / Math.abs(e.grossLossPct) : e.grossWinPct > 0 ? Infinity : 0;

  // Ranking metric: expected return per trade. Prefer the live record once
  // there's a real sample; before that, lean on the backtest prior (discounted,
  // because a clean backtest still isn't a live fill). Untested = 0.
  const liveExpectancy = e.trades > 0 ? e.netReturnPct / e.trades : 0;
  const btExpectancy = e.backtest && e.backtest.trades > 0 ? e.backtest.netReturnPct / e.backtest.trades : 0;
  const liveWeight = Math.min(e.trades / MIN_LIVE_SAMPLE, 1);
  const expectancy = liveWeight * liveExpectancy + (1 - liveWeight) * (btExpectancy * 0.7);

  // Confidence in this ranking: mostly from live sample size, a little from
  // having any backtest at all.
  const confidence = Math.min(1, e.trades / 30) * 0.8 + (e.backtest ? 0.2 : 0);

  return { ...e, winRate, avgWinPct, avgLossPct, profitFactor, expectancy, confidence };
}

function parseEntry(row: GlobalMemoryEntry): LedgerEntry | null {
  try {
    const e = JSON.parse(row.value) as LedgerEntry;
    return e && e.pair && e.strategy ? e : null;
  } catch {
    return null;
  }
}

async function loadAll(): Promise<LedgerEntry[]> {
  const rows = await loadGlobalMemories(AXE_USER_ID, CATEGORY, 500);
  return rows
    .filter(r => (r.key || '').startsWith(PREFIX))
    .map(parseEntry)
    .filter((e): e is LedgerEntry => e !== null);
}

async function persist(entry: LedgerEntry): Promise<void> {
  entry.updatedAt = new Date().toISOString();
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: CATEGORY,
    key: ledgerKey(entry.pair, entry.strategy),
    value: JSON.stringify(entry),
    confidence: Math.min(1, entry.trades / 30),
    metadata: { pair: entry.pair, strategy: entry.strategy, trades: entry.trades, kind: 'ledger' },
  });
}

/** All ledger entries, optionally filtered to one pair, newest-updated first. */
export async function getLedger(pair?: string): Promise<LedgerStats[]> {
  const all = await loadAll();
  const filtered = pair ? all.filter(e => e.pair === normPair(pair)) : all;
  return filtered
    .map(ledgerStats)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function getLedgerEntry(pair: string, strategy: string): Promise<LedgerStats | null> {
  const all = await loadAll();
  const found = all.find(e => e.pair === normPair(pair) && e.strategy === normStrategy(strategy));
  return found ? ledgerStats(found) : null;
}

/** Record one CLOSED live trade's outcome against its (pair, strategy) bucket. */
export async function recordLedgerTrade(input: {
  pair: string;
  strategy?: string;
  /** Realized return as a fraction of entry notional, e.g. +0.012 = +1.2%. */
  returnPct: number;
}): Promise<void> {
  const all = await loadAll();
  const existing = all.find(e => e.pair === normPair(input.pair) && e.strategy === normStrategy(input.strategy));
  const e = existing ?? emptyEntry(input.pair, input.strategy);
  const r = Number.isFinite(input.returnPct) ? input.returnPct : 0;

  e.trades += 1;
  if (r > 0) { e.wins += 1; e.grossWinPct += r; }
  else if (r < 0) { e.losses += 1; e.grossLossPct += r; }
  e.netReturnPct += r;
  const now = new Date().toISOString();
  e.lastTradeAt = now;
  if (!e.firstTradeAt) e.firstTradeAt = now;

  await persist(e);
}

/** Store the latest self-test (backtest) prior for a (pair, strategy). */
export async function recordLedgerBacktest(input: {
  pair: string;
  strategy: string;
  backtest: LedgerBacktestPrior;
}): Promise<void> {
  const all = await loadAll();
  const existing = all.find(e => e.pair === normPair(input.pair) && e.strategy === normStrategy(input.strategy));
  const e = existing ?? emptyEntry(input.pair, input.strategy);
  e.backtest = input.backtest;
  await persist(e);
}

export interface StrategyRanking {
  strategy: string;
  stats: LedgerStats | null;
  score: number;
  tested: boolean;
}

/**
 * Rank candidate strategies for a pair, best first. Score = expectancy from
 * the ledger (live once sampled, else discounted backtest). Untested
 * candidates get a small positive exploration nudge so a strategy with no data
 * yet is tried occasionally rather than ignored forever — but never above a
 * candidate with a genuine positive live edge.
 */
export async function rankStrategiesForPair(pair: string, candidates: string[]): Promise<StrategyRanking[]> {
  const all = await loadAll();
  const EXPLORE_SCORE = 0.0005; // tiny: below any real positive edge, above a proven negative one
  const ranked = candidates.map(strategy => {
    const raw = all.find(e => e.pair === normPair(pair) && e.strategy === normStrategy(strategy));
    const stats = raw ? ledgerStats(raw) : null;
    const tested = !!stats && (stats.trades > 0 || !!stats.backtest);
    const score = tested && stats ? stats.expectancy : EXPLORE_SCORE;
    return { strategy, stats, score, tested };
  });
  return ranked.sort((a, b) => b.score - a.score);
}

/** The single best strategy to trade a pair with right now, or null if no
 *  candidates. Callers still gate on their own risk rules. */
export async function bestStrategyForPair(pair: string, candidates: string[]): Promise<string | null> {
  if (!candidates.length) return null;
  const ranked = await rankStrategiesForPair(pair, candidates);
  return ranked[0]?.strategy ?? null;
}
