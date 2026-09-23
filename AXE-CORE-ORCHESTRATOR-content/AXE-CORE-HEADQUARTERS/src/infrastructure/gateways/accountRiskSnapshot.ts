/**
 * accountRiskSnapshot — de cijfers die de accountregels nodig hebben, van de
 * broker zelf gelezen.
 *
 * Saldo bij dagstart wordt uitgerekend, niet bewaard: saldo nu min wat er sinds
 * de reset gerealiseerd is (winst, commissie, swap) en min stortingen van
 * vandaag. Zo klopt hij ook als de app pas om drie uur 's middags opstart, en
 * hoeft er geen staat te bestaan die kan verouderen.
 *
 * Open risico is per positie het verlies tot haar stop, met de tickwaarde van
 * de broker. Een positie zonder stop heeft onbegrensd risico (null), en een
 * positie waarvan de tickwaarde niet leesbaar was ook — "onbekend" is hier
 * nooit "nul".
 */
import type { RiskProfile } from '@/domain/tradingIntel/botTypes';
import {
  tradingDayKey,
  tradingDayStart,
  type AccountRiskSnapshot,
} from '@/domain/tradingIntel/accountRules';
import { openPositionRiskMoney, type InstrumentSpec } from '@/domain/tradingIntel/positionSizing';
import {
  metaApiAccountInfoFor,
  metaApiGetHistoryDealsFor,
  metaApiInstrumentSpecFor,
  metaApiPositionsFor,
  type BrokerInstrumentSpec,
  type MetaApiConfig,
  type MetaApiDeal,
} from '@/infrastructure/gateways/metaApiService';
import { getCircuitBreakerState } from '@/infrastructure/persistence/tradingCircuitBreakerService';

export function toInstrumentSpec(b: BrokerInstrumentSpec, currency?: string | null): InstrumentSpec {
  return { ...b, accountCurrency: currency ?? null, source: 'broker' };
}

const isTradeDeal = (d: MetaApiDeal) => d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL';
const dealNet = (d: MetaApiDeal) => (d.profit ?? 0) + (d.commission ?? 0) + (d.swap ?? 0);

/** Gerealiseerd resultaat en saldobewegingen (stortingen/opnames) in een reeks deals. */
function splitDeals(deals: MetaApiDeal[]): { realized: number; balanceOps: number } {
  let realized = 0;
  let balanceOps = 0;
  for (const d of deals) {
    if (isTradeDeal(d)) realized += dealNet(d);
    else if (d.type === 'DEAL_TYPE_BALANCE' || d.type === 'DEAL_TYPE_CREDIT') balanceOps += d.profit ?? 0;
  }
  return { realized, balanceOps };
}

/** Gesloten resultaat per handelsdag, en het aantal dagen met een opening. */
function dailyHistory(deals: MetaApiDeal[], timeZone: string): { daily: Map<string, number>; tradingDays: number } {
  const daily = new Map<string, number>();
  const openDays = new Set<string>();
  for (const d of deals) {
    if (!isTradeDeal(d)) continue;
    const t = Date.parse(String(d.time ?? ''));
    if (!Number.isFinite(t)) continue;
    const key = tradingDayKey(t, timeZone);
    daily.set(key, (daily.get(key) ?? 0) + dealNet(d));
    if (d.entryType === 'DEAL_ENTRY_IN' || d.entryType === 'DEAL_ENTRY_INOUT') openDays.add(key);
  }
  return { daily, tradingDays: openDays.size };
}

const historyCache = new Map<string, { at: number; daily: Map<string, number>; tradingDays: number }>();
const HISTORY_TTL_MS = 10 * 60_000;

export async function readAccountRiskSnapshot(
  cfg: MetaApiConfig,
  profile: RiskProfile,
  now: number = Date.now(),
): Promise<{ ok: true; snapshot: AccountRiskSnapshot } | { ok: false; error: string }> {
  const tz = profile.resetTimezone || 'UTC';
  const dayStart = tradingDayStart(now, tz);
  const [info, positions, today, breaker] = await Promise.all([
    metaApiAccountInfoFor(cfg),
    metaApiPositionsFor(cfg),
    metaApiGetHistoryDealsFor(cfg, new Date(dayStart).toISOString(), new Date(now).toISOString()),
    getCircuitBreakerState(cfg.accountId).catch(() => null),
  ]);
  if (!info.ok || info.info.equity == null || info.info.balance == null) {
    return { ok: false, error: `account unreadable: ${info.ok ? 'no balance/equity' : info.error}` };
  }
  if (!positions.ok) return { ok: false, error: `positions unreadable: ${positions.error}` };
  // Zonder de deals van vandaag is de dagstart niet te bepalen — en dan is een
  // dagverliesgrens niet te bewaken. Dat is een weigering, geen nul.
  if (!today.ok) return { ok: false, error: `today's deals unreadable: ${today.error}` };

  const { balance, equity, currency } = info.info as { balance: number; equity: number; currency: string | null };
  const { realized, balanceOps } = splitDeals(today.deals);

  const specs = new Map<string, InstrumentSpec | null>();
  const openPositions: AccountRiskSnapshot['openPositions'] = [];
  for (const raw of positions.positions as Record<string, unknown>[]) {
    const symbol = String(raw.symbol ?? '');
    if (!specs.has(symbol)) {
      const r = await metaApiInstrumentSpecFor(cfg, symbol);
      specs.set(symbol, r.ok ? toInstrumentSpec(r.spec, currency) : null);
    }
    const spec = specs.get(symbol);
    const side = String(raw.type ?? '').toUpperCase().includes('SELL') ? 'sell' : 'buy';
    openPositions.push({
      symbol,
      riskMoney: spec
        ? openPositionRiskMoney({
            side, volume: Number(raw.volume) || 0, openPrice: Number(raw.openPrice) || 0,
            stopLoss: raw.stopLoss == null ? null : Number(raw.stopLoss), spec,
          })
        : null,
    });
  }

  let dailyClosedPnl: Map<string, number> | null = null;
  let tradingDays: number | null = null;
  const wantsHistory = (profile.consistencyPct ?? 0) > 0 || (profile.minTradingDays ?? 0) > 0;
  if (wantsHistory && profile.startedAt && Number.isFinite(Date.parse(profile.startedAt))) {
    const key = `${cfg.accountId}|${tz}|${profile.startedAt}`;
    const hit = historyCache.get(key);
    if (hit && now - hit.at < HISTORY_TTL_MS) {
      dailyClosedPnl = hit.daily;
      tradingDays = hit.tradingDays;
    } else {
      const hist = await metaApiGetHistoryDealsFor(cfg, new Date(profile.startedAt).toISOString(), new Date(now).toISOString());
      if (hist.ok) {
        const h = dailyHistory(hist.deals, tz);
        dailyClosedPnl = h.daily;
        tradingDays = h.tradingDays;
        historyCache.set(key, { at: now, ...h });
      }
    }
  }

  return {
    ok: true,
    snapshot: {
      now,
      balance,
      equity,
      currency,
      dayStartBalance: balance - realized - balanceOps,
      peakEquity: breaker?.peakEquity ?? null,
      openPositions,
      dailyClosedPnl,
      tradingDays,
    },
  };
}
