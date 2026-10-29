/**
 * Risk — TEST gates for the demo account only.
 * Gold ORB: allow 0.5R TP, use strategy lot sizing, still block news window.
 */
import type { ChartsResult, NewsResult, RiskResult, ScoutCandidate } from '../types';
import { GOLD_ORB_STRATEGY_ID } from '../strategies';

export function runRisk(input: {
  news: NewsResult | null;
  charts: ChartsResult | null;
  scoutTop?: ScoutCandidate | null;
  maxLots?: number;
}): RiskResult {
  const checks: RiskResult['checks'] = [];
  const blocked: string[] = [];
  const isOrb = input.scoutTop?.strategyId === GOLD_ORB_STRATEGY_ID;
  const maxLots = input.scoutTop?.strategySignal?.lots
    ?? input.maxLots
    ?? (isOrb ? 5 : 0.1);

  const newsBlock = Boolean(input.news?.highImpactWithin2h);
  checks.push({
    id: 'news_window',
    ok: !newsBlock,
    detail: newsBlock
      ? 'high-impact event within 2h (USD/news — ORB blocks)'
      : 'no 2h high-impact clash',
  });
  if (newsBlock) blocked.push('news_window');

  const rr = input.charts?.riskReward ?? 0;
  const minRr = isOrb ? 0.45 : 2;
  const rrOk = rr >= minRr;
  checks.push({
    id: 'min_rr',
    ok: rrOk,
    detail: isOrb
      ? `R:R=${rr.toFixed?.(2) ?? rr} (Gold ORB allows ~0.5R TP)`
      : `R:R=${rr.toFixed?.(2) ?? rr} (min 2.0)`,
  });
  if (!rrOk) blocked.push('min_rr');

  const structureOk = Boolean(input.charts?.structureOk);
  checks.push({
    id: 'structure',
    ok: structureOk,
    detail: structureOk ? 'charts structure ok' : 'charts structure not ok',
  });
  if (!structureOk) blocked.push('structure');

  checks.push({
    id: 'demo_lot_cap',
    ok: true,
    detail: isOrb
      ? `Gold ORB sized lots=${maxLots} (risk% of demo equity, capped)`
      : `suggested lots capped at ${maxLots} (TEST demo)`,
  });

  checks.push({
    id: 'prop_rules',
    ok: true,
    detail: 'skipped — TEST targets personal MT5 DEMO 500K, not Upcomers/prop',
  });

  if (isOrb) {
    checks.push({
      id: 'orb_session',
      ok: true,
      detail: 'ORB max 2/day + flat 06:00 NY enforced in strategy engine / backtest; live cycle proposes one setup',
    });
  }

  return {
    ok: blocked.length === 0,
    blockedReasons: blocked,
    checks,
    suggestedLots: typeof maxLots === 'number' ? maxLots : 0.1,
  };
}
