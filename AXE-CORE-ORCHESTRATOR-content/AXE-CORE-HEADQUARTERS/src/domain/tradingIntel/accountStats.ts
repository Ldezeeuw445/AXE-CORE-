/**
 * Per-account statistics over a chosen window, plus the day-by-day P&L the
 * calendar is drawn from.
 *
 * csvJournalAnalytics already computes the trade-level figures (win rate,
 * profit factor, average win and loss). What it cannot answer is anything
 * about TIME: how the account did this week versus this year, whether it is
 * on a losing run right now, and which single day carried the month. Those
 * are the questions a prop challenge is actually judged on.
 *
 * Pure: takes trades and a clock, returns numbers. No fetching, no storage.
 */
/**
 * The only part of a closed trade these statistics need.
 *
 * Declared here rather than imported from the journal in application/: domain
 * is the innermost layer and may not reach outward. Structural typing means
 * `ClosedTrade` satisfies this as-is, so callers pass their trades unchanged
 * and the rule costs nothing.
 */
export interface ClosedTrade {
  profit: number;
  commission?: number;
  swap?: number;
  openTime?: string | null;
  closeTime?: string | null;
}

export type StatsPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

export const PERIOD_LABELS: Record<StatsPeriod, string> = {
  day: '1 day',
  week: '1 week',
  month: '1 month',
  year: '1 year',
  all: 'All',
};

const PERIOD_DAYS: Record<Exclude<StatsPeriod, 'all'>, number> = {
  day: 1, week: 7, month: 30, year: 365,
};

/** The day a trade belongs to, as YYYY-MM-DD, keyed on when it CLOSED. */
export function dayKeyOf(trade: ClosedTrade): string | null {
  const iso = trade.closeTime ?? trade.openTime;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Local date, not UTC: a trading day is the day the trader was in.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Realised result of a trade, commission and swap included. */
export function netOf(trade: ClosedTrade): number {
  return (trade.profit ?? 0) + (trade.commission ?? 0) + (trade.swap ?? 0);
}

export function filterByPeriod(
  trades: ClosedTrade[], period: StatsPeriod, now = new Date(),
): ClosedTrade[] {
  if (period === 'all') return trades;
  const cutoff = now.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
  return trades.filter(t => {
    const iso = t.closeTime ?? t.openTime;
    if (!iso) return false;
    const ts = new Date(iso).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

/** Net result per calendar day, oldest key first. */
export function dailyPnl(trades: ClosedTrade[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of trades) {
    const k = dayKeyOf(t);
    if (!k) continue;
    out.set(k, (out.get(k) ?? 0) + netOf(t));
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export interface Streaks {
  currentWin: number;
  currentLoss: number;
  longestWin: number;
  longestLoss: number;
}

/**
 * Runs of winners and losers, counted on close time.
 *
 * "Current" means the run the account is on RIGHT NOW, so exactly one of
 * currentWin / currentLoss can be non-zero. Breakeven trades end a run
 * without starting one — a scratch is not a win.
 */
export function streaksOf(trades: ClosedTrade[]): Streaks {
  const ordered = [...trades]
    .filter(t => t.closeTime ?? t.openTime)
    .sort((a, b) => String(a.closeTime ?? a.openTime).localeCompare(String(b.closeTime ?? b.openTime)));

  let longestWin = 0, longestLoss = 0, runWin = 0, runLoss = 0;
  for (const t of ordered) {
    const net = netOf(t);
    if (net > 0) { runWin += 1; runLoss = 0; }
    else if (net < 0) { runLoss += 1; runWin = 0; }
    else { runWin = 0; runLoss = 0; }
    longestWin = Math.max(longestWin, runWin);
    longestLoss = Math.max(longestLoss, runLoss);
  }
  return { currentWin: runWin, currentLoss: runLoss, longestWin, longestLoss };
}

export interface DayExtreme {
  day: string;
  net: number;
}

/**
 * Consistency, the way a prop firm means it: how much of the profit came from
 * the single best day.
 *
 * 100% means every cent was made on one day, which is the pattern that fails a
 * challenge even when the total is green. Lower is better. Returns null when
 * the account is not profitable over the window — the ratio has no meaning
 * against a negative total, and showing one anyway would be a number that
 * looks like a grade.
 */
export function consistencyPct(daily: Map<string, number>): number | null {
  const values = [...daily.values()];
  const total = values.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const best = Math.max(...values);
  if (!(best > 0)) return null;
  return (best / total) * 100;
}

export interface AccountStats {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRatePct: number;
  lossRatePct: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  consistencyPct: number | null;
  streaks: Streaks;
  bestDay: DayExtreme | null;
  worstDay: DayExtreme | null;
  tradingDays: number;
}

export function computeAccountStats(
  trades: ClosedTrade[], period: StatsPeriod = 'all', now = new Date(),
): AccountStats {
  const inWindow = filterByPeriod(trades, period, now);
  const daily = dailyPnl(inWindow);

  let wins = 0, losses = 0, breakeven = 0, gross = 0, grossLoss = 0, net = 0;
  for (const t of inWindow) {
    const n = netOf(t);
    net += n;
    if (n > 0) { wins += 1; gross += n; }
    else if (n < 0) { losses += 1; grossLoss += Math.abs(n); }
    else breakeven += 1;
  }

  const days = [...daily.entries()];
  const best = days.length ? days.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
  const worst = days.length ? days.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;

  return {
    trades: inWindow.length,
    wins, losses, breakeven,
    winRatePct: inWindow.length ? (wins / inWindow.length) * 100 : 0,
    lossRatePct: inWindow.length ? (losses / inWindow.length) * 100 : 0,
    netPnl: net,
    avgWin: wins ? gross / wins : 0,
    avgLoss: losses ? grossLoss / losses : 0,
    // Infinity is not a profit factor. A window with no losing trade has no
    // ratio to report, and null renders as a dash instead of a fake perfect.
    profitFactor: grossLoss > 0 ? gross / grossLoss : null,
    consistencyPct: consistencyPct(daily),
    streaks: streaksOf(inWindow),
    bestDay: best ? { day: best[0], net: best[1] } : null,
    worstDay: worst ? { day: worst[0], net: worst[1] } : null,
    tradingDays: daily.size,
  };
}

/** Combine several accounts' daily P&L into one calendar. */
export function mergeDailyPnl(maps: Array<Map<string, number>>): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of maps) {
    for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v);
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export interface CalendarCell {
  day: string;
  /** Day of month, 1-based. */
  date: number;
  net: number | null;
  inMonth: boolean;
}

/**
 * A month laid out as weeks starting Monday, with leading and trailing blanks
 * so the columns line up under Mon–Sun.
 */
export function monthGrid(year: number, month: number, daily: Map<string, number>): CalendarCell[][] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay() is Sunday-based; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ day: '', date: 0, net: null, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: key, date: d, net: daily.has(key) ? daily.get(key)! : null, inMonth: true });
  }
  while (cells.length % 7 !== 0) cells.push({ day: '', date: 0, net: null, inMonth: false });

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
