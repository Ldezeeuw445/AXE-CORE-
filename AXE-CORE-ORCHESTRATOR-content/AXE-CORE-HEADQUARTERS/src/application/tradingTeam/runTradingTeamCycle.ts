/**
 * runTradingTeamCycle — Scout → News/Sentiment/Charts → Risk → Decision.
 * Account allowlist fail-closed on MT5 DEMO 500K only.
 * Default: propose-only. Set AXE_TRADING_TEAM_AUTO_EXECUTE=1 to place on the allowlisted demo via MetaAPI.
 */
import { getAccounts } from '@/infrastructure/persistence/tradingAccountsService';
import { metaApiAccountInfoFor, type MetaApiConfig } from '@/infrastructure/gateways/metaApiService';
import { brokerPlaceOrder } from '@/infrastructure/gateways/brokerConnector';
import { assessPreTrade } from '@/application/tradingIntel/preTradeGateService';
import { sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';
import {
  candidatesFromTradingAccounts,
  resolveAllowedAccount,
  demoTradeModeGuard,
  indexCompanionBrokersByMetaApiId,
  type BrokerIndexEntry,
  type CandidateAccount,
} from './accountAllowlist';
import { runScout } from './agents/scout';
import { runNews } from './agents/news';
import { runSentiment } from './agents/sentiment';
import { runCharts } from './agents/charts';
import { runRisk } from './agents/risk';
import { runDecision } from './agents/decision';
import { finalizeCycleRow, insertRunningCycle } from './tradingTeamLogService';
import type { TradingTeamCycleResult } from './types';

function cycleId(): string {
  return `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function autoExecuteEnabled(): boolean {
  return process.env.AXE_TRADING_TEAM_AUTO_EXECUTE === '1';
}

async function loadCompanionBrokerIndex(accountIds: string[]): Promise<Map<string, BrokerIndexEntry>> {
  const map = new Map<string, BrokerIndexEntry>();
  const ids = [...new Set(accountIds.map(id => id.trim()).filter(Boolean))];
  for (const accountId of ids) {
    try {
      const rows = await sbGetRows<{
        id?: string;
        external_connection_id?: string;
        mt5_server?: string;
      }>('user_broker_accounts', {
        limit: 5,
        filterCol: 'external_connection_id',
        filterVal: accountId,
      });
      for (const [k, v] of indexCompanionBrokersByMetaApiId(rows ?? [])) {
        if (!map.has(k)) map.set(k, v);
      }
    } catch {
      // Env 1:1 binding and row-level companionBrokerAccountId still apply.
    }
  }
  return map;
}

export async function runTradingTeamCycle(opts?: {
  extraCandidates?: CandidateAccount[];
  watchlist?: string[];
}): Promise<TradingTeamCycleResult> {
  const id = cycleId();
  const rowId = await insertRunningCycle(id);

  const emptyScout = {
    scannedAt: new Date().toISOString(),
    watchlist: [] as string[],
    candidates: [],
    notes: [] as string[],
  };

  try {
    const state = await getAccounts().catch(() => ({ accounts: [], activeId: null }));
    const brokerIndex = await loadCompanionBrokerIndex(state.accounts.map(a => a.accountId));
    const candidates = [
      ...candidatesFromTradingAccounts(state.accounts, brokerIndex),
      ...(opts?.extraCandidates ?? []),
    ];
    const guard = resolveAllowedAccount(candidates);

    if (guard.status !== 'allowed' || !guard.accountId) {
      const result: TradingTeamCycleResult = {
        cycleId: id,
        status: 'blocked',
        guard,
        scout: emptyScout,
        news: null,
        sentiment: null,
        charts: null,
        risk: null,
        decision: {
          verdict: 'BLOCKED',
          confidence: 0,
          proposal: null,
          summary: guard.reason,
          notes: ['allowlist'],
        },
        execution: { attempted: false },
        runRowId: rowId,
      };
      await finalizeCycleRow(rowId, result);
      return result;
    }

    const acctForMode = state.accounts.find(a => a.accountId === guard.accountId);
    if (!acctForMode?.token) {
      const result: TradingTeamCycleResult = {
        cycleId: id,
        status: 'blocked',
        guard: { ...guard, status: 'rejected', reason: 'allowlisted account has no MetaAPI token in Core accounts store' },
        scout: emptyScout,
        news: null,
        sentiment: null,
        charts: null,
        risk: null,
        decision: {
          verdict: 'BLOCKED',
          confidence: 0,
          proposal: null,
          summary: 'allowlisted account has no MetaAPI token in Core accounts store',
          notes: ['tradeMode'],
        },
        execution: { attempted: false },
        runRowId: rowId,
      };
      await finalizeCycleRow(rowId, result);
      return result;
    }
    const info = await metaApiAccountInfoFor({
      token: acctForMode.token,
      accountId: acctForMode.accountId,
      region: acctForMode.region,
      enabled: true,
      updatedAt: acctForMode.addedAt,
    }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    const mode = info.ok ? demoTradeModeGuard(info.info.tradeMode) : { ok: false as const, reason: `MetaAPI account-information failed: ${'error' in info ? info.error : 'unknown'}` };
    if (!mode.ok) {
      const result: TradingTeamCycleResult = {
        cycleId: id,
        status: 'blocked',
        guard: { ...guard, status: 'rejected', reason: mode.reason },
        scout: emptyScout,
        news: null,
        sentiment: null,
        charts: null,
        risk: null,
        decision: {
          verdict: 'BLOCKED',
          confidence: 0,
          proposal: null,
          summary: mode.reason,
          notes: ['tradeMode'],
        },
        execution: { attempted: false },
        runRowId: rowId,
      };
      await finalizeCycleRow(rowId, result);
      return result;
    }

    const scout = await runScout({ watchlist: opts?.watchlist });
    const top = scout.candidates[0]?.symbol;
    if (!top) {
      const result: TradingTeamCycleResult = {
        cycleId: id,
        status: 'completed',
        guard,
        scout,
        news: null,
        sentiment: null,
        charts: null,
        risk: null,
        decision: {
          verdict: 'WAIT',
          confidence: 0.2,
          proposal: null,
          summary: 'No scout candidates',
          notes: [],
        },
        execution: { attempted: false },
        runRowId: rowId,
      };
      await finalizeCycleRow(rowId, result);
      return result;
    }

    const [news, chartsPlaceholder] = await Promise.all([
      runNews(top),
      // charts needs sentiment — run sentiment sync after news, charts after
      Promise.resolve(null),
    ]);
    void chartsPlaceholder;
    const sentiment = runSentiment(top, news);
    const scoutTop = scout.candidates[0] ?? null;
    const charts = await runCharts(top, sentiment, scoutTop);
    const risk = runRisk({ news, charts, scoutTop });
    const decision = runDecision({ scout, sentiment, charts, risk });

    let execution: Record<string, unknown> = {
      attempted: false,
      autoExecute: autoExecuteEnabled(),
      note: 'propose-only unless AXE_TRADING_TEAM_AUTO_EXECUTE=1',
    };

    if (
      autoExecuteEnabled() &&
      decision.verdict === 'GO' &&
      decision.proposal &&
      guard.accountId
    ) {
      const acctRow = state.accounts.find(a => a.accountId === guard.accountId);
      if (!acctRow?.token) {
        execution = {
          attempted: true,
          ok: false,
          error: 'allowlisted account has no MetaAPI token in Core accounts store',
        };
      } else {
        const account: MetaApiConfig = {
          token: acctRow.token,
          accountId: acctRow.accountId,
          region: acctRow.region,
          enabled: true,
          updatedAt: new Date().toISOString(),
        };
        // Re-check allowlist id matches exactly before any order
        if (account.accountId !== guard.accountId) {
          execution = { attempted: true, ok: false, error: 'account id mismatch — refuse' };
        } else {
          const assessed = await assessPreTrade({
            symbol: decision.proposal.symbol,
            side: decision.proposal.side,
            origin: 'agent',
            account,
            order: {
              lots: decision.proposal.lots ?? 0.1,
              stopLoss: decision.proposal.stopLoss,
              entry: decision.proposal.entry,
            },
          }).catch((e: unknown) => ({
            allowed: false as const,
            reason: e instanceof Error ? e.message : String(e),
            checks: [] as [],
            clearance: undefined,
            account,
          }));
          if (!assessed.allowed || !assessed.clearance) {
            execution = {
              attempted: true,
              ok: false,
              error: 'preTradeGate blocked',
              reason: assessed.reason ?? null,
            };
          } else {
            const placed = await brokerPlaceOrder({
              symbol: decision.proposal.symbol,
              side: decision.proposal.side,
              qty: 1,
              lots: decision.proposal.lots ?? 0.1,
              reason: `[trading-team-test ${id}] ${decision.proposal.rationale}`.slice(0, 500),
              confidence: decision.confidence,
              stopLoss: decision.proposal.stopLoss,
              takeProfit: decision.proposal.takeProfit,
              strategy: scoutTop?.strategyId ?? 'trading-team-test',
              timeframe: scoutTop?.strategyId === 'gold-orb-1am-ny' ? 'm5' : 'D1',
              account,
              clearance: assessed.clearance,
            });
            execution = {
              attempted: true,
              ok: placed.ok,
              tradeId: placed.tradeId,
              venue: placed.venue,
              error: placed.error,
              accountId: guard.accountId,
              accountLabel: guard.accountLabel,
            };
          }
        }
      }
    }

    const result: TradingTeamCycleResult = {
      cycleId: id,
      status: 'completed',
      guard,
      scout,
      news,
      sentiment,
      charts,
      risk,
      decision,
      execution,
      runRowId: rowId,
    };
    await finalizeCycleRow(rowId, result);
    return result;
  } catch (e) {
    const result: TradingTeamCycleResult = {
      cycleId: id,
      status: 'error',
      guard: {
        status: 'rejected',
        reason: 'cycle error',
        accountId: null,
        accountLabel: null,
        companionBrokerAccountId: null,
      },
      scout: emptyScout,
      news: null,
      sentiment: null,
      charts: null,
      risk: null,
      decision: {
        verdict: 'BLOCKED',
        confidence: 0,
        proposal: null,
        summary: e instanceof Error ? e.message : String(e),
        notes: ['error'],
      },
      execution: { attempted: false },
      error: e instanceof Error ? e.message : String(e),
      runRowId: rowId,
    };
    await finalizeCycleRow(rowId, result);
    return result;
  }
}
