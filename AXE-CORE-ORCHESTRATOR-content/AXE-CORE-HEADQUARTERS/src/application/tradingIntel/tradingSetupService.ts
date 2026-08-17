/**
 * tradingSetupService — user-defined, reusable trading SETUPS (distinct from
 * SavedStrategyRun, which is a one-off result snapshot). A setup is the recipe:
 * which strategies must confluence, how many need to agree, on what timeframe
 * and over what window. The user builds one in the combo card, names it, saves
 * it, and can reload it to re-backtest or hand to the agent later.
 *
 * Persisted to userSettings (localStorage + cloud) so setups survive restarts
 * and are shared across windows — same store the risk profile uses.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { BacktestStrategyId } from '@/application/tradingIntel/backtestEngine';

export interface TradingSetup {
  id: string;
  name: string;
  strategies: BacktestStrategyId[];
  minAgree: number;
  timeframe: string;
  limit: number;
  createdAt: string;
  updatedAt: string;
}

const KEY = 'axe_trading_setups';

export async function getTradingSetups(): Promise<TradingSetup[]> {
  const list = await loadSetting<TradingSetup[]>(KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Create or update a setup by name (case-insensitive) so re-saving the same
 *  name tunes the existing one instead of piling up duplicates. */
export async function saveTradingSetup(
  input: { name: string; strategies: BacktestStrategyId[]; minAgree: number; timeframe: string; limit: number },
): Promise<TradingSetup[]> {
  const name = input.name.trim();
  if (!name) return getTradingSetups();
  const existing = await getTradingSetups();
  const now = new Date().toISOString();
  const match = existing.find(s => s.name.toLowerCase() === name.toLowerCase());
  const setup: TradingSetup = {
    id: match?.id ?? `setup_${Date.now()}`,
    name,
    strategies: [...new Set(input.strategies)],
    minAgree: Math.max(1, Math.min(input.minAgree, Math.max(1, input.strategies.length))),
    timeframe: input.timeframe,
    limit: input.limit,
    createdAt: match?.createdAt ?? now,
    updatedAt: now,
  };
  const next = match
    ? existing.map(s => (s.id === match.id ? setup : s))
    : [setup, ...existing];
  await saveSetting(KEY, next);
  return next;
}

export async function deleteTradingSetup(id: string): Promise<TradingSetup[]> {
  const existing = await getTradingSetups();
  const next = existing.filter(s => s.id !== id);
  await saveSetting(KEY, next);
  return next;
}
