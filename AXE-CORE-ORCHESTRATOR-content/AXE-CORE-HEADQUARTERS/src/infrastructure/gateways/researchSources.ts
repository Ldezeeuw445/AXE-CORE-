/**
 * researchSources — the real-world inputs the research desk reasons about.
 *
 * Two providers, deliberately used in completely different ways, because their
 * limits are completely different:
 *
 *   EODHD   — the workhorse. Per-pair headlines and end-of-day history, called
 *             as often as research runs. Verified 2026-08-21: XAUUSD.FOREX
 *             returns fresh, instrument-specific headlines ("XAU/USD testing
 *             three-month highs near $4,600", matching the 4594 MetaAPI was
 *             quoting the same minute) and 51 daily bars back to July.
 *             NOT the economic calendar — that endpoint answers "Only EOD data
 *             allowed for free users" on this plan, so it is not wired and not
 *             pretended.
 *
 *   Perigon — a scarce, high-quality macro read. Luka's limit is four or five
 *             calls A DAY to stay inside the monthly plan, and the autopilot
 *             runs ninety-six cycles a day. Calling it per pair would spend a
 *             month of budget in an hour.
 *
 * So Perigon is a DAILY MACRO SWEEP, fetched once and shared by every pair's
 * research for the rest of the day, behind a hard counter that survives restart
 * and is shared between the desktop app and the phone. The budget is enforced
 * in code because a limit that lives only in a comment is not a limit.
 *
 * Every call records what happened — which source, whether it answered, how
 * long it took — so the funnel can show what the desk actually used and what
 * is still working, rather than what is merely configured.
 */
import { loadDurableConfig, saveDurableConfig } from '@/infrastructure/persistence/durableConfigService';

export interface ResearchSourceKeys {
  eodhd?: string;
  perigon?: string;
  /** Massive, formerly Polygon.io. */
  polygon?: string;
}

/**
 * AXE pair -> Polygon ticker. Forex takes C:, crypto takes X:, indices I:.
 * Verified 2026-08-21: C:XAUUSD returned 17 daily bars closing at 4526.08.
 */
const POLYGON_TICKERS: Record<string, string> = {
  XAUUSD: 'C:XAUUSD', XAGUSD: 'C:XAGUSD',
  EURUSD: 'C:EURUSD', GBPUSD: 'C:GBPUSD', USDJPY: 'C:USDJPY',
  USDCHF: 'C:USDCHF', AUDUSD: 'C:AUDUSD', NZDUSD: 'C:NZDUSD', USDCAD: 'C:USDCAD',
  BTCUSD: 'X:BTCUSD', ETHUSD: 'X:ETHUSD', LTCUSD: 'X:LTCUSD',
};

export function polygonTickerFor(pair: string): string | null {
  return POLYGON_TICKERS[pair.trim().toUpperCase()] ?? null;
}

/**
 * Daily bars from Massive/Polygon, for backtests that want deeper history than
 * the broker serves.
 *
 * DELAYED DATA, AND THAT IS THE WHOLE POINT OF THIS COMMENT. The plan answers
 * `status: DELAYED` — roughly a quarter of an hour behind. That is ideal for
 * history and worthless for a live decision, and this project has already paid
 * once for blurring that line: the chart's synthetic fallback seeded gold at
 * 100 and the agent wrote real BUY/SELL calls against it. Live pricing goes
 * through fetchTradeableSnapshot and nothing else. This is research only.
 */
export async function fetchPolygonDaily(
  pair: string,
  from: string,
  to: string,
): Promise<Array<{ t: number; o: number; h: number; l: number; c: number }>> {
  const { polygon } = await getResearchSourceKeys();
  const ticker = polygonTickerFor(pair);
  if (!polygon || !ticker) return [];
  const started = Date.now();
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}`
      + `/range/1/day/${encodeURIComponent(from)}/${encodeURIComponent(to)}`
      + `?apiKey=${encodeURIComponent(polygon)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json() as { results?: Array<Record<string, number>> };
    const bars = (d.results ?? []).map(r => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c }));
    await recordHealth('polygon', {
      at: new Date().toISOString(), ok: true, ms: Date.now() - started,
      detail: `${bars.length} daily bar(s) for ${ticker} (delayed — research only)`,
    });
    return bars;
  } catch (e) {
    await recordHealth('polygon', {
      at: new Date().toISOString(), ok: false, ms: Date.now() - started,
      detail: e instanceof Error ? e.message.slice(0, 120) : 'failed',
    });
    return [];
  }
}

export interface NewsItem {
  title: string;
  at: string;
  source: string;
}

export interface SourceHealth {
  /** ISO timestamp of the last attempt. */
  at: string;
  ok: boolean;
  ms: number;
  /** Short reason when it failed, or what came back when it worked. */
  detail: string;
  /** Only meaningful for budgeted sources. */
  usedToday?: number;
  dailyCap?: number;
}

const KEY_KEYS = 'research_sources';
const KEY_BUDGET = 'research_budget';
const KEY_HEALTH = 'research_health';

/**
 * Four, not five, and now grounded rather than guessed.
 *
 * /v1/limits reports the real plan: requestLimit 150, resetAt monthly. That is
 * 150/31 = 4.8 a day, which is exactly why Luka said "four or five". Taking the
 * lower number leaves room for a manual run from the Research tab without
 * breaking the month, and an unused call costs nothing.
 *
 * This is only the LOCAL guard. The authority is Perigon's own counter — see
 * perigonLimits(), which is free to call and therefore cannot itself be the
 * thing that runs the budget down.
 */
export const PERIGON_DAILY_CAP = 4;

export interface PerigonLimits {
  used: number;
  limit: number;
  resetAt: string;
}

/**
 * The provider's own meter, and it costs nothing to read.
 *
 * Verified 2026-08-21: three consecutive /v1/limits calls left requestsUsed at
 * 1, and a 404 from an endpoint outside the plan did not increment it either.
 * So this can be polled for the funnel as often as the page renders.
 *
 * Reading the real counter also removes the race a local tally would have had:
 * desktop and phone are separate processes with separate storage, and the only
 * number both of them can agree on is the one Perigon keeps.
 */
export async function perigonLimits(): Promise<PerigonLimits | null> {
  const { perigon } = await getResearchSourceKeys();
  if (!perigon) return null;
  try {
    const res = await fetch(`https://api.perigon.io/v1/limits?apiKey=${encodeURIComponent(perigon)}`);
    if (!res.ok) return null;
    const body = await res.json() as { data?: Record<string, unknown> };
    const d = body.data ?? {};
    const used = Number(d.requestsUsed);
    const limit = Number(d.requestLimit);
    if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;
    return { used, limit, resetAt: String(d.resetAt ?? '') };
  } catch {
    return null;
  }
}

/** How long a macro sweep stays good. One trading day. */
const MACRO_TTL_MS = 20 * 60 * 60_000;

export async function getResearchSourceKeys(): Promise<ResearchSourceKeys> {
  return loadDurableConfig<ResearchSourceKeys>(KEY_KEYS, {});
}

export async function saveResearchSourceKeys(keys: ResearchSourceKeys): Promise<void> {
  await saveDurableConfig(KEY_KEYS, keys);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type BudgetRow = { date: string; used: number };

/**
 * Reserve one call against a source's daily allowance.
 *
 * Reserves BEFORE the call rather than counting after it, so a request that
 * hangs or throws still costs its slot — the provider counted it either way,
 * and a counter that only increments on success will overspend exactly when
 * things are going wrong.
 *
 * Known limit: desktop and phone read-modify-write the same row, so two
 * simultaneous reservations can collide and spend one slot twice. At four a
 * day, on a source fetched once and cached, that is a rounding error rather
 * than a risk worth a locking scheme.
 */
async function reserveDailyCall(source: string, cap: number): Promise<boolean> {
  const all = await loadDurableConfig<Record<string, BudgetRow>>(KEY_BUDGET, {});
  const row = all[source];
  const fresh: BudgetRow = row && row.date === today() ? row : { date: today(), used: 0 };
  if (fresh.used >= cap) return false;
  fresh.used += 1;
  await saveDurableConfig(KEY_BUDGET, { ...all, [source]: fresh });
  return true;
}

export async function budgetUsedToday(source: string): Promise<number> {
  const all = await loadDurableConfig<Record<string, BudgetRow>>(KEY_BUDGET, {});
  const row = all[source];
  return row && row.date === today() ? row.used : 0;
}

async function recordHealth(source: string, health: SourceHealth): Promise<void> {
  const all = await loadDurableConfig<Record<string, SourceHealth>>(KEY_HEALTH, {});
  await saveDurableConfig(KEY_HEALTH, { ...all, [source]: health });
}

/** What the funnel reads to show which sources are actually feeding the desk. */
export async function researchSourceHealth(): Promise<Record<string, SourceHealth>> {
  const health = await loadDurableConfig<Record<string, SourceHealth>>(KEY_HEALTH, {});
  const perigon = health.perigon;
  if (perigon) {
    perigon.usedToday = await budgetUsedToday('perigon');
    perigon.dailyCap = PERIGON_DAILY_CAP;
  }
  return health;
}

/**
 * AXE's canonical pair id -> EODHD's ticker.
 *
 * Verified against the live key on 2026-08-21 rather than assumed: FX and
 * metals take .FOREX, crypto takes -USD.CC, and NAS100 is NDX.INDX. GSPC.INDX
 * and DJI.INDX both errored on this plan, so US500 and US30/DJ30 are absent
 * here and simply return no headlines — which the desk already handles, and
 * which is honest about the gap rather than mapping them to something adjacent.
 */
const EODHD_TICKERS: Record<string, string> = {
  XAUUSD: 'XAUUSD.FOREX',
  XAGUSD: 'XAGUSD.FOREX',
  EURUSD: 'EURUSD.FOREX',
  GBPUSD: 'GBPUSD.FOREX',
  USDJPY: 'USDJPY.FOREX',
  USDCHF: 'USDCHF.FOREX',
  AUDUSD: 'AUDUSD.FOREX',
  NZDUSD: 'NZDUSD.FOREX',
  USDCAD: 'USDCAD.FOREX',
  BTCUSD: 'BTC-USD.CC',
  ETHUSD: 'ETH-USD.CC',
  LTCUSD: 'LTC-USD.CC',
  NAS100: 'NDX.INDX',
};

export function eodhdTickerFor(pair: string): string | null {
  return EODHD_TICKERS[pair.trim().toUpperCase()] ?? null;
}

/** Headlines for one instrument. Empty is a real answer, not a failure. */
export async function fetchPairNews(pair: string, limit = 5): Promise<NewsItem[]> {
  const { eodhd } = await getResearchSourceKeys();
  const ticker = eodhdTickerFor(pair);
  if (!eodhd || !ticker) return [];

  const started = Date.now();
  try {
    const url = `https://eodhd.com/api/news?api_token=${encodeURIComponent(eodhd)}`
      + `&s=${encodeURIComponent(ticker)}&limit=${limit}&fmt=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw: unknown = await res.json();
    const items = Array.isArray(raw)
      ? raw.map(r => {
          const o = r as Record<string, unknown>;
          return {
            title: String(o.title ?? '').slice(0, 220),
            at: String(o.date ?? ''),
            source: 'eodhd',
          };
        }).filter(n => n.title)
      : [];
    await recordHealth('eodhd', {
      at: new Date().toISOString(), ok: true, ms: Date.now() - started,
      detail: `${items.length} headline(s) for ${ticker}`,
    });
    return items;
  } catch (e) {
    await recordHealth('eodhd', {
      at: new Date().toISOString(), ok: false, ms: Date.now() - started,
      detail: e instanceof Error ? e.message.slice(0, 120) : 'failed',
    });
    return [];
  }
}

/** Daily end-of-day bars, for backtests that want more history than the broker gives. */
export async function fetchEodHistory(
  pair: string,
  from: string,
): Promise<Array<{ date: string; open: number; high: number; low: number; close: number }>> {
  const { eodhd } = await getResearchSourceKeys();
  const ticker = eodhdTickerFor(pair);
  if (!eodhd || !ticker) return [];
  try {
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(ticker)}`
      + `?api_token=${encodeURIComponent(eodhd)}&period=d&fmt=json&from=${encodeURIComponent(from)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) return [];
    return raw
      .map(r => r as Record<string, unknown>)
      .filter(o => Number.isFinite(Number(o.close)))
      .map(o => ({
        date: String(o.date ?? ''),
        open: Number(o.open), high: Number(o.high),
        low: Number(o.low), close: Number(o.close),
      }));
  } catch {
    return [];
  }
}

type MacroCache = { at: number; brief: string };

/**
 * One macro read a day, shared by every pair.
 *
 * The query is deliberately narrow. A broad "gold OR XAUUSD" against Perigon
 * returned German rap coverage and an Oregon transport story in its first three
 * results — with four calls a day there is no budget to spend on a query that
 * has to be filtered afterwards.
 */
export async function fetchMacroBrief(): Promise<string> {
  const cached = await loadDurableConfig<MacroCache | null>('research_macro', null);
  if (cached && Date.now() - cached.at < MACRO_TTL_MS) return cached.brief;

  const { perigon } = await getResearchSourceKeys();
  if (!perigon) return '';

  // Ask the provider's own meter first — free, authoritative, and the only
  // number desktop and phone can both agree on. If the month is spent, no
  // local counter can make another call succeed.
  const limits = await perigonLimits();
  if (limits && limits.used >= limits.limit) {
    await recordHealth('perigon', {
      at: new Date().toISOString(), ok: false, ms: 0,
      detail: `monthly plan spent (${limits.used}/${limits.limit}), resets ${limits.resetAt.slice(0, 10)}`,
    });
    return cached?.brief ?? '';
  }

  if (!(await reserveDailyCall('perigon', PERIGON_DAILY_CAP))) {
    await recordHealth('perigon', {
      at: new Date().toISOString(), ok: true, ms: 0,
      detail: `daily cap of ${PERIGON_DAILY_CAP} reached — serving the cached sweep`,
    });
    return cached?.brief ?? '';
  }

  const started = Date.now();
  try {
    const q = '(federal reserve OR inflation OR interest rates OR gold price OR bitcoin price)';
    // /v1/all, not /v1/articles or /v1/stories: both of those answer 404 on
    // this plan (checked 2026-08-21, and a 404 does not spend a request).
    const url = 'https://api.perigon.io/v1/all'
      + `?apiKey=${encodeURIComponent(perigon)}`
      + `&q=${encodeURIComponent(q)}`
      + '&category=Business&language=en&size=8&sortBy=date';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { articles?: Array<Record<string, unknown>> };
    const lines = (data.articles ?? [])
      .map(a => `- ${String(a.title ?? '').slice(0, 160)} (${String((a.source as Record<string, unknown>)?.domain ?? '')})`)
      .filter(l => l.length > 6);
    const brief = lines.length ? ['## MACRO (Perigon, today)', ...lines].join('\n') : '';
    await saveDurableConfig('research_macro', { at: Date.now(), brief } satisfies MacroCache);
    const after = await perigonLimits();
    await recordHealth('perigon', {
      at: new Date().toISOString(), ok: true, ms: Date.now() - started,
      detail: after
        ? `${lines.length} macro headline(s) · ${after.used}/${after.limit} this month`
        : `${lines.length} macro headline(s)`,
    });
    return brief;
  } catch (e) {
    await recordHealth('perigon', {
      at: new Date().toISOString(), ok: false, ms: Date.now() - started,
      detail: e instanceof Error ? e.message.slice(0, 120) : 'failed',
    });
    // The slot is spent either way — see reserveDailyCall. Serve the last good
    // sweep rather than nothing.
    return cached?.brief ?? '';
  }
}
