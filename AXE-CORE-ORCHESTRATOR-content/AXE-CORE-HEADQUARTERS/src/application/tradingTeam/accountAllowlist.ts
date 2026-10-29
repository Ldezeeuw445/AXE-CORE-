/**
 * Fail-closed allowlist for the Trading Team TEST module.
 *
 * Hard rules (Luka, 29 Oct 2026):
 * - ONLY the Companion 500k MT5 DEMO account (label like "MT5 DEMO 500K", MetaQuotes-Demo).
 * - Never real/personal live, never Upcomers/prop.
 * - Prefer explicit env IDs; never guess secrets or invent UUIDs.
 *
 * Env (comma-separated):
 *   AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS  — MetaAPI account UUIDs
 *   AXE_TRADING_TEAM_ALLOWED_BROKER_ACCOUNT_IDS   — Companion user_broker_accounts.id UUIDs
 *   AXE_TRADING_TEAM_ALLOWED_LABEL_REGEX          — optional override (default matches 500k demo)
 */

import type { TradingAccount } from '@/infrastructure/persistence/tradingAccountsService';
import type { AccountGuardSnapshot } from './types';

const FORBIDDEN_RE =
  /\b(upcomers|ftmo|funded\s*next|prop\s*firm|challenge|evaluation|live\s*account|real\s*money)\b/i;

/** Default label/server fingerprint for the 500k MetaQuotes demo (from Companion verify scripts). */
export const DEFAULT_DEMO_500K_LABEL_RE = /(?:mt5\s*)?demo\s*500\s*k|500\s*k\s*(?:mt5\s*)?demo/i;

export function parseIdList(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function matchesDemo500kLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const custom = process.env.AXE_TRADING_TEAM_ALLOWED_LABEL_REGEX?.trim();
  if (custom) {
    try {
      return new RegExp(custom, 'i').test(label);
    } catch {
      return false;
    }
  }
  return DEFAULT_DEMO_500K_LABEL_RE.test(label);
}

export function looksLikeMetaQuotesDemo(serverOrBlob: string | null | undefined): boolean {
  if (!serverOrBlob) return false;
  return /metaquotes[-\s]?demo/i.test(serverOrBlob);
}

export function isForbiddenAccount(input: {
  label?: string | null;
  environment?: string | null;
  serverOrProvider?: string | null;
}): { forbidden: boolean; reason: string } {
  const blob = `${input.label ?? ''} ${input.serverOrProvider ?? ''}`;
  if (FORBIDDEN_RE.test(blob)) {
    return { forbidden: true, reason: `forbidden pattern in account metadata: ${blob.trim().slice(0, 80)}` };
  }
  if (input.environment === 'live') {
    return { forbidden: true, reason: 'account environment is live — trading team TEST refuses live' };
  }
  // Prop evaluation often sits on a "demo" server — still forbidden if label says so.
  if (/\b(prop|challenge|evaluation|upcomers|ftmo)\b/i.test(blob)) {
    return { forbidden: true, reason: 'prop / evaluation accounts are never allowed' };
  }
  return { forbidden: false, reason: '' };
}

export type CandidateAccount = {
  accountId: string;
  label: string;
  environment?: string | null;
  region?: string | null;
  companionBrokerAccountId?: string | null;
  serverOrProvider?: string | null;
};

/**
 * Resolve the single allowed demo account. Fail closed:
 * - If MetaAPI allowlist env is set → accountId must be in that list AND pass demo/forbidden checks.
 * - Else → exactly one candidate must match the 500k demo label heuristics.
 * - Zero or many matches → reject.
 */
export function resolveAllowedAccount(
  candidates: CandidateAccount[],
  env: {
    metaApiIds?: string[];
    brokerIds?: string[];
  } = {},
): AccountGuardSnapshot {
  const metaApiIds = env.metaApiIds ?? parseIdList(process.env.AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS);
  const brokerIds = env.brokerIds ?? parseIdList(process.env.AXE_TRADING_TEAM_ALLOWED_BROKER_ACCOUNT_IDS);

  const cleaned = candidates.filter(c => c.accountId?.trim());

  let pool = cleaned;
  if (metaApiIds.length > 0) {
    const set = new Set(metaApiIds);
    pool = cleaned.filter(c => set.has(c.accountId));
    if (pool.length === 0) {
      return {
        status: 'rejected',
        reason: 'no candidate matches AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS (fail closed)',
        accountId: null,
        accountLabel: null,
        companionBrokerAccountId: null,
      };
    }
  }
  if (brokerIds.length > 0) {
    const set = new Set(brokerIds);
    pool = pool.filter(c => c.companionBrokerAccountId && set.has(c.companionBrokerAccountId));
    if (pool.length === 0) {
      return {
        status: 'rejected',
        reason: 'no candidate matches AXE_TRADING_TEAM_ALLOWED_BROKER_ACCOUNT_IDS (fail closed)',
        accountId: null,
        accountLabel: null,
        companionBrokerAccountId: null,
      };
    }
  }

  // If no explicit ID list, require demo-500k label match (and prefer MetaQuotes-Demo).
  if (metaApiIds.length === 0 && brokerIds.length === 0) {
    pool = pool.filter(c => matchesDemo500kLabel(c.label) || looksLikeMetaQuotesDemo(c.serverOrProvider));
    // Tighten: must still look like 500k demo somehow
    pool = pool.filter(c => matchesDemo500kLabel(c.label));
  }

  const safe: CandidateAccount[] = [];
  for (const c of pool) {
    const bad = isForbiddenAccount(c);
    if (bad.forbidden) continue;
    // Explicit ID list still must not be live / prop
    if (c.environment === 'live') continue;
    // When using ID allowlist, also require demo fingerprint unless label empty
    if (metaApiIds.length > 0 || brokerIds.length > 0) {
      const demoish =
        matchesDemo500kLabel(c.label) ||
        looksLikeMetaQuotesDemo(c.serverOrProvider) ||
        c.environment === 'demo' ||
        /demo/i.test(c.label);
      if (!demoish) continue;
    }
    safe.push(c);
  }

  if (safe.length === 0) {
    return {
      status: 'rejected',
      reason:
        metaApiIds.length === 0 && brokerIds.length === 0
          ? 'no account matched MT5 DEMO 500K heuristics and no allowlist env set (fail closed)'
          : 'allowlisted id(s) present but none passed demo/forbidden checks (fail closed)',
      accountId: null,
      accountLabel: null,
      companionBrokerAccountId: null,
    };
  }

  if (safe.length > 1 && metaApiIds.length === 0 && brokerIds.length === 0) {
    return {
      status: 'rejected',
      reason: `ambiguous: ${safe.length} accounts match DEMO 500K — set AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS (fail closed)`,
      accountId: null,
      accountLabel: null,
      companionBrokerAccountId: null,
    };
  }

  const pick = safe[0]!;
  return {
    status: 'allowed',
    reason: metaApiIds.length || brokerIds.length
      ? 'matched explicit allowlist + demo checks'
      : 'matched unique MT5 DEMO 500K label heuristic',
    accountId: pick.accountId,
    accountLabel: pick.label,
    companionBrokerAccountId: pick.companionBrokerAccountId ?? null,
    metaApiRegion: pick.region ?? null,
  };
}

/** Map Core TradingAccount rows into allowlist candidates. */
export function candidatesFromTradingAccounts(accounts: TradingAccount[]): CandidateAccount[] {
  return accounts.map(a => ({
    accountId: a.accountId,
    label: a.label,
    environment: a.environment ?? null,
    region: a.region,
    companionBrokerAccountId: null,
    serverOrProvider: null,
  }));
}
