/** Risk profile persistence for the AXE trading bot. */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { RiskProfile, RiskMode } from '@/domain/tradingIntel/botTypes';
import {
  DEFAULT_FUNDED_RISK,
  DEFAULT_PERSONAL_RISK,
} from '@/domain/tradingIntel/botTypes';

const KEY = 'axe_trading_risk_profile';

export async function getRiskProfile(): Promise<RiskProfile> {
  const cloud = await loadSetting<RiskProfile | null>(KEY, null);
  if (cloud && cloud.mode) return cloud;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as RiskProfile;
  } catch { /* ignore */ }
  return { ...DEFAULT_PERSONAL_RISK, updatedAt: new Date().toISOString() };
}

export async function saveRiskProfile(profile: RiskProfile): Promise<RiskProfile> {
  const next = { ...profile, updatedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(next));
  void saveSetting(KEY, next);
  return next;
}

export async function setRiskMode(mode: RiskMode): Promise<RiskProfile> {
  const base = mode === 'personal_demo' ? DEFAULT_PERSONAL_RISK : DEFAULT_FUNDED_RISK;
  if (mode === 'funded_live_rules') {
    return saveRiskProfile({
      ...DEFAULT_FUNDED_RISK,
      mode: 'funded_live_rules',
      riskPerTradePct: 0.004,
      maxDailyLossPct: 0.025,
      maxDrawdownPct: 0.06,
      minConfidence: 0.7,
      updatedAt: new Date().toISOString(),
    });
  }
  return saveRiskProfile({ ...base, mode, updatedAt: new Date().toISOString() });
}
