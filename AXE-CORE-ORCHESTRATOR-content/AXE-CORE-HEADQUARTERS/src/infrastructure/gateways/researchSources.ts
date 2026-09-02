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
import { marketToolCall } from '@/infrastructure/gateways/axeCoreApiService';

export interface ResearchSourceKeys {
  eodhd?: string;
  perigon?: string;
  /** Massive, formerly Polygon.io. */
  polygon?: string;
  /** Financial Modeling Prep. */
  fmp?: string;
  /** sec-api.io — filings and full-text search. */
  sec?: string;
  /** Unusual Whales — options flow. Also read by unusualWhalesGateway. */
  unusualwhales?: string;
  /** TwelveData, called directly rather than through the VPS tool. */
  twelvedata?: string;
  /** FRED (St. Louis Fed) — the US economic release schedule. Free. */
  fred?: string;
}

/**
 * Every source the desk can hold a key for, with what it is actually for.
 *
 * A list, not a scattering of optional fields, because the panel has to be able
 * to show a source that has NO key as clearly as one that has. Three keys sat
 * in this store working (or failing) for weeks with nothing on any screen
 * saying so — Perigon answering, EODHD out of quota, Massive never once tried.
 */
export const RESEARCH_SOURCES: Array<{
  id: keyof ResearchSourceKeys;
  label: string;
  what: string;
  /** false = no key needed at all. */
  needsKey: boolean;
}> = [
  { id: 'perigon', label: 'Perigon', what: 'Macro and market headlines', needsKey: true },
  { id: 'polygon', label: 'Massive', what: 'Daily OHLC for FX, metals and crypto', needsKey: true },
  { id: 'eodhd', label: 'EODHD', what: 'End-of-day history and per-pair news', needsKey: true },
  { id: 'twelvedata', label: 'TwelveData', what: 'Intraday candles, called directly', needsKey: true },
  { id: 'unusualwhales', label: 'Unusual Whales', what: 'Options flow and premium', needsKey: true },
  { id: 'fmp', label: 'FMP', what: 'Quotes and fundamentals', needsKey: true },
  { id: 'sec', label: 'SEC', what: 'Filings and full-text search', needsKey: true },
  { id: 'fred', label: 'FRED', what: 'US economic release schedule (funnel phase 2)', needsKey: true },
];

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
  // Spent is not broken. Recorded as ok:true with the budget attached so the
  // panel shows an allowance rather than a red failure — the same distinction
  // fetchPairNews already makes, now applied to the source that lacked it.
  if (!(await reserveDailyCall('polygon', SOURCE_DAILY_CAPS.polygon))) {
    await recordHealth('polygon', {
      at: new Date().toISOString(), ok: true, ms: 0,
      detail: `Daily allowance of ${SOURCE_DAILY_CAPS.polygon} spent — resumes at midnight UTC`,
    });
    return [];
  }
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
const KEY_CALENDAR = 'research_calendar';

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

/**
 * Give a slot back when the provider never saw the request.
 *
 * reserveDailyCall charges BEFORE the call, and its comment explains why: a
 * request that hangs or throws still cost the provider one, so counting only
 * successes overspends exactly when things are going wrong. That reasoning
 * holds for a request that reached the provider. It does not hold for one that
 * never left — a tool that is not registered on the API box, or a fetch the
 * browser refused.
 *
 * Measured 2026-08-27: FRED's allowance of six was spent entirely by attempts
 * that never reached FRED — first the CORS-blocked direct calls, then the calls
 * to a tool the box did not yet have. By the time the route worked, the desk was
 * locked out until midnight UTC over requests the provider had never served.
 *
 * Only for that case. A provider that answered with an error answered, and
 * keeps its charge.
 */
async function releaseDailyCall(source: string): Promise<void> {
  const all = await loadDurableConfig<Record<string, BudgetRow>>(KEY_BUDGET, {});
  const row = all[source];
  if (!row || row.date !== today() || row.used <= 0) return;
  await saveDurableConfig(KEY_BUDGET, { ...all, [source]: { ...row, used: row.used - 1 } });
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
  // Every budgeted source, not just the one that happened to be named here.
  // The budget row is attached even when a source has never been called today,
  // because "0 of 12 used" and "no budget at all" are different answers and
  // only one of them means the screen is missing something.
  const all = await loadDurableConfig<Record<string, BudgetRow>>(KEY_BUDGET, {});
  const stamp = today();
  for (const [source, cap] of Object.entries(SOURCE_DAILY_CAPS)) {
    const row = health[source];
    if (!row) continue;
    const used = all[source];
    row.usedToday = used && used.date === stamp ? used.used : 0;
    row.dailyCap = cap;
  }
  return health;
}

/** The allowance for a source, or null when it is not budgeted. */
export function dailyCapFor(source: string): number | null {
  return SOURCE_DAILY_CAPS[source] ?? null;
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

/**
 * How many EODHD calls a day the desk may spend.
 *
 * The free plan allows twenty. Twenty. This was called once per pair per
 * research run with no guard at all, and the registry holds thirty pairs — so
 * a single cycle could exhaust the entire day before the second pair was
 * scored, and every call after that came back as a failure the panel showed in
 * red. A second key does not fix that; it buys twenty more and loses them the
 * same way.
 *
 * Twelve, not twenty, so a manual probe from the Data sources panel and a
 * couple of retries still have room. What is left over is worth more than one
 * extra headline.
 */
export const EODHD_DAILY_CAP = 12;

/**
 * Every budgeted source's daily allowance, in one place.
 *
 * The caps existed before this table did, scattered next to the call sites,
 * and researchSourceHealth() surfaced exactly one of them — Perigon, by name,
 * hardcoded. So EODHD had a real cap that no screen could show, and four
 * sources had no cap at all: when one of those stopped answering there was no
 * way to tell "today's allowance is spent" from "this provider is down", which
 * are the two states that need opposite responses. One is waiting until
 * midnight; the other is a key or a provider to fix.
 *
 * Adding a source here is what makes its budget visible. The numbers are
 * deliberately conservative — a research desk that runs a month of allowance
 * into an afternoon is the failure this whole mechanism exists to prevent.
 */
export const SOURCE_DAILY_CAPS: Record<string, number> = {
  perigon: PERIGON_DAILY_CAP,
  eodhd: EODHD_DAILY_CAP,
  // Daily bars for research context; one call per pair per day is plenty and
  // the result is cached for the calendar day anyway.
  polygon: 40,
  // The release schedule changes once a day at most, and the result is cached
  // for the calendar day, so the whole desk needs a handful of calls. The rest
  // of the allowance is headroom for a manual probe from the panel.
  fred: 6,
};

/** Headlines already fetched today, keyed by pair. */
const KEY_EODHD_NEWS_CACHE = 'eodhd_news_today';
interface NewsCacheRow { date: string; items: NewsItem[] }

/**
 * Headlines for one instrument. Empty is a real answer, not a failure.
 *
 * Cached for the calendar day and budgeted. Headlines for a pair do not change
 * often enough to be worth a second call, and on a twenty-a-day plan the
 * second call is the one that costs you the evening.
 */
/**
 * The next week of US economic releases, for the funnel's macro-agenda phase.
 *
 * ## Why this source
 *
 * Phase 2 has reported "unavailable" since it was written, so every pair passed
 * the agenda check unexamined. Measured 2026-08-27 against this desk's keys:
 * Finnhub 403, FMP 402, EODHD 403 ("Only EOD data allowed for free users"),
 * TwelveData sells its calendar separately. FRED answers, costs nothing, and
 * publishes the schedule the US agencies actually work to.
 *
 * ## A week, not 48 hours
 *
 * The funnel only asks about the next 48 hours, but fetching a week and
 * caching it for the day means a cycle at 23:50 still sees tomorrow's print.
 * A 48-hour fetch cached for a day goes blind at exactly the wrong moment.
 *
 * The names are returned verbatim; deciding which of them matter belongs to
 * domain/tradingIntel/economicCalendar.ts, where it can be tested against the
 * near-identical regional releases FRED publishes beside the real ones.
 */
/**
 * The next week of US economic releases, for the funnel's macro-agenda phase.
 *
 * ## Why this goes through the API box and not straight to FRED
 *
 * It went straight to FRED first, and the app recorded the result: ok:false
 * after 15.7s, "Load failed". FRED answers a plain curl in 0.36s with 31 KB,
 * and sends no access-control-allow-origin header at all — so the browser
 * refuses to expose the response and WebKit reports that generic message.
 * EODHD and Polygon work from here precisely because they do send it. No amount
 * of retrying fixes a missing CORS header.
 *
 * The API box has no such restriction and already holds a working FRED key
 * (the fred_macro tool answers). So this asks the box, which is also where the
 * key belongs.
 *
 * ## Why this source at all
 *
 * Phase 2 reported "unavailable" since it was written, so every pair passed the
 * agenda check unexamined. Measured 2026-08-27 against this desk's keys:
 * Finnhub 403, FMP 402, EODHD 403 ("Only EOD data allowed for free users"),
 * TwelveData sells its calendar separately. FRED answers and costs nothing.
 *
 * ## Six weeks, not 48 hours, and not a week either
 *
 * The funnel only asks about the next 48 hours, and the first version fetched
 * seven days on the reasoning that a cycle at 23:50 must still see tomorrow's
 * print. Seven turned out to be too few. These releases are monthly: measured
 * 2026-08-27, the next high-impact date was 2026-09-04 — eight days out — so a
 * week-long window came back empty, and an empty list means "not checked", not
 * "nothing due". Phase 2 went on reporting itself unavailable while the data
 * was working.
 *
 * Six weeks always contains at least one of each monthly release, so the funnel
 * can answer "nothing inside 48 hours" as a fact rather than a shrug. It costs
 * nothing extra: the same six calls, cached for the calendar day.
 *
 * The names come back verbatim; deciding which of them matter belongs to
 * domain/tradingIntel/economicCalendar.ts, where it is tested against the
 * near-identical regional releases FRED publishes beside the real ones.
 */
export async function fetchEconomicReleases(): Promise<Array<{ date: string; name: string }>> {
  const cached = await loadDurableConfig<{ date: string; events: Array<{ date: string; name: string }> } | null>(
    KEY_CALENDAR, null);
  if (cached && cached.date === today()) return cached.events;

  if (!(await reserveDailyCall('fred', SOURCE_DAILY_CAPS.fred))) {
    await recordHealth('fred', {
      at: new Date().toISOString(), ok: true, ms: 0,
      detail: `Daily allowance of ${SOURCE_DAILY_CAPS.fred} spent — resumes at midnight UTC`,
    });
    return cached?.events ?? [];
  }

  const started = Date.now();
  try {
    const res = await marketToolCall<{ release_dates?: Array<{ date?: string; release_name?: string }> }>(
      'fred_calendar', { days: 45 });

    if (!res.ok) {
      // The tool is registered on the box or it is not, and "not registered"
      // is a setup step rather than an outage. Saying which one saves the next
      // person the fifteen minutes this cost.
      const missing = /unknown tool|not found|unsupported/i.test(res.error ?? '');
      // FRED never saw this one, so it must not cost a slot — see releaseDailyCall.
      // A FRED HTTP error is different: it answered, and keeps its charge.
      const neverReachedFred = missing || !/fred/i.test(res.error ?? '');
      if (neverReachedFred) await releaseDailyCall('fred');
      await recordHealth('fred', {
        at: new Date().toISOString(), ok: false, ms: Date.now() - started,
        detail: missing
          ? 'fred_calendar is not registered on the API box yet — see fix-fred-calendar.sh'
          : (res.error ?? 'FRED calendar unavailable'),
      });
      return cached?.events ?? [];
    }

    const events = (res.data?.release_dates ?? [])
      .filter(r => r.date && r.release_name)
      .map(r => ({ date: String(r.date), name: String(r.release_name) }));

    await saveDurableConfig(KEY_CALENDAR, { date: today(), events });
    await recordHealth('fred', {
      at: new Date().toISOString(), ok: true, ms: Date.now() - started,
      detail: `${events.length} release date(s) over the next 45 days`,
    });
    return events;
  } catch (e) {
    // Threw before any answer: the request never left, so it costs nothing.
    await releaseDailyCall('fred');
    await recordHealth('fred', {
      at: new Date().toISOString(), ok: false, ms: Date.now() - started,
      detail: e instanceof Error ? e.message : 'unreachable',
    });
    // Yesterday's schedule beats no schedule: release dates are published well
    // in advance and barely move, so a stale copy still answers the question.
    return cached?.events ?? [];
  }
}

export async function fetchPairNews(pair: string, limit = 5): Promise<NewsItem[]> {
  const { eodhd } = await getResearchSourceKeys();
  const ticker = eodhdTickerFor(pair);
  if (!eodhd || !ticker) return [];

  // Already asked today? Serve it back rather than spending a slot.
  const cache = await loadDurableConfig<Record<string, NewsCacheRow>>(KEY_EODHD_NEWS_CACHE, {});
  const cached = cache[ticker];
  if (cached && cached.date === today()) return cached.items;

  if (!(await reserveDailyCall('eodhd', EODHD_DAILY_CAP))) {
    // Spent, not broken. The panel must show a budget, not a red failure —
    // they call for very different reactions.
    await recordHealth('eodhd', {
      at: new Date().toISOString(), ok: true, ms: 0,
      detail: `daily budget spent (${EODHD_DAILY_CAP}/${EODHD_DAILY_CAP}) — resets at midnight`,
    });
    return [];
  }

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
    await saveDurableConfig(KEY_EODHD_NEWS_CACHE, {
      ...cache, [ticker]: { date: today(), items },
    });
    const used = await budgetUsedToday('eodhd');
    await recordHealth('eodhd', {
      at: new Date().toISOString(), ok: true, ms: Date.now() - started,
      detail: `${items.length} headline(s) for ${ticker} · ${used}/${EODHD_DAILY_CAP} used today`,
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

/**
 * Ask one source, cheaply, whether it is actually working — and write down the
 * answer.
 *
 * "Is the key set" is not the question worth asking; every one of these keys
 * was set. Measured 2026-08-25, asking them instead gave: Massive, Unusual
 * Whales, SEC and TwelveData answering with real data; EODHD refusing with
 * HTTP 402 (daily limit spent, key perfectly valid); FMP refusing with 403
 * because the v3 quote endpoint it used is a legacy route that no longer
 * serves this plan.
 *
 * Those are four different states and only one of them is "broken key". A
 * panel that showed a tick per configured key would have called all seven fine.
 */
export async function probeResearchSource(id: keyof ResearchSourceKeys): Promise<SourceHealth> {
  const keys = await getResearchSourceKeys();
  const k = keys[id];
  const started = Date.now();
  const done = (ok: boolean, detail: string): SourceHealth => ({
    ok, detail, ms: Date.now() - started, at: new Date().toISOString(),
  });

  if (!k) return done(false, 'No key set');

  // FRED cannot be probed from here: it sends no CORS header, so a direct fetch
  // fails as "Load failed" no matter how good the key is — which would read as
  // a broken key and send someone off to regenerate a working one. Ask the API
  // box, which is where this key is actually used.
  if (id === 'fred') {
    try {
      const res = await marketToolCall<{ release_dates?: unknown[] }>('fred_calendar', { days: 1 });
      if (!res.ok) {
        return done(false, /unknown tool|not found|unsupported/i.test(res.error ?? '')
          ? 'fred_calendar is not registered on the API box yet'
          : (res.error ?? 'FRED unavailable'));
      }
      return done(true, `${(res.data?.release_dates ?? []).length} release date(s) tomorrow`);
    } catch (e) {
      return done(false, e instanceof Error ? e.message : 'API box unreachable');
    }
  }

  const urls: Record<keyof ResearchSourceKeys, string> = {
    perigon: `https://api.perigon.io/v1/limits?apiKey=${encodeURIComponent(k)}`,
    polygon: `https://api.polygon.io/v2/aggs/ticker/C:XAUUSD/prev?apiKey=${encodeURIComponent(k)}`,
    eodhd: `https://eodhd.com/api/eod/XAUUSD.FOREX?api_token=${encodeURIComponent(k)}&period=d&fmt=json&from=2026-08-24`,
    twelvedata: `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1h&outputsize=1&apikey=${encodeURIComponent(k)}`,
    // FMP's v3 quote route answers 403 on this plan; /stable/ is the current one.
    fmp: `https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${encodeURIComponent(k)}`,
    sec: `https://api.sec-api.io?token=${encodeURIComponent(k)}`,
    unusualwhales: 'https://api.unusualwhales.com/api/option-trades/flow-alerts?limit=1',
    // Never used — the fred branch above returns before this map is read. Kept
    // because the type requires every key, and as the record of why: FRED sends
    // no CORS header, so this URL cannot be fetched from the app at all.
    fred: '',
  };

  try {
    const res = await fetch(urls[id], id === 'unusualwhales'
      ? { headers: { Authorization: `Bearer ${k}`, Accept: 'application/json' } }
      : undefined);
    const text = (await res.text()).slice(0, 200);
    if (!res.ok) {
      // The provider's own words. "402 daily limit spent" and "403 legacy
      // endpoint" need completely different fixes, and a generic failure
      // message hides which one you are looking at.
      const health = done(false, `HTTP ${res.status} — ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
      await recordHealth(id, health);
      return health;
    }
    const health = done(true, text.replace(/\s+/g, ' ').slice(0, 100));
    await recordHealth(id, health);
    return health;
  } catch (e) {
    // A browser-side fetch that never reaches the provider fails here, and it
    // looks nothing like a refusal — say which it was.
    const health = done(false, `Unreachable from the app — ${e instanceof Error ? e.message : String(e)}`);
    await recordHealth(id, health);
    return health;
  }
}
