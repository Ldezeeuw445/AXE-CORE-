/**
 * manualOrders — de knoppen op de grafiek, door dezelfde poort als AXE Algo.
 *
 * Tot nu toe riep de grafiek brokerPlaceOrder rechtstreeks aan. Weigerde de
 * broker, dan probeerde hij metaApiMarketOrder zonder enige controle, en daarna
 * een papieren vulling. Na een geklapte breaker of de kill switch kon een klik
 * dus nog steeds een echte positie openen.
 *
 * Nu: eerst de poort (preTradeGateService → evaluatePreTradeGate), dan precies
 * één broker-aanroep met de toelating. Weigert de poort of de broker, dan is dat
 * het antwoord. Er is geen tweede route en geen papieren terugval: een
 * handmatige papieren vulling belandde in het leergeheugen alsof hij echt was.
 */
import type { PendingOrderType } from '@/infrastructure/gateways/metaApiService';
import {
  brokerPlaceOrder,
  brokerPlacePendingOrder,
  pendingSide,
} from '@/infrastructure/gateways/brokerConnector';
import { assessPreTrade } from '@/application/tradingIntel/preTradeGateService';
import type { GateCheck, OrderSide } from '@/domain/tradingIntel/preTradeGate';

export type ManualOrderResult =
  | { ok: true; venue: string; price?: number; tradeId?: string; orderId?: string; checks: GateCheck[] }
  | { ok: false; stage: 'gate' | 'broker'; error: string; checks: GateCheck[] };

export async function placeManualMarketOrder(input: {
  symbol: string;
  side: OrderSide;
  qty: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}): Promise<ManualOrderResult> {
  if (!Number.isFinite(input.qty) || input.qty <= 0) {
    return { ok: false, stage: 'gate', error: 'Invalid quantity', checks: [] };
  }
  const verdict = await assessPreTrade({ symbol: input.symbol, side: input.side, origin: 'manual' });
  if (!verdict.allowed || !verdict.clearance) {
    return { ok: false, stage: 'gate', error: verdict.reason ?? 'Blocked by risk gate', checks: verdict.checks };
  }
  const res = await brokerPlaceOrder({
    account: verdict.account ?? undefined,
    symbol: input.symbol,
    side: input.side,
    qty: input.qty,
    reason: 'Manual desk execution',
    confidence: 1,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    clearance: verdict.clearance,
  });
  if (!res.ok) return { ok: false, stage: 'broker', error: res.error ?? 'Order rejected', checks: verdict.checks };
  return { ok: true, venue: res.venue ?? 'broker', price: res.price, tradeId: res.tradeId, checks: verdict.checks };
}

export async function placeManualPendingOrder(input: {
  symbol: string;
  type: PendingOrderType;
  qty: number;
  openPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  slippagePoints?: number;
}): Promise<ManualOrderResult> {
  if (!Number.isFinite(input.qty) || input.qty <= 0) {
    return { ok: false, stage: 'gate', error: 'Invalid quantity', checks: [] };
  }
  // Wachtende orders gaan altijd naar het actieve account (brokerPlacePendingOrder
  // kent geen ander), dus de poort beoordeelt ook dat account.
  const verdict = await assessPreTrade({ symbol: input.symbol, side: pendingSide(input.type), origin: 'manual' });
  if (!verdict.allowed || !verdict.clearance) {
    return { ok: false, stage: 'gate', error: verdict.reason ?? 'Blocked by risk gate', checks: verdict.checks };
  }
  const res = await brokerPlacePendingOrder({
    symbol: input.symbol,
    type: input.type,
    qty: input.qty,
    openPrice: input.openPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    slippagePoints: input.slippagePoints,
    reason: 'Manual desk pending order',
    confidence: 1,
    clearance: verdict.clearance,
  });
  if (!res.ok) return { ok: false, stage: 'broker', error: res.error ?? 'Pending order rejected', checks: verdict.checks };
  return { ok: true, venue: res.venue ?? 'metaapi', orderId: res.orderId, checks: verdict.checks };
}
