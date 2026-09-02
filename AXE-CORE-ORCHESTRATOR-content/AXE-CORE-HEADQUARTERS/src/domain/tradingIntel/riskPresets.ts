/**
 * Named risk settings, so a rule set can be written once and pointed at an account.
 *
 * ## Why a name matters
 *
 * Risk is already per account — the storage keys on the account id and the
 * engine reads the account's own profile. What was missing is the ability to
 * say what a set of numbers IS. "6% total drawdown, 0.5% per trade, no shorts"
 * is a prop challenge; the same fields at 25% and 2% are a demo you are willing
 * to blow up. Without a name those are two anonymous piles of numbers that look
 * alike on screen, and the wrong one gets applied to the wrong account exactly
 * once before it matters.
 *
 * A preset is therefore a name plus a profile. Applying one copies its numbers
 * onto an account; it does not link them. That is deliberate — a link means
 * editing the preset silently changes the risk on every account using it, and
 * discovering that during a drawdown is not the moment.
 *
 * ## Bounds are refusals, not clamps
 *
 * validatePreset REFUSES an impossible profile rather than quietly correcting
 * it. A typo of 50 where 0.5 was meant is not a preference to be rounded down —
 * it is a mistake, and a silent clamp hides it until the position size looks
 * wrong on a live account. The caller gets a reason it can show.
 */
import type { RiskProfile, RiskMode } from '@/domain/tradingIntel/botTypes';

export interface RiskPreset {
  /** Stable id, so renaming does not orphan anything. */
  id: string;
  name: string;
  profile: RiskProfile;
  updatedAt: string;
  /** Built-ins cannot be deleted; they are the floor to fall back to. */
  builtIn?: boolean;
}

/** Nothing risks more than a fifth of an account on one trade, ever. */
export const MAX_RISK_PER_TRADE = 0.2;
/** A daily loss halt above half the account is not a halt. */
export const MAX_DAILY_LOSS = 0.5;

export interface PresetProblem { field: string; reason: string }

/**
 * What is wrong with this profile, or an empty list.
 *
 * Every check is a range a real desk stays inside. They are stated as problems
 * rather than corrections so the screen can say which field and why.
 */
export function validatePreset(p: Partial<RiskProfile>, name?: string): PresetProblem[] {
  const out: PresetProblem[] = [];
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

  if (name !== undefined && !name.trim()) {
    out.push({ field: 'name', reason: 'A preset needs a name — that is the point of it.' });
  }
  if (!num(p.riskPerTradePct) || p.riskPerTradePct! <= 0) {
    out.push({ field: 'riskPerTradePct', reason: 'Risk per trade must be above zero.' });
  } else if (p.riskPerTradePct! > MAX_RISK_PER_TRADE) {
    out.push({
      field: 'riskPerTradePct',
      reason: `${(p.riskPerTradePct! * 100).toFixed(1)}% per trade — above ${MAX_RISK_PER_TRADE * 100}% is a typo more often than a decision.`,
    });
  }
  if (num(p.maxDailyLossPct) && p.maxDailyLossPct! > MAX_DAILY_LOSS) {
    out.push({ field: 'maxDailyLossPct', reason: 'A daily halt above half the account does not halt anything.' });
  }
  if (num(p.maxDrawdownPct) && num(p.maxDailyLossPct) && p.maxDailyLossPct! > p.maxDrawdownPct!) {
    // The daily halt would never fire: total drawdown trips first, every time.
    out.push({
      field: 'maxDailyLossPct',
      reason: 'Daily loss limit is larger than the total drawdown limit, so it can never trigger.',
    });
  }
  if (num(p.minConfidence) && (p.minConfidence! < 0 || p.minConfidence! > 1)) {
    out.push({ field: 'minConfidence', reason: 'Confidence floor is a fraction between 0 and 1.' });
  }
  if (num(p.maxTradesPerDay) && p.maxTradesPerDay! < 1) {
    out.push({ field: 'maxTradesPerDay', reason: 'Fewer than one trade a day is an off switch, not a limit.' });
  }
  return out;
}

function profile(mode: RiskMode, over: Partial<RiskProfile>): RiskProfile {
  return {
    mode,
    riskPerTradePct: 0.01,
    maxOpenRiskPct: 0.06,
    maxDailyLossPct: 0.04,
    maxTradesPerDay: 20,
    minConfidence: 0.6,
    allowShort: true,
    ...over,
  } as RiskProfile;
}

/**
 * The three shapes this desk actually trades, ready to point at an account.
 *
 * Numbers chosen to match the rule sets they are named after rather than to be
 * round: a prop challenge really is roughly 5% daily and 10% total, and a
 * demo you are learning on should be allowed to be reckless in a way a funded
 * account must not.
 */
export const BUILT_IN_PRESETS: RiskPreset[] = [
  {
    id: 'builtin-small',
    name: 'Small demo — learning',
    builtIn: true,
    updatedAt: '1970-01-01T00:00:00.000Z',
    profile: profile('personal_demo', {
      riskPerTradePct: 0.02, maxOpenRiskPct: 0.1, maxDailyLossPct: 0.1,
      maxTradesPerDay: 40, minConfidence: 0.5, maxDrawdownPct: 0.25,
    }),
  },
  {
    id: 'builtin-challenge',
    name: 'Prop challenge — 5% daily, 10% total',
    builtIn: true,
    updatedAt: '1970-01-01T00:00:00.000Z',
    profile: profile('funded_challenge', {
      riskPerTradePct: 0.005, maxOpenRiskPct: 0.02, maxDailyLossPct: 0.04,
      maxTradesPerDay: 10, minConfidence: 0.65, maxDrawdownPct: 0.09,
    }),
  },
  {
    id: 'builtin-funded',
    name: 'Funded live — capital preservation',
    builtIn: true,
    updatedAt: '1970-01-01T00:00:00.000Z',
    profile: profile('funded_live_rules', {
      riskPerTradePct: 0.0025, maxOpenRiskPct: 0.01, maxDailyLossPct: 0.02,
      maxTradesPerDay: 6, minConfidence: 0.7, maxDrawdownPct: 0.05,
    }),
  },
];

/** Add or replace by id, newest first, built-ins always present. */
export function upsertPreset(list: readonly RiskPreset[], preset: RiskPreset): RiskPreset[] {
  const custom = list.filter(p => !p.builtIn && p.id !== preset.id);
  return [preset, ...custom];
}

/** Remove a custom preset. Built-ins survive — they are the fallback. */
export function removePreset(list: readonly RiskPreset[], id: string): RiskPreset[] {
  return list.filter(p => p.id !== id || p.builtIn);
}

/** Built-ins first-class alongside whatever was saved, without duplicates. */
export function allPresets(saved: readonly RiskPreset[]): RiskPreset[] {
  const custom = saved.filter(p => !p.builtIn);
  return [...BUILT_IN_PRESETS, ...custom];
}

/**
 * A preset's numbers, copied — never the preset object itself.
 *
 * Copying is what keeps an account's risk from changing under it when the
 * preset is later edited. See the header.
 */
export function applyPreset(preset: RiskPreset): RiskProfile {
  return { ...preset.profile, updatedAt: new Date().toISOString() } as RiskProfile;
}
