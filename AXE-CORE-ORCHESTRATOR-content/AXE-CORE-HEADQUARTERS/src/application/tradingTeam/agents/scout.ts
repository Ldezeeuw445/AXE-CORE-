/**
 * Scout — scan watchlist + run pluggable strategies (Gold ORB 1AM NY on XAUUSD).
 * Strategies propose setups only; never place orders.
 */
import { PAIR_REGISTRY } from '@/domain/tradingIntel/pairRegistry';
import { fetchEconomicReleases } from '@/infrastructure/gateways/researchSources';
import { getHistory } from '@/application/tradingIntel/historyService';
import type { ScoutCandidate, ScoutResult, StrategySignalPayload } from '../types';
import {
  GOLD_ORB_STRATEGY_ID,
  GOLD_ORB_SYMBOL,
  GOLD_ORB_TIMEFRAME,
  evaluateGoldOrb,
  goldOrbConfigFromEnv,
  sizeGoldOrbLots,
  type StrategyBar,
} from '../strategies';

const DEFAULT_WATCHLIST = PAIR_REGISTRY.filter(p =>
  ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'US30', 'NAS100', 'BTCUSD'].includes(p.id),
).map(p => p.id);

async function loadGoldOrbBars(): Promise<StrategyBar[] | null> {
  try {
    const hist = await getHistory({
      symbol: GOLD_ORB_SYMBOL,
      timeframe: GOLD_ORB_TIMEFRAME,
      minBars: 400,
      provider: 'metaapi',
    });
    if (!('ok' in hist) || !hist.ok) return null;
    return hist.candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  } catch {
    return null;
  }
}

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
  });

  // Pluggable: Gold ORB 1AM NY on demo gold only
  try {
    const bars = await loadGoldOrbBars();
    const cfg = goldOrbConfigFromEnv();
    if (!bars?.length) {
      notes.push('gold-orb: no m5 history (MetaAPI cache/account) — strategy skipped this cycle');
    } else {
      const ev = evaluateGoldOrb(bars, cfg);
      notes.push(`gold-orb: ${ev.status}${ev.notes[0] ? ` — ${ev.notes[0]}` : ''}`);
      if (ev.status === 'signal' && ev.signal) {
        const sized = sizeGoldOrbLots({
          entry: ev.signal.entry,
          stopLoss: ev.signal.stopLoss,
          config: cfg,
        });
        const payload: StrategySignalPayload = {
          strategyId: GOLD_ORB_STRATEGY_ID,
          side: ev.signal.side,
          entry: ev.signal.entry,
          stopLoss: ev.signal.stopLoss,
          takeProfit: ev.signal.takeProfit,
          riskReward: ev.signal.riskReward,
          orbHigh: ev.signal.orbHigh,
          orbLow: ev.signal.orbLow,
          sessionDateNy: ev.signal.sessionDateNy,
          lots: sized.lots > 0 ? sized.lots : undefined,
          filterSummary: ev.signal.filters.filter(f => f.enabled).map(f => `${f.id}:${f.ok ? 'ok' : 'fail'}`).join(',') || 'volatility:default',
          notes: [
            ...ev.signal.notes,
            sized.refused ? `sizing: ${sized.refused}` : `lots=${sized.lots} riskBudget=${sized.riskBudget.toFixed(0)}`,
          ],
        };
        candidates.push({
          symbol: GOLD_ORB_SYMBOL,
          score: 98,
          reason: `Gold ORB 1AM NY ${ev.signal.side.toUpperCase()} — ORB ${ev.signal.orbLow}–${ev.signal.orbHigh}, TP ${ev.signal.riskReward}R`,
          edgeHint: 'strategy:gold-orb-1am-ny',
          strategyId: GOLD_ORB_STRATEGY_ID,
          strategySignal: payload,
        });
      }
    }
  } catch (e) {
    notes.push(`gold-orb error: ${e instanceof Error ? e.message : String(e)}`);
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 3);
  notes.push(`top-3 from ${watchlist.length} symbols (+strategies)`);
  return {
    scannedAt: new Date().toISOString(),
    watchlist,
    candidates: top,
    notes,
  };
}
