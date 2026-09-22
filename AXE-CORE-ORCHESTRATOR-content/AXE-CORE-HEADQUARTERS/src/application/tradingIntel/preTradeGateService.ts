/**
 * preTradeGateService — verzamelt de echte toestand van één account en legt
 * die voor aan de ene poort (domain/tradingIntel/preTradeGate).
 *
 * Twee gebruikers: de handmatige knoppen (assessPreTrade) en de motor, die zijn
 * eigen breaker/dag-toestand al heeft en hier alleen de accountregels ophaalt
 * (loadAccountRules). Beide eindigen in dezelfde evaluatePreTradeGate, zodat
 * niemand controles in een component of een tweede motor hoeft na te bouwen.
 */
import {
  evaluatePreTradeGate,
  type OrderOrigin,
  type OrderSide,
  type PreTradeGateInput,
  type PreTradeVerdict,
} from '@/domain/tradingIntel/preTradeGate';
import type { RiskProfile } from '@/domain/tradingIntel/botTypes';
import { trailingBreakerThreshold, type AccountRiskSnapshot } from '@/domain/tradingIntel/accountRules';
import { openPositionRiskMoney, type InstrumentSpec } from '@/domain/tradingIntel/positionSizing';
import { highImpactReleaseToday, type CalendarEvent } from '@/domain/tradingIntel/economicCalendar';
import {
  getMetaApiConfig,
  metaApiInstrumentSpecFor,
  type MetaApiConfig,
} from '@/infrastructure/gateways/metaApiService';
import {
  brokerOpeningsTodayFor,
  dayLimitState,
  getEffectiveAccountState,
  placedTodayInProcess,
} from '@/infrastructure/gateways/brokerConnector';
import { readAccountRiskSnapshot, toInstrumentSpec } from '@/infrastructure/gateways/accountRiskSnapshot';
import { fetchEconomicReleases } from '@/infrastructure/gateways/researchSources';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import { getAccounts } from '@/infrastructure/persistence/tradingAccountsService';
import { getRiskProfile } from '@/infrastructure/persistence/tradingRiskService';
import {
  checkAndUpdateCircuitBreaker,
  forceTripCircuitBreaker,
} from '@/infrastructure/persistence/tradingCircuitBreakerService';

export interface AssessedOrder extends PreTradeVerdict {
  /** Het account waarop de order zou landen — hetzelfde dat brokerPlaceOrder kiest. */
  account: MetaApiConfig | null;
}

/** Hetzelfde account dat brokerPlaceOrder zou kiezen, of null als er geen is. */
export async function resolveOrderAccount(account?: MetaApiConfig | null): Promise<MetaApiConfig | null> {
  const meta = account ?? await getMetaApiConfig().catch(() => null);
  return meta?.enabled && meta.token && meta.accountId ? meta : null;
}

/** De instrumentspecificatie van de broker, of de reden waarom die er niet is. */
export async function loadInstrumentSpec(
  account: MetaApiConfig,
  symbol: string,
  currency?: string | null,
): Promise<{ ok: true; spec: InstrumentSpec } | { ok: false; error: string }> {
  const r = await metaApiInstrumentSpecFor(account, symbol);
  return r.ok ? { ok: true, spec: toInstrumentSpec(r.spec, currency) } : r;
}

let releaseCache: { at: number; events: CalendarEvent[] } | null = null;
async function releasesCached(): Promise<CalendarEvent[] | null> {
  if (releaseCache && Date.now() - releaseCache.at < 60 * 60_000) return releaseCache.events;
  const events = await fetchEconomicReleases().catch(() => null);
  if (events) releaseCache = { at: Date.now(), events };
  return events;
}

/**
 * De accountregels voor een opening: snapshot van de broker, nieuws als het
 * profiel dat vraagt. Onleesbaar = een regel die blokkeert, niet een lege lijst.
 */
async function loadAccountRules(input: {
  account: MetaApiConfig;
  profile: RiskProfile;
  symbol: string;
  proposedRiskMoney: number | null;
}): Promise<{ ok: true; rules: NonNullable<PreTradeGateInput['rules']> } | { ok: false; error: string }> {
  const snap = await readAccountRiskSnapshot(input.account, input.profile);
  if (!snap.ok) return { ok: false, error: `Account rules unreadable (${snap.error}) — refusing to open blind` };
  return { ok: true, rules: await rulesFromSnapshot(input.profile, snap.snapshot, input.symbol, input.proposedRiskMoney) };
}

/** Regels uit een snapshot die de aanroeper al heeft (de motor sized er ook mee). */
export async function rulesFromSnapshot(
  profile: RiskProfile,
  snapshot: AccountRiskSnapshot,
  symbol: string,
  proposedRiskMoney: number | null,
): Promise<NonNullable<PreTradeGateInput['rules']>> {
  const highImpactToday = profile.newsRestriction === 'high_impact_day'
    ? highImpactReleaseToday({ pairId: symbol, events: await releasesCached() })
    : null;
  return { profile, snapshot, context: { symbol, proposedRiskMoney, highImpactToday } };
}

/** Het bedrag waarover risk/trade berekend wordt, volgens het profiel. */
export function sizingBaseAmount(profile: RiskProfile, snapshot: AccountRiskSnapshot): number {
  if (profile.sizingBase === 'initialBalance' && profile.initialBalance && profile.initialBalance > 0) return profile.initialBalance;
  if (profile.sizingBase === 'balance') return snapshot.balance;
  return snapshot.equity;
}

/**
 * Een statische drawdown die werkelijk overschreden is, laat de breaker van dat
 * account klappen: handmatig resetten, net als de trailing breaker. Een
 * dagverlies doet dat niet — dat herstelt bij de volgende dagstart.
 */
export async function tripOnHardBreach(verdict: PreTradeVerdict, account: MetaApiConfig | null, equity: number): Promise<void> {
  const hard = verdict.checks.find(c => c.id === 'totalDrawdown' && c.breach);
  if (hard && account) {
    await forceTripCircuitBreaker(hard.detail, equity, 'live', account.accountId).catch(() => { /* de poort blokkeert al */ });
  }
}

export async function assessPreTrade(input: {
  symbol: string;
  side: OrderSide;
  origin: OrderOrigin;
  account?: MetaApiConfig | null;
  confidence?: { value: number; floor: number };
  /** De order zelf, zodat de regels haar risico tot de stop kennen. */
  order?: { lots: number; stopLoss?: number | null; entry?: number | null };
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
  const tz = risk.resetTimezone || 'UTC';

  // Dezelfde breaker-aanroep als de motor: een drawdown die pas bij deze klik
  // zichtbaar wordt, laat de breaker ook hier klappen. Op een onleesbaar
  // account wordt hij niet aangeraakt (de piek mag niet van een nul komen).
  const breaker = effective.available
    ? await checkAndUpdateCircuitBreaker(
        effective.equity,
        trailingBreakerThreshold(risk),
        effective.isReal ? 'live' : 'paper',
        accountId,
      )
    : { tripped: false as const, trippedReason: undefined };

  const brokerCount = effective.isReal ? await brokerOpeningsTodayFor(target, tz) : null;
  const day = dayLimitState({
    isReal: effective.isReal,
    brokerCount,
    inProcessCount: placedTodayInProcess(accountId, tz),
    paperCount: 0,
  });
  const longQty = effective.available ? effective.positionQty(symbol) : 0;

  const gateBase: PreTradeGateInput = {
    origin: input.origin,
    symbol,
    side: input.side,
    accountId,
    mode: risk.mode,
    account: { known, available: effective.available, unavailableReason: effective.unavailableReason },
    breaker: { tripped: breaker.tripped, reason: breaker.trippedReason },
    dayLimit: { tradesToday: day.tradesToday, unverified: day.unverified, max: risk.maxTradesPerDay },
    allowShort: risk.allowShort,
    longPositionQty: longQty,
    confidence: input.confidence,
  };

  // Eerst de goedkope controles. Blokkeert daar al iets, dan is er geen reden
  // om de broker nog om specificaties en dealhistorie te vragen.
  const first = evaluatePreTradeGate(gateBase);
  const opening = !(input.side === 'sell' && longQty > 0);
  if (!first.allowed || !opening || !effective.available) return { ...first, account: target };

  // Risico van deze order tot zijn stop, met de tickwaarde van de broker.
  let proposedRiskMoney: number | null = null;
  if (input.order?.stopLoss != null && input.order.lots > 0) {
    const spec = await loadInstrumentSpec(target, symbol);
    if (!spec.ok) {
      return { ...evaluatePreTradeGate({ ...gateBase, account: { known, available: false, unavailableReason: `Instrument spec unreadable (${spec.error})` } }), account: target };
    }
    const entry = input.order.entry ?? (await fetchMarketSnapshot(symbol)).last;
    proposedRiskMoney = openPositionRiskMoney({
      side: input.side, volume: input.order.lots, openPrice: entry, stopLoss: input.order.stopLoss, spec: spec.spec,
    });
  }

  const rules = await loadAccountRules({ account: target, profile: risk, symbol, proposedRiskMoney });
  if (!rules.ok) {
    return { ...evaluatePreTradeGate({ ...gateBase, account: { known, available: false, unavailableReason: rules.error } }), account: target };
  }
  const verdict = evaluatePreTradeGate({ ...gateBase, rules: rules.rules });
  await tripOnHardBreach(verdict, target, effective.equity);
  return { ...verdict, account: target };
}
