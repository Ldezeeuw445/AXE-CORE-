/**
 * tradingKillSwitch — one button: stop the loop AND flatten every open
 * position, on whatever venue they're on. Turning autopilot off alone only
 * stops NEW entries; existing positions keep running unattended. This is
 * the "I want everything closed right now" action.
 */
import { getDemoAccount, executeDemoTrade } from '@/infrastructure/persistence/demoTradingService';
import { fetchTradeableSnapshot } from '@/infrastructure/gateways/marketDataService';
import { metaApiPositionsFor, metaApiClosePositionFor, type MetaApiConfig } from '@/infrastructure/gateways/metaApiService';
import { tradeableAccounts, accountLabel } from '@/infrastructure/persistence/tradingAccountsService';
import { getEffectiveAccountState } from '@/infrastructure/gateways/brokerConnector';
import { forceTripCircuitBreaker } from '@/infrastructure/persistence/tradingCircuitBreakerService';
import { setAutopilotEnabled } from '@/application/tradingIntel/agentAutopilot';

export interface KillSwitchResult {
  autopilotStopped: boolean;
  circuitBreakerTripped: boolean;
  paperPositionsClosed: number;
  paperCloseErrors: string[];
  metaApiPositionsClosed: number;
  metaApiCloseErrors: string[];
}

export async function emergencyFlattenAndStop(reason = 'Manual kill switch'): Promise<KillSwitchResult> {
  await setAutopilotEnabled(false);

  const account = await getDemoAccount();
  const paperCloseErrors: string[] = [];
  let paperPositionsClosed = 0;
  // Snapshot the symbol list first — executeDemoTrade mutates positions as
  // we go, and iterating a live array while closing entries out of it is
  // exactly the kind of off-by-one that skips the last position.
  for (const pos of [...account.positions]) {
    try {
      const snap = await fetchTradeableSnapshot(pos.symbol);
      const result = await executeDemoTrade({
        symbol: pos.symbol,
        side: 'sell',
        qty: pos.qty,
        price: snap.last,
        reason,
        confidence: 1,
      });
      if ('error' in result) paperCloseErrors.push(`${pos.symbol}: ${result.error}`);
      else paperPositionsClosed += 1;
    } catch (e) {
      paperCloseErrors.push(`${pos.symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let metaApiPositionsClosed = 0;
  const metaApiCloseErrors: string[] = [];
  // EVERY ACCOUNT, NOT THE ACTIVE ONE.
  //
  // This read getMetaApiConfig() and metaApiGetPositions(), both of which see
  // only the active account. With two accounts connected, "stop everything"
  // flattened one, left the other holding live exposure, and returned
  // autopilotStopped: true either way. A stop button that stops half of it is
  // worse than one that admits it failed, because you act on the report.
  //
  // Every account is attempted even if an earlier one errors: the whole point
  // of this button is that it does as much as it possibly can, and one broker
  // refusing must not leave the rest untouched.
  const accounts = await tradeableAccounts().catch(e => {
    metaApiCloseErrors.push(`account list unreadable: ${e instanceof Error ? e.message : String(e)}`);
    return [] as MetaApiConfig[];
  });
  for (const account of accounts) {
    const label = await accountLabel(account.accountId).catch(() => account.accountId.slice(0, 8));
    try {
      const res = await metaApiPositionsFor(account);
      if (!res.ok) {
        metaApiCloseErrors.push(`${label}: ${res.error}`);
        continue;
      }
      for (const raw of res.positions as Record<string, unknown>[]) {
        const id = String(raw.id ?? raw.positionId ?? '');
        if (!id) continue;
        const closed = await metaApiClosePositionFor(account, id);
        if (closed.ok) metaApiPositionsClosed += 1;
        else metaApiCloseErrors.push(`${label} ${String(raw.symbol ?? id)}: ${closed.error}`);
      }
    } catch (e) {
      metaApiCloseErrors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Refresh equity after closes and trip the breaker regardless of drawdown
  // level — this is a manual "stop everything" call, so autopilot must not
  // be able to resume just because it gets flipped back on a minute later.
  // Reads the same real-vs-paper source tradingAgentEngine uses — symbol is
  // irrelevant here since only .equity/.isReal are read, not positionQty.
  const effective = await getEffectiveAccountState('EURUSD');
  await forceTripCircuitBreaker(reason, effective.equity, effective.isReal ? 'live' : 'paper');

  return {
    autopilotStopped: true,
    circuitBreakerTripped: true,
    paperPositionsClosed,
    paperCloseErrors,
    metaApiPositionsClosed,
    metaApiCloseErrors,
  };
}
