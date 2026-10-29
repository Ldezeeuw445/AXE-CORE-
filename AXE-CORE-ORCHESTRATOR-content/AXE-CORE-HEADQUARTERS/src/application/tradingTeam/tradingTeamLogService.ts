/**
 * Persist Trading Team TEST cycles to core_trading_team_runs (shared Supabase).
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import type { TradingTeamCycleResult, TradingTeamRunRow } from './types';

const TABLE = 'core_trading_team_runs';

export async function insertRunningCycle(cycleId: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      cycle_id: cycleId,
      status: 'running',
      mode: 'test',
      account_guard: 'pending',
    })
    .select('id')
    .maybeSingle();
  if (error) {
    console.warn('[tradingTeam] insertRunningCycle', error.message);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

export async function finalizeCycleRow(
  rowId: string | null,
  result: TradingTeamCycleResult,
): Promise<void> {
  const sb = getSupabase();
  if (!sb || !rowId) return;
  const proposal = result.decision.proposal;
  const { error } = await sb
    .from(TABLE)
    .update({
      updated_at: new Date().toISOString(),
      status: result.status,
      account_id: result.guard.accountId,
      account_label: result.guard.accountLabel,
      companion_broker_account_id: result.guard.companionBrokerAccountId,
      account_guard: result.guard.status,
      account_guard_reason: result.guard.reason,
      scout: result.scout,
      news: result.news ?? {},
      sentiment: result.sentiment ?? {},
      charts: result.charts ?? {},
      risk: result.risk ?? {},
      decision: result.decision,
      verdict: result.decision.verdict,
      confidence: result.decision.confidence,
      symbol: proposal?.symbol ?? result.scout.candidates[0]?.symbol ?? null,
      side: proposal?.side ?? null,
      proposal: proposal ?? {},
      execution: result.execution ?? {},
      error: result.error ?? null,
    })
    .eq('id', rowId);
  if (error) console.warn('[tradingTeam] finalizeCycleRow', error.message);
}

export async function listRecentRuns(limit = 40): Promise<TradingTeamRunRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[tradingTeam] listRecentRuns', error.message);
    return [];
  }
  return (data ?? []) as TradingTeamRunRow[];
}
