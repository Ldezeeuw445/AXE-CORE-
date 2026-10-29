/**
 * Scout — scan watchlist for top-3 setup candidates (TEST heuristics).
 * Reuses pair registry + optional economic calendar; journal edge is best-effort.
 */
import { PAIR_REGISTRY } from '@/domain/tradingIntel/pairRegistry';
import { fetchEconomicReleases } from '@/infrastructure/gateways/researchSources';
import type { ScoutCandidate, ScoutResult } from '../types';

const DEFAULT_WATCHLIST = PAIR_REGISTRY.filter(p =>
  ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'US30', 'NAS100', 'BTCUSD'].includes(p.id),
).map(p => p.id);

export async function runScout(opts?: { watchlist?: string[] }): Promise<ScoutResult> {
  const watchlist = opts?.watchlist?.length ? opts.watchlist : DEFAULT_WATCHLIST;
  const notes: string[] = [];
  let calendarNear: string[] = [];

  try {
    const releases = await fetchEconomicReleases();
    const now = Date.now();
    calendarNear = releases
      .filter(r => {
        const t = Date.parse(r.date);
        return Number.isFinite(t) && t - now > 0 && t - now < 48 * 3600_000;
      })
      .slice(0, 8)
      .map(r => r.name);
    if (calendarNear.length) notes.push(`calendar: ${calendarNear.slice(0, 3).join(', ')}`);
  } catch (e) {
    notes.push(`calendar unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Heuristic ranking: prefer metals/FX majors when calendar is quiet; deprioritize if named in events.
  const candidates: ScoutCandidate[] = watchlist.map((symbol, i) => {
    const hit = calendarNear.some(n => n.toUpperCase().includes(symbol.slice(0, 3)));
    const score = Math.max(10, 90 - i * 8 - (hit ? 25 : 0));
    return {
      symbol,
      score,
      reason: hit
        ? `on watchlist but near calendar keyword — lower priority`
        : `watchlist rank ${i + 1}; no hard calendar clash detected`,
      edgeHint: 'TEST scout — journal edge wiring later',
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  notes.push(`top-3 from ${watchlist.length} symbols`);
  return {
    scannedAt: new Date().toISOString(),
    watchlist,
    candidates,
    notes,
  };
}
