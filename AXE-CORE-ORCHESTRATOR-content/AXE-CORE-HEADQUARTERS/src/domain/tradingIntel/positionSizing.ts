/**
 * positionSizing — "risk %" betekent geld dat verloren gaat als de stop raakt.
 *
 * ## Wat het was
 *
 * De motor rekende `qty = equity × risk% / koers`: een notionele blootstelling,
 * geen risico. De stop werd pas daarna uitgerekend, en qtyToLots zette qty met
 * een symbool-regex om naar lots met een plafond van één lot. 0,5% "risico" op
 * 100k EURUSD werd zo 1 lot — wat er bij de stop verloren ging hing af van de
 * ATR, niet van de instelling.
 *
 * ## Wat het nu is
 *
 *   lots = risicogeld / (stopafstand / tickSize × tickValue)
 *
 * tickValue is de waarde van één tick per lot in de accountvaluta — de broker
 * geeft die (MetaAPI: lossTickValue), dus valuta-omrekening zit er al in.
 * Afronden gaat altijd NAAR BENEDEN op de volumestap: een halve stap omhoog is
 * meer risico dan ingesteld. Past zelfs het minimum lot niet in het budget,
 * dan is het antwoord nul, niet het minimum.
 *
 * Pure rekenkunde, zodat live handel en de Strategy Lab-backtest dezelfde
 * definitie gebruiken.
 */

export interface InstrumentSpec {
  symbol: string;
  /** Kleinste prijsstap. */
  tickSize: number;
  /** Accountvaluta per tick per 1 lot, voor een verliezende beweging. */
  lossTickValue: number;
  /** Eenheden per lot (100 000 voor FX, 100 oz voor goud, …). */
  contractSize: number;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  accountCurrency?: string | null;
  /** 'broker' = uit de specificatie van dit account; 'estimate' = benadering. */
  source: 'broker' | 'estimate';
}

/** Verlies in accountvaluta per 1 lot als de prijs `distance` tegen je in loopt. */
function moneyPerLotForDistance(spec: InstrumentSpec, distance: number): number {
  if (!(spec.tickSize > 0) || !(spec.lossTickValue > 0) || !(distance > 0)) return NaN;
  return (distance / spec.tickSize) * spec.lossTickValue;
}

/** Rond naar beneden af op de volumestap, zonder zwevendekommaresten. */
export function floorToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  const decimals = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step))));
  const n = Math.floor(value / step + 1e-9) * step;
  return Number(n.toFixed(decimals));
}

export interface RiskSizing {
  lots: number;
  /** Het budget dat de instelling toestond. */
  riskBudget: number;
  /** Wat er na afronden echt verloren gaat bij de stop. */
  riskAtStop: number;
  stopDistance: number;
  moneyPerLot: number;
  /** Waarom er niets gehandeld wordt, als lots 0 is. */
  refused?: string;
}

export function sizeLotsForRisk(input: {
  riskBudget: number;
  entry: number;
  stop: number;
  spec: InstrumentSpec;
}): RiskSizing {
  const { riskBudget, entry, stop, spec } = input;
  const stopDistance = Math.abs(entry - stop);
  const moneyPerLot = moneyPerLotForDistance(spec, stopDistance);
  const base = { riskBudget, stopDistance, moneyPerLot, lots: 0, riskAtStop: 0 };
  if (!(riskBudget > 0)) return { ...base, refused: 'risk budget is zero' };
  if (!(stopDistance > 0)) return { ...base, refused: 'no stop distance — cannot size by risk' };
  if (!Number.isFinite(moneyPerLot) || moneyPerLot <= 0) {
    return { ...base, refused: `no usable tick value for ${spec.symbol}` };
  }
  const raw = riskBudget / moneyPerLot;
  let lots = floorToStep(raw, spec.volumeStep);
  if (spec.maxVolume > 0) lots = Math.min(lots, spec.maxVolume);
  if (lots < spec.minVolume || lots <= 0) {
    const minRisk = spec.minVolume * moneyPerLot;
    return {
      ...base,
      refused: `minimum ${spec.minVolume} lot would risk ${minRisk.toFixed(2)} at the stop, above the ${riskBudget.toFixed(2)} budget`,
    };
  }
  return { ...base, lots, riskAtStop: lots * moneyPerLot };
}

/**
 * Geld dat een open positie nog kan verliezen tot haar stop.
 *
 * null = geen stop: het risico is onbegrensd, en dat is precies wat een
 * max-open-risk-regel moet kunnen zien. 0 = de stop ligt al aan de winstkant
 * van de instap (vergrendelde winst).
 */
export function openPositionRiskMoney(input: {
  side: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  stopLoss: number | null | undefined;
  spec: InstrumentSpec;
}): number | null {
  const { side, volume, openPrice, stopLoss, spec } = input;
  if (stopLoss == null || !Number.isFinite(stopLoss) || stopLoss <= 0) return null;
  const adverse = side === 'buy' ? openPrice - stopLoss : stopLoss - openPrice;
  if (adverse <= 0) return 0;
  const perLot = moneyPerLotForDistance(spec, adverse);
  return Number.isFinite(perLot) ? perLot * volume : null;
}
