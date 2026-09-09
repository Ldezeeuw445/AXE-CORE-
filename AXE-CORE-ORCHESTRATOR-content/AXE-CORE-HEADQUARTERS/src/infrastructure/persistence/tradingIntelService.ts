/**
 * tradingIntelService — persistence for Trading Intel reports & watchlist.
 * localStorage primary + userSettings mirror (same pattern as income ledger).
 */
import { saveSetting, loadSetting } from '@/infrastructure/persistence/userSettingsService';
import type {
  TradingIntelReport,
  TradingIntelWatchlistItem,
  TradingSignal,
  AssetClass,
  IntelSource,
  IntelStatus,
} from '@/domain/tradingIntel/types';

const REPORTS_KEY = 'axe_trading_intel_reports';
const WATCH_KEY = 'axe_trading_intel_watchlist';

// A research cycle's whole write (report body + remember() thesis) hinges on
// this call landing. Found live 2026-09-09: every research run since 5 sep
// failed silently right here — the reports array had grown unbounded (77
// reports, ~1MB) and setItem() started throwing once WebKit's ~5MB quota was
// hit. That throw propagated straight out of upsertIntelReport() and aborted
// finishResearch() before it ever reached remember(), so nothing was saved
// and nothing was logged — the autopilot's own catch only console.warn'd it.
// Same failure class already fixed in userSettingsService.ts's
// writeLocalCopy() after the 2026-08-27 quota crash; ported here now that a
// second, independent report array hit the same ceiling. MAX_REPORTS below
// keeps it from refilling.
const MAX_REPORTS = 150;

function writeLocalCopy(key: string, json: string): boolean {
  try {
    localStorage.setItem(key, json);
    return true;
  } catch (e) {
    console.warn(
      `[tradingIntelService] local cache full — "${key}" kept only in the durable copy:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

function loadLocalReports(): TradingIntelReport[] {
  try {
    const raw = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveLocalReports(reports: TradingIntelReport[]): void {
  const capped = [...reports].sort(sortReports).slice(0, MAX_REPORTS);
  writeLocalCopy(REPORTS_KEY, JSON.stringify(capped));
  void saveSetting(REPORTS_KEY, capped);
}

function loadLocalWatch(): TradingIntelWatchlistItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveLocalWatch(items: TradingIntelWatchlistItem[]): void {
  writeLocalCopy(WATCH_KEY, JSON.stringify(items));
  void saveSetting(WATCH_KEY, items);
}

function sortReports(a: TradingIntelReport, b: TradingIntelReport): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

// Found live: 37 of 70 reports permanently stuck at status:'running', empty
// thesis, flat 50% confidence — runTradingResearch() writes this placeholder
// immediately, then only overwrites it with real content once the crew (or
// local fallback) actually finishes. Quitting the app mid-cycle (a rebuild/
// reinstall, a crash, the Mac sleeping) abandons that in-flight call, and
// nothing ever completes the write — the placeholder sits there forever
// looking like a real, live, low-confidence report. A real cycle finishes
// well under a minute even on the slow crew path, so anything still
// "running" after 5 minutes was abandoned, not slow.
const STALE_RUNNING_MS = 5 * 60_000;

function pruneStaleRunning(reports: TradingIntelReport[]): { pruned: TradingIntelReport[]; removed: number } {
  const now = Date.now();
  const pruned = reports.filter(r => {
    if (r.status !== 'running') return true;
    const started = Date.parse(r.createdAt);
    return Number.isFinite(started) && now - started < STALE_RUNNING_MS;
  });
  return { pruned, removed: reports.length - pruned.length };
}

export async function listIntelReports(): Promise<TradingIntelReport[]> {
  const fromCloud = await loadSetting<TradingIntelReport[]>(REPORTS_KEY, []);
  const source = Array.isArray(fromCloud) && fromCloud.length > 0 ? fromCloud : loadLocalReports();
  const { pruned, removed } = pruneStaleRunning(source);
  if (removed > 0) {
    console.warn(`[tradingIntelService] pruned ${removed} report(s) stuck in "running" — abandoned mid-cycle, not a real result`);
    saveLocalReports(pruned);
  } else if (Array.isArray(fromCloud) && fromCloud.length > 0) {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(fromCloud));
  }
  return [...pruned].sort(sortReports);
}

export async function getIntelReport(id: string): Promise<TradingIntelReport | null> {
  const all = await listIntelReports();
  return all.find(r => r.id === id) ?? null;
}

export async function upsertIntelReport(
  report: TradingIntelReport,
): Promise<TradingIntelReport> {
  const all = await listIntelReports();
  const idx = all.findIndex(r => r.id === report.id);
  const next = { ...report, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  saveLocalReports(all);
  return next;
}

export async function deleteIntelReport(id: string): Promise<void> {
  const all = (await listIntelReports()).filter(r => r.id !== id);
  saveLocalReports(all);
}

export async function archiveIntelReport(id: string): Promise<TradingIntelReport | null> {
  const r = await getIntelReport(id);
  if (!r) return null;
  return upsertIntelReport({ ...r, status: 'archived' as IntelStatus });
}

export async function listWatchlist(): Promise<TradingIntelWatchlistItem[]> {
  const fromCloud = await loadSetting<TradingIntelWatchlistItem[]>(WATCH_KEY, []);
  if (Array.isArray(fromCloud) && fromCloud.length > 0) {
    localStorage.setItem(WATCH_KEY, JSON.stringify(fromCloud));
    return fromCloud;
  }
  return loadLocalWatch();
}

export async function addToWatchlist(input: {
  ticker: string;
  name?: string;
  assetClass?: AssetClass;
  notes?: string;
}): Promise<TradingIntelWatchlistItem> {
  const ticker = input.ticker.trim().toUpperCase();
  const items = await listWatchlist();
  if (items.some(i => i.ticker === ticker)) {
    return items.find(i => i.ticker === ticker)!;
  }
  const item: TradingIntelWatchlistItem = {
    ticker,
    name: input.name,
    assetClass: input.assetClass ?? inferAssetClass(ticker),
    notes: input.notes,
    addedAt: new Date().toISOString(),
  };
  items.unshift(item);
  saveLocalWatch(items);
  return item;
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  const items = (await listWatchlist()).filter(
    i => i.ticker !== ticker.trim().toUpperCase(),
  );
  saveLocalWatch(items);
}

export function inferAssetClass(ticker: string): AssetClass {
  const t = ticker.toUpperCase();
  if (/-USD$|-USDT$|BTC|ETH|SOL|XRP|BNB/.test(t) || t.includes('-')) return 'crypto';
  if (/^[A-Z]{6}$/.test(t) || /USD$|EUR$|JPY$/.test(t)) return 'forex';
  if (/^\^|SPY|QQQ|IWM|DIA/.test(t)) return 'index';
  return 'equity';
}

export interface IntelStats {
  total: number;
  complete: number;
  bySignal: Record<TradingSignal, number>;
  bySource: Record<string, number>;
  watchCount: number;
  latestAsOf?: string;
}

export function summarizeIntel(
  reports: TradingIntelReport[],
  watchCount: number,
): IntelStats {
  const bySignal: Record<TradingSignal, number> = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
    WATCH: 0,
    AVOID: 0,
  };
  const bySource: Record<string, number> = {};
  let complete = 0;
  let latestAsOf: string | undefined;
  for (const r of reports) {
    if (r.status === 'complete') complete += 1;
    bySignal[r.signal] = (bySignal[r.signal] ?? 0) + 1;
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    if (!latestAsOf || r.asOf > latestAsOf) latestAsOf = r.asOf;
  }
  return {
    total: reports.length,
    complete,
    bySignal,
    bySource,
    watchCount,
    latestAsOf,
  };
}

export function createEmptyReport(partial: {
  ticker: string;
  name?: string;
  source?: IntelSource;
  assetClass?: AssetClass;
}): TradingIntelReport {
  const now = new Date().toISOString();
  const ticker = partial.ticker.trim().toUpperCase();
  return {
    id: crypto.randomUUID?.() ?? `ti-${Date.now()}`,
    ticker,
    name: partial.name,
    assetClass: partial.assetClass ?? inferAssetClass(ticker),
    asOf: now.slice(0, 10),
    status: 'draft',
    source: partial.source ?? 'manual',
    signal: 'WATCH',
    confidence: 0.5,
    thesis: '',
    risks: [],
    catalysts: [],
    agents: [],
    tags: [],
    body: '',
    createdAt: now,
    updatedAt: now,
  };
}
