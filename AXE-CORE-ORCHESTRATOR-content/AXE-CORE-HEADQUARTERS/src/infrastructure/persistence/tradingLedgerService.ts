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
import { canonicalTimeframe, DEFAULT_TIMEFRAME } from '@/domain/tradingIntel/timeframes';
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
  /** Which timeframe this record is about. Absent on rows written before
   *  timeframes were a choice — those are h1 by definition. */
  timeframe: string;
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
/**
 * Timeframes are a dimension the algo chooses, so they belong in the identity.
 *
 * Everything written before 2026-08-19 was self-tested at h1 and only at h1 —
 * selfTestPairs had it hard-coded — so a key with no timeframe segment IS an h1
 * record, and reading it as such keeps the existing track record intact instead
 * of orphaning it under a new key shape.
 */
export { DEFAULT_TIMEFRAME };

/**
 * Canonicalise, do not merely lowercase.
 *
 * Lowercasing let '1h' and 'h1' become two ledger keys for the same hour --
 * AXE's own strategies on one, every framework row on the other, never
 * comparable and drawn grey because the colour table is keyed 'h1'. Anything
 * unrecognised falls back to the default rather than inventing a key, which is
 * the same rule rows written before timeframes existed already follow.
 */
function normTf(tf: string | undefined): string {
  return canonicalTimeframe(tf) ?? DEFAULT_TIMEFRAME;
}

function ledgerKey(pair: string, strategy: string, timeframe?: string): string {
  return `${PREFIX}${normPair(pair)}:${normStrategy(strategy)}:${normTf(timeframe)}`;
}

function emptyEntry(pair: string, strategy: string | undefined, timeframe?: string): LedgerEntry {
  return {
    pair: normPair(pair),
    strategy: normStrategy(strategy),
    timeframe: normTf(timeframe),
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
    if (!e || !e.pair || !e.strategy) return null;
    // Rows written before timeframes were a choice carry none. They were all
    // produced at h1 — selfTestPairs had it hard-coded — so reading them as h1
    // keeps the 115 live trades already recorded attached to a real timeframe
    // instead of stranding them under a key shape nothing looks up any more.
    if (!e.timeframe) e.timeframe = DEFAULT_TIMEFRAME;
    // Heal the rows the framework self-test wrote as '1h'. Their stored KEY
    // still says :1h, so they cannot be looked up by the canonical key any
    // more -- but read as h1 they still carry a real backtest prior, and
    // loadAll dedupes so the stale one loses to whatever wrote h1 last.
    e.timeframe = normTf(e.timeframe);
    return e;
  } catch {
    return null;
  }
}

async function loadAll(): Promise<LedgerEntry[]> {
  const rows = await loadGlobalMemories(AXE_USER_ID, CATEGORY, 500);
  const parsed = rows
    .filter(r => (r.key || '').startsWith(PREFIX))
    .map(parseEntry)
    .filter((e): e is LedgerEntry => e !== null);

  // Two stored keys can now canonicalise onto one row -- the ':1h' rows the
  // framework self-test used to write and the ':h1' rows everything else
  // writes. Reading both would show the same (pair, strategy, hour) twice and
  // let a stale prior outrank a fresh one. Newest write wins; the loser is a
  // superseded backtest prior, never live trades, because live outcomes were
  // only ever recorded against the canonical key.
  const best = new Map<string, LedgerEntry>();
  for (const e of parsed) {
    const k = `${e.pair}:${e.strategy}:${e.timeframe}`;
    const prev = best.get(k);
    if (!prev || Date.parse(e.updatedAt) > Date.parse(prev.updatedAt)) best.set(k, e);
  }
  return [...best.values()];
}

async function persist(entry: LedgerEntry): Promise<void> {
  entry.updatedAt = new Date().toISOString();
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: CATEGORY,
    key: ledgerKey(entry.pair, entry.strategy, entry.timeframe),
    value: JSON.stringify(entry),
    confidence: Math.min(1, entry.trades / 30),
    metadata: { pair: entry.pair, strategy: entry.strategy, timeframe: entry.timeframe, trades: entry.trades, kind: 'ledger' },
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
  /** Which timeframe the decision was taken on. Defaults to h1 for callers
   *  that do not know it yet. */
  timeframe?: string;
  /** Realized return as a fraction of the account, e.g. +0.012 = +1.2%. */
  returnPct: number;
}): Promise<void> {
  const all = await loadAll();
  const existing = all.find(e =>
    e.pair === normPair(input.pair)
    && e.strategy === normStrategy(input.strategy)
    && e.timeframe === normTf(input.timeframe));
  const e = existing ?? emptyEntry(input.pair, input.strategy, input.timeframe);
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
  // The prior belongs to the timeframe it was measured on. Matching without it
  // meant an m15 self-test overwrote the h1 one for the same pair+strategy, so
  // only the last timeframe tested ever survived — which is precisely the
  // comparison the algo now needs to make.
  const tf = normTf(input.backtest?.timeframe);
  const existing = all.find(e =>
    e.pair === normPair(input.pair)
    && e.strategy === normStrategy(input.strategy)
    && e.timeframe === tf);
  const e = existing ?? emptyEntry(input.pair, input.strategy, tf);
  e.backtest = input.backtest;
  await persist(e);
}

export interface StrategyRanking {
  strategy: string;
  /** Which timeframe this score is for. */
  timeframe: string;
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
export async function rankStrategiesForPair(
  pair: string,
  candidates: string[],
  timeframes: string[] = [DEFAULT_TIMEFRAME],
): Promise<StrategyRanking[]> {
  const all = await loadAll();
  const EXPLORE_SCORE = 0.0005; // tiny: below any real positive edge, above a proven negative one
  const ranked: StrategyRanking[] = [];
  // Strategy AND timeframe are both things the algo picks, so both are ranked.
  // The same strategy can be an edge on one timeframe and noise on another;
  // scoring only the strategy averaged that away and made the choice look
  // worse than it was.
  for (const strategy of candidates) {
    for (const timeframe of timeframes) {
      const raw = all.find(e =>
        e.pair === normPair(pair)
        && e.strategy === normStrategy(strategy)
        && e.timeframe === normTf(timeframe));
      const stats = raw ? ledgerStats(raw) : null;
      const tested = !!stats && (stats.trades > 0 || !!stats.backtest);
      const score = tested && stats ? stats.expectancy : EXPLORE_SCORE;
      ranked.push({ strategy, timeframe: normTf(timeframe), stats, score, tested });
    }
  }
  return ranked.sort((a, b) => b.score - a.score);
}

export async function bestStrategyForPair(pair: string, candidates: string[]): Promise<string | null> {
  if (!candidates.length) return null;
  const ranked = await rankStrategiesForPair(pair, candidates);
  return ranked[0]?.strategy ?? null;
}
