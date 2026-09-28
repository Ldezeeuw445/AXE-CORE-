/**
 * tradePlan — de stop en het doel van een trade, en de ATR waar ze op rusten.
 *
 * Eén definitie voor live en voor de Strategy Lab. De motor rekende de stop in
 * tradingAgentEngine zelf uit; de backtest kende helemaal geen stop. Een lab
 * dat een andere stop gebruikt dan de live motor test een andere strategie.
 */

/** 1,5 × ATR stop, doel op 1,5R — de constanten van de live motor. */
export const LIVE_SL_ATR_MULTIPLE = 1.5;
export const LIVE_REWARD_RISK = 1.5;

export interface OhlcLike { o: number; h: number; l: number; c: number }

/**
 * ATR over de laatste `period` bars van `bars`: gemiddelde true range, met de
 * slotkoers van de vorige bar binnen dezelfde reeks (de eerste gebruikt zijn
 * eigen open). Exact de formule die marketDataService.atr altijd had.
 */
export function atrOf(bars: readonly OhlcLike[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const slice = bars.slice(-period);
  let sum = 0;
  for (let i = 0; i < slice.length; i++) {
    const b = slice[i];
    const prevClose = i > 0 ? slice[i - 1].c : b.o;
    sum += Math.max(b.h - b.l, Math.abs(b.h - prevClose), Math.abs(b.l - prevClose));
  }
  return sum / slice.length;
}

/** ATR op bar `i`, alleen uit bars t/m i — geen blik vooruit. */
export function atrAt(bars: readonly OhlcLike[], i: number, period = 14): number | null {
  if (i < 0) return null;
  return atrOf(bars.slice(Math.max(0, i - period), i + 1), period);
}

export interface ProtectiveLevels { stopLoss: number; takeProfit: number | null; stopDistance: number }

/**
 * Stop en doel voor een opening op `entry`. Zonder bruikbare ATR 1% van de koers
 * als stopafstand, zoals de live motor altijd deed. rewardRisk null = geen doel.
 */
export function protectiveLevels(input: {
  side: 'buy' | 'sell';
  entry: number;
  atr: number | null;
  atrMultiple?: number;
  rewardRisk?: number | null;
}): ProtectiveLevels {
  const mult = input.atrMultiple ?? LIVE_SL_ATR_MULTIPLE;
  const rr = input.rewardRisk === undefined ? LIVE_REWARD_RISK : input.rewardRisk;
  const stopDistance = (input.atr != null && input.atr > 0 ? input.atr : input.entry * 0.01) * mult;
  const dir = input.side === 'buy' ? 1 : -1;
  return {
    stopDistance,
    stopLoss: input.entry - dir * stopDistance,
    takeProfit: rr == null ? null : input.entry + dir * stopDistance * rr,
  };
}
