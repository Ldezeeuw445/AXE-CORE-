/** Risk profile persistence for the AXE trading bot. */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { RiskProfile, RiskMode } from '@/domain/tradingIntel/botTypes';
import {
  allPresets, applyPreset, validatePreset,
  type RiskPreset, type PresetProblem,
} from '@/domain/tradingIntel/riskPresets';
import {
  DEFAULT_FUNDED_RISK,
  DEFAULT_PERSONAL_RISK,
} from '@/domain/tradingIntel/botTypes';

const KEY = 'axe_trading_risk_profile';

/**
 * Risk is per account, and the key says which.
 *
 * One shared profile across three accounts is wrong in the direction that
 * costs money: a prop challenge with a 6% total drawdown cannot run the same
 * risk-per-trade as a personal demo, and the tighter of the two has to win on
 * its own account without dragging the others down with it.
 *
 * Same shape as tradingCircuitBreakerService's keyFor — an unsuffixed key
 * stays the desk-wide default, so an install that never opens the Accounts tab
 * behaves exactly as before and existing stored profiles keep working.
 */
function keyFor(accountId?: string | null): string {
  return accountId ? `${KEY}:${accountId}` : KEY;
}

export async function getRiskProfile(accountId?: string | null): Promise<RiskProfile> {
  const k = keyFor(accountId);
  const cloud = await loadSetting<RiskProfile | null>(k, null);
  if (cloud && cloud.mode) return cloud;
  try {
    const raw = localStorage.getItem(k);
    if (raw) return JSON.parse(raw) as RiskProfile;
  } catch { /* ignore */ }
  // An account with no profile of its own inherits the desk default rather
  // than silently getting the most permissive settings in the file.
  if (accountId) {
    const shared = await loadSetting<RiskProfile | null>(KEY, null);
    if (shared && shared.mode) return shared;
  }
  return { ...DEFAULT_PERSONAL_RISK, updatedAt: new Date().toISOString() };
}

export async function saveRiskProfile(profile: RiskProfile, accountId?: string | null): Promise<RiskProfile> {
  const next = { ...profile, updatedAt: new Date().toISOString() };
  const k = keyFor(accountId);
  localStorage.setItem(k, JSON.stringify(next));
  void saveSetting(k, next);
  return next;
}

export async function setRiskMode(mode: RiskMode, accountId?: string | null): Promise<RiskProfile> {
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
    }, accountId);
  }
  return saveRiskProfile({ ...base, mode, updatedAt: new Date().toISOString() }, accountId);
}

/* ----------------------------------------------------------- named presets */

const PRESETS_KEY = 'axe_risk_presets';

/**
 * Saved risk presets, with the built-ins always present.
 *
 * Durable rather than local: a rule set worth naming is worth having on the
 * phone too, and the built-ins mean an install with nothing saved still offers
 * the three shapes this desk trades.
 */
export async function loadRiskPresets(): Promise<RiskPreset[]> {
  const saved = await loadSetting<RiskPreset[] | null>(PRESETS_KEY, null);
  return allPresets(Array.isArray(saved) ? saved : []);
}

/** Persist the custom ones. Built-ins are code, not data — never stored. */
export async function saveRiskPresets(list: readonly RiskPreset[]): Promise<void> {
  await saveSetting(PRESETS_KEY, list.filter(p => !p.builtIn));
}

/**
 * Point a preset at an account.
 *
 * Refuses an invalid profile rather than writing it: a preset that cannot be
 * valid must not become an account's live risk, and the caller gets the
 * reasons to show.
 */
export async function applyPresetToAccount(
  preset: RiskPreset, accountId?: string | null,
): Promise<{ ok: true; profile: RiskProfile } | { ok: false; problems: PresetProblem[] }> {
  const problems = validatePreset(preset.profile, preset.name);
  if (problems.length) return { ok: false, problems };
  const profile = await saveRiskProfile(applyPreset(preset), accountId);
  return { ok: true, profile };
}
