/**
 * tradingModelService — which LLM the trading desk uses for its own
 * synthesis/decision reasoning (the client-side `callLlm` in
 * runTradingResearch: the fallback when the VPS CrewAI is down, and the model
 * behind the trader/analyst synthesis when CrewAI is off).
 *
 * CrewAI on the VPS is still the primary research path when it's up — this is
 * the model AXE reasons with itself, and the one the user picks when they want
 * "a model that's really good for trading" without depending on the VPS.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { ProviderId } from '@/domain/providers';

const KEY = 'axe_trading_model';

export interface TradingModelPref {
  /** '' = auto (use the capability router's normal cascade). */
  provider: ProviderId | '';
  model?: string;
}

const DEFAULT: TradingModelPref = { provider: '', model: '' };

export async function getTradingModelPref(): Promise<TradingModelPref> {
  const cloud = await loadSetting<TradingModelPref | null>(KEY, null);
  if (cloud && typeof cloud === 'object') return { ...DEFAULT, ...cloud };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as TradingModelPref) };
  } catch { /* ignore */ }
  return DEFAULT;
}

export async function saveTradingModelPref(pref: TradingModelPref): Promise<TradingModelPref> {
  const next = { ...DEFAULT, ...pref };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  void saveSetting(KEY, next);
  return next;
}
