/**
 * Risk — TEST gates for the demo account only (prop rules deferred; still block news window).
 */
import type { ChartsResult, NewsResult, RiskResult } from '../types';

export function runRisk(input: {
  news: NewsResult | null;
  charts: ChartsResult | null;
  maxLots?: number;
}): RiskResult {
  const checks: RiskResult['checks'] = [];
  const blocked: string[] = [];
  const maxLots = input.maxLots ?? 0.1;

  const newsBlock = Boolean(input.news?.highImpactWithin2h);
  checks.push({
    id: 'news_window',
    ok: !newsBlock,
    detail: newsBlock ? 'high-impact event within 2h' : 'no 2h high-impact clash',
  });
  if (newsBlock) blocked.push('news_window');

  const rr = input.charts?.riskReward ?? 0;
  const rrOk = rr >= 2;
  checks.push({
    id: 'min_rr',
    ok: rrOk,
    detail: `R:R=${rr.toFixed?.(2) ?? rr} (min 2.0)`,
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
    detail: `suggested lots capped at ${maxLots} (TEST demo)`,
  });

  // Prop daily loss / max DD intentionally not applied to personal MetaQuotes demo.
  checks.push({
    id: 'prop_rules',
    ok: true,
    detail: 'skipped — TEST targets personal MT5 DEMO 500K, not Upcomers/prop',
  });

  return {
    ok: blocked.length === 0,
    blockedReasons: blocked,
    checks,
    suggestedLots: maxLots,
  };
}
