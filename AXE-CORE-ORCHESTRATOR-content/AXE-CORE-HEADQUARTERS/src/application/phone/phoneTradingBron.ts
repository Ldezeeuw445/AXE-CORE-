/**
 * Eén gedeelde bron voor de telefoon-Trading-tab. CompanionChart pollt
 * MetaAPI (candles + ticks + positions + orders) en PhoneTrading deed
 * daarnaast nog een positions-GET — dat is de 429 op de A17.
 *
 * Grafiek: lockscreen-spark, anders de publieke feed (LSE/Binance/Stooq),
 * nooit de broker. Posities: hooguit één in-flight request, 5 min cache,
 * geen poll per render.
 */
import { brokerFoutTekst } from '@/domain/phone/phoneGrafiek';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import { metaApiGetPositions } from '@/infrastructure/gateways/metaApiService';

const TTL_MS = 5 * 60_000;

export interface PhonePositie {
  symbol: string;
  volume: string;
  pnl: string;
}

export type PhonePositieStand =
  | { soort: 'rijen'; rijen: PhonePositie[] }
  | { soort: 'leeg' }
  | { soort: 'gepauzeerd'; tekst: string };

function positieRij(raw: unknown): PhonePositie {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return {
    symbol: String(o.symbol ?? o.symbolName ?? '—'),
    volume: String(o.volume ?? o.quantity ?? o.qty ?? '—'),
    pnl: String(o.profit ?? o.unrealizedProfit ?? o.floating ?? '—'),
  };
}

let positieCache: { at: number; stand: PhonePositieStand } | null = null;
let positieInflight: Promise<PhonePositieStand> | null = null;

export async function leesPhonePosities(nu = Date.now()): Promise<PhonePositieStand> {
  if (positieCache && nu - positieCache.at < TTL_MS) return positieCache.stand;
  if (positieInflight) return positieInflight;
  positieInflight = (async () => {
    const r = await metaApiGetPositions();
    const stand: PhonePositieStand = !r.ok
      ? { soort: 'gepauzeerd', tekst: brokerFoutTekst(r.error) }
      : r.positions.length === 0
        ? { soort: 'leeg' }
        : { soort: 'rijen', rijen: r.positions.map(positieRij) };
    positieCache = { at: Date.now(), stand };
    return stand;
  })().finally(() => { positieInflight = null; });
  return positieInflight;
}

const sparkCache = new Map<string, { at: number; punten: number[] }>();
let sparkInflight = new Map<string, Promise<number[]>>();

/** Publieke candles (geen MetaAPI). Synthetic goud ~100 telt niet als grafiek. */
export async function leesPubliekeSpark(symbol: string, nu = Date.now()): Promise<number[]> {
  const key = symbol.trim().toUpperCase();
  const hit = sparkCache.get(key);
  if (hit && nu - hit.at < TTL_MS) return hit.punten;
  const bezig = sparkInflight.get(key);
  if (bezig) return bezig;
  const werk = (async () => {
    const snap = await fetchMarketSnapshot(key, 'h1', { priority: 'background', skipBroker: true });
    const punten = snap.source === 'synthetic'
      ? []
      : snap.bars.map((b) => b.c).filter((n) => Number.isFinite(n));
    sparkCache.set(key, { at: Date.now(), punten });
    return punten;
  })().finally(() => { sparkInflight.delete(key); });
  sparkInflight.set(key, werk);
  return werk;
}

/** Tests. */
export function wisPhoneTradingBron() {
  positieCache = null;
  positieInflight = null;
  sparkCache.clear();
  sparkInflight = new Map();
}
