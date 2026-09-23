/**
 * preTradeGate — de ene poort waar elke order doorheen moet.
 *
 * De harde controles (circuit breaker, dagmaximum, shorts, vertrouwensvloer)
 * stonden alleen in tradingAgentEngine. brokerPlaceOrder controleerde niets, en
 * de knop "Manual desk execution" op de grafiek riep hem rechtstreeks aan — plus
 * metaApiMarketOrder als de broker weigerde, plus een papieren vulling als ook
 * dat mislukte. Een account met een geklapte breaker of een uitgeputte dag kon
 * dus met één klik toch een positie openen, ook na de kill switch (die werkt
 * door elke breaker te laten klappen).
 *
 * Deze module beslist; ze leest niets. De motor en het handmatige pad verzamelen
 * elk hun eigen toestand en leggen die hier voor, zodat er één definitie bestaat
 * van "mag deze order weg". Een toelating (`PreTradeClearance`) is het enige
 * waarmee brokerPlaceOrder nog een order verstuurt.
 */

import type { RiskProfile } from '@/domain/tradingIntel/botTypes';
import {
  evaluateAccountRules,
  type AccountRiskSnapshot,
  type AccountRuleContext,
  type RuleCheckId,
} from '@/domain/tradingIntel/accountRules';

export type OrderSide = 'buy' | 'sell';
export type OrderOrigin = 'agent' | 'manual';

export type GateCheckId = 'account' | 'breaker' | 'dayLimit' | 'allowShort' | 'confidence' | RuleCheckId;
export type GateStatus = 'PASS' | 'BLOCK' | 'SKIP';

export interface GateCheck {
  id: GateCheckId;
  status: GateStatus;
  detail: string;
  /** Een grens is echt overschreden (zie accountRules.RuleCheck.breach). */
  breach?: boolean;
}

export interface PreTradeGateInput {
  origin: OrderOrigin;
  symbol: string;
  side: OrderSide;
  /** Broker-accountId waar de order landt; null = alleen het papieren boek. */
  accountId: string | null;
  /** Risicomodus van dat account, alleen voor de meldingen. */
  mode: string;
  account: {
    /** Staat het account in de accountlijst? Een onbekend account krijgt niets. */
    known: boolean;
    /** Kon de toestand (equity, posities) deze keer gelezen worden? */
    available: boolean;
    unavailableReason?: string | null;
  };
  breaker: { tripped: boolean; reason?: string | null };
  dayLimit: { tradesToday: number; unverified: boolean; max: number };
  allowShort: boolean;
  /** Bestaande long in dit symbool op dit account. */
  longPositionQty: number;
  /**
   * Alleen voor de motor. Een handmatige order is een menselijk besluit; daar
   * geldt geen vertrouwensvloer van de agent. De harde grenzen wel.
   */
  confidence?: { value: number; floor: number };
  /**
   * De accountregels (dagverlies, statische drawdown, open risico, posities,
   * doelen, consistentie, sessie, nieuws). Alleen voor een OPENING; een
   * sluitende order verkleint risico en hoort hier niet op te stuiten.
   */
  rules?: { profile: RiskProfile; snapshot: AccountRiskSnapshot; context: AccountRuleContext };
}

declare const clearanceBrand: unique symbol;

/** Bewijs dat de poort deze ene order heeft doorgelaten. */
export interface PreTradeClearance {
  readonly [clearanceBrand]: true;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly accountId: string | null;
  readonly origin: OrderOrigin;
  readonly issuedAt: number;
}

export interface PreTradeVerdict {
  allowed: boolean;
  /** Eerste controle die blokkeerde. */
  blockedBy?: GateCheckId;
  /** Leesbare reden, zoals hij in het spoor en de toast verschijnt. */
  reason?: string;
  checks: GateCheck[];
  clearance?: PreTradeClearance;
}

/** Een toelating is kort geldig: ze beschrijft de toestand van dat moment. */
export const CLEARANCE_TTL_MS = 60_000;

export function evaluatePreTradeGate(input: PreTradeGateInput, now: number = Date.now()): PreTradeVerdict {
  const checks: GateCheck[] = [];
  const mode = input.mode;

  // Volgorde gelijk aan de motor van vóór deze module: breaker, onleesbare dag,
  // volle dag, vertrouwen. De eerste blokkade is de reden die de gebruiker ziet.
  if (!input.account.known) {
    checks.push({ id: 'account', status: 'BLOCK', detail: 'Account not registered in Trading accounts' });
  } else if (!input.account.available) {
    checks.push({
      id: 'account', status: 'BLOCK',
      detail: `${input.account.unavailableReason ?? 'Account state unreadable'} — refusing to trade blind`,
    });
  } else {
    checks.push({ id: 'account', status: 'PASS', detail: input.accountId ? `account ${input.accountId.slice(0, 8)}` : 'paper book' });
  }

  checks.push(input.breaker.tripped
    ? { id: 'breaker', status: 'BLOCK', detail: input.breaker.reason || 'Circuit breaker tripped — reset manually to resume' }
    : { id: 'breaker', status: 'PASS', detail: 'Circuit breaker OK' });

  if (input.dayLimit.unverified) {
    checks.push({ id: 'dayLimit', status: 'BLOCK', detail: `Day-limit unreadable at broker — holding rather than trading blind [${mode}]` });
  } else if (input.dayLimit.tradesToday >= input.dayLimit.max) {
    checks.push({ id: 'dayLimit', status: 'BLOCK', detail: `Max trades/day (${input.dayLimit.max}) [${mode}]` });
  } else {
    checks.push({ id: 'dayLimit', status: 'PASS', detail: `${input.dayLimit.tradesToday}/${input.dayLimit.max} today` });
  }

  const opensShort = input.side === 'sell' && input.longPositionQty <= 0;
  const reducesLong = input.side === 'sell' && input.longPositionQty > 0;
  if (!opensShort) {
    checks.push({ id: 'allowShort', status: 'SKIP', detail: input.side === 'buy' ? 'long' : 'reduces an existing long' });
  } else if (!input.allowShort) {
    checks.push({ id: 'allowShort', status: 'BLOCK', detail: `Shorts disabled on this account [${mode}]` });
  } else {
    checks.push({ id: 'allowShort', status: 'PASS', detail: 'shorts allowed' });
  }

  if (!input.confidence) {
    checks.push({ id: 'confidence', status: 'SKIP', detail: input.origin === 'manual' ? 'manual order — human decision' : 'no floor given' });
  } else if (input.confidence.value < input.confidence.floor) {
    checks.push({
      id: 'confidence', status: 'BLOCK',
      detail: `Confidence ${(input.confidence.value * 100).toFixed(0)}% < floor ${(input.confidence.floor * 100).toFixed(0)}%`,
    });
  } else {
    checks.push({ id: 'confidence', status: 'PASS', detail: `${(input.confidence.value * 100).toFixed(0)}% ≥ ${(input.confidence.floor * 100).toFixed(0)}%` });
  }

  if (input.rules && !reducesLong) {
    checks.push(...evaluateAccountRules(input.rules.profile, input.rules.snapshot, input.rules.context));
  }

  const block = checks.find(c => c.status === 'BLOCK');
  if (block) return { allowed: false, blockedBy: block.id, reason: block.detail, checks };

  const clearance = {
    symbol: input.symbol.trim().toUpperCase(),
    side: input.side,
    accountId: input.accountId,
    origin: input.origin,
    issuedAt: now,
  } as PreTradeClearance;
  return { allowed: true, checks, clearance };
}

/**
 * Controle aan de broker-grens. Ook als iemand het type omzeilt (`as any`), of
 * een toelating voor een ander symbool, een andere kant of een ander account
 * hergebruikt, gaat er geen order weg.
 */
export function verifyClearance(
  clearance: PreTradeClearance | null | undefined,
  order: { symbol: string; side: OrderSide; accountId: string | null },
  now: number = Date.now(),
): { ok: true } | { ok: false; error: string } {
  if (!clearance || typeof clearance !== 'object') {
    return { ok: false, error: 'Order refused: no pre-trade clearance (risk gate not consulted)' };
  }
  if (clearance.symbol !== order.symbol.trim().toUpperCase() || clearance.side !== order.side) {
    return { ok: false, error: 'Order refused: clearance was issued for a different order' };
  }
  if ((clearance.accountId ?? null) !== (order.accountId ?? null)) {
    return { ok: false, error: 'Order refused: clearance was issued for a different account' };
  }
  if (!(now - clearance.issuedAt >= 0 && now - clearance.issuedAt <= CLEARANCE_TTL_MS)) {
    return { ok: false, error: 'Order refused: pre-trade clearance expired — re-check risk' };
  }
  return { ok: true };
}
