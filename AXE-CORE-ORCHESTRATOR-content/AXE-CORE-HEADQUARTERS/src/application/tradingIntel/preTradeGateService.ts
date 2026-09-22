/**
 * preTradeGateService — verzamelt de echte toestand van één account en legt
 * die voor aan de ene poort (domain/tradingIntel/preTradeGate).
 *
 * De motor verzamelt zijn toestand zelf, omdat hij die al in handen heeft voor
 * zijn spoor; hij roept dezelfde evaluatePreTradeGate aan. Dit bestand is voor
 * elk ander pad dat een order wil versturen — vandaag de handmatige knoppen op
 * de grafiek — zodat niemand de controles in een component hoeft na te bouwen.
 */
import {
  evaluatePreTradeGate,
  type OrderOrigin,
  type OrderSide,
  type PreTradeVerdict,
} from '@/domain/tradingIntel/preTradeGate';
import { getMetaApiConfig, type MetaApiConfig } from '@/infrastructure/gateways/metaApiService';
import {
  brokerOpeningsTodayFor,
  dayLimitState,
  getEffectiveAccountState,
  placedTodayInProcess,
} from '@/infrastructure/gateways/brokerConnector';
import { getAccounts } from '@/infrastructure/persistence/tradingAccountsService';
import { getRiskProfile } from '@/infrastructure/persistence/tradingRiskService';
import { checkAndUpdateCircuitBreaker } from '@/infrastructure/persistence/tradingCircuitBreakerService';

export interface AssessedOrder extends PreTradeVerdict {
  /** Het account waarop de order zou landen — hetzelfde dat brokerPlaceOrder kiest. */
  account: MetaApiConfig | null;
}

/** Hetzelfde account dat brokerPlaceOrder zou kiezen, of null als er geen is. */
export async function resolveOrderAccount(account?: MetaApiConfig | null): Promise<MetaApiConfig | null> {
  const meta = account ?? await getMetaApiConfig().catch(() => null);
  return meta?.enabled && meta.token && meta.accountId ? meta : null;
}

export async function assessPreTrade(input: {
  symbol: string;
  side: OrderSide;
  origin: OrderOrigin;
  account?: MetaApiConfig | null;
  confidence?: { value: number; floor: number };
}): Promise<AssessedOrder> {
  const symbol = input.symbol.trim().toUpperCase();
  const target = await resolveOrderAccount(input.account);
  const accountId = target?.accountId ?? null;

  // Zonder account geen order: brokerPlaceOrder weigert dat ook, en het
  // papieren boek is geen plek voor een handmatige vulling die daarna in het
  // leergeheugen belandt alsof hij echt was.
  if (!target) {
    const verdict = evaluatePreTradeGate({
      origin: input.origin, symbol, side: input.side, accountId: null, mode: 'none',
      account: { known: false, available: false, unavailableReason: 'No live broker connected' },
      breaker: { tripped: false },
      dayLimit: { tradesToday: 0, unverified: false, max: 0 },
      allowShort: false,
      longPositionQty: 0,
      confidence: input.confidence,
    });
    return { ...verdict, reason: 'No live broker connected — connect MT5 via MetaAPI to place orders.', account: null };
  }

  // Een onleesbare accountlijst is geen lege lijst: dan is het account niet
  // aantoonbaar bekend, en dan gaat er niets weg.
  const known = await getAccounts()
    .then(s => s.accounts.some(a => a.accountId === accountId))
    .catch(() => false);

  const [effective, risk] = await Promise.all([
    getEffectiveAccountState(symbol, target),
    getRiskProfile(accountId),
  ]);

  // Dezelfde breaker-aanroep als de motor: een drawdown die pas bij deze klik
  // zichtbaar wordt, laat de breaker ook hier klappen. Op een onleesbaar
  // account wordt hij niet aangeraakt (de piek mag niet van een nul komen).
  const breaker = effective.available
    ? await checkAndUpdateCircuitBreaker(
        effective.equity,
        risk.maxDrawdownPct ?? 0.12,
        effective.isReal ? 'live' : 'paper',
        accountId,
      )
    : { tripped: false as const, trippedReason: undefined };

  const brokerCount = effective.isReal ? await brokerOpeningsTodayFor(target) : null;
  const day = dayLimitState({
    isReal: effective.isReal,
    brokerCount,
    inProcessCount: placedTodayInProcess(accountId),
    paperCount: 0,
  });

  const verdict = evaluatePreTradeGate({
    origin: input.origin,
    symbol,
    side: input.side,
    accountId,
    mode: risk.mode,
    account: { known, available: effective.available, unavailableReason: effective.unavailableReason },
    breaker: { tripped: breaker.tripped, reason: breaker.trippedReason },
    dayLimit: { tradesToday: day.tradesToday, unverified: day.unverified, max: risk.maxTradesPerDay },
    allowShort: risk.allowShort,
    longPositionQty: effective.available ? effective.positionQty(symbol) : 0,
    confidence: input.confidence,
  });
  return { ...verdict, account: target };
}
