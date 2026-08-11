/**
 * tradingKillSwitch — one button: stop the loop AND flatten every open
 * position, on whatever venue they're on. Turning autopilot off alone only
 * stops NEW entries; existing positions keep running unattended. This is
 * the "I want everything closed right now" action.
 */
import { getDemoAccount, executeDemoTrade, equity as accountEquity } from '@/infrastructure/persistence/demoTradingService';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import { getMetaApiConfig, metaApiGetPositions, metaApiClosePosition } from '@/infrastructure/gateways/metaApiService';
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
      const snap = await fetchMarketSnapshot(pos.symbol);
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
  const meta = await getMetaApiConfig();
  if (meta?.enabled) {
    const res = await metaApiGetPositions();
    if (res.ok) {
      for (const raw of res.positions as Record<string, unknown>[]) {
        const id = String(raw.id ?? raw.positionId ?? '');
        if (!id) continue;
        const closed = await metaApiClosePosition(id);
        if (closed.ok) metaApiPositionsClosed += 1;
        else metaApiCloseErrors.push(`${String(raw.symbol ?? id)}: ${closed.error}`);
      }
    } else {
      metaApiCloseErrors.push(res.error);
    }
  }

  // Refresh equity after closes and trip the breaker regardless of drawdown
  // level — this is a manual "stop everything" call, so autopilot must not
  // be able to resume just because it gets flipped back on a minute later.
  const finalAccount = await getDemoAccount();
  const finalEquity = accountEquity(finalAccount);
  await forceTripCircuitBreaker(reason, finalEquity);

  return {
    autopilotStopped: true,
    circuitBreakerTripped: true,
    paperPositionsClosed,
    paperCloseErrors,
    metaApiPositionsClosed,
    metaApiCloseErrors,
  };
}
