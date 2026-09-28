/**
 * accountRules — de accountregels die tot nu toe alleen op het scherm stonden.
 *
 * "Daily loss halt — stops trading for the day", "Max open risk", "Profit
 * target": bewaard, getoond, en door geen enkele beslissing gelezen. Hier
 * worden ze regels. Eén pure functie, zodat de live poort (preTradeGate) en de
 * funded-simulator van de Strategy Lab exact hetzelfde betekenen met dezelfde
 * woorden.
 *
 * Alles is per account en optioneel: een profiel zonder een veld legt die regel
 * niet op. Geen propfirm staat hier hardgecodeerd; de presets zijn alleen
 * startwaarden.
 */
import type { RiskProfile, SessionWindow } from '@/domain/tradingIntel/botTypes';
import type { GateCheck } from '@/domain/tradingIntel/preTradeGate';

export interface AccountRiskSnapshot {
  now: number;
  balance: number;
  equity: number;
  currency?: string | null;
  /** Saldo toen de handelsdag (in resetTimezone) begon. */
  dayStartBalance: number;
  /** Hoogste equity ooit (de trailing breaker); null = onbekend. */
  peakEquity: number | null;
  /** Open posities met hun risico tot de stop; riskMoney null = geen stop. */
  openPositions: Array<{ symbol: string; riskMoney: number | null }>;
  /** Gesloten P&L per handelsdag sinds startedAt, voor consistentie; null = niet gelezen. */
  dailyClosedPnl?: Map<string, number> | null;
  /** Dagen met minstens één geopende trade sinds startedAt; null = niet gelezen. */
  tradingDays?: number | null;
}

export interface AccountRuleContext {
  symbol: string;
  /** Risico van de voorgestelde order tot zijn stop; null = geen stop meegegeven. */
  proposedRiskMoney: number | null;
  /** Is er vandaag een high-impact release voor dit paar? null = niet te beantwoorden. */
  highImpactToday?: boolean | null;
}

export type RuleCheckId =
  | 'dailyLoss' | 'totalDrawdown' | 'openRisk' | 'maxPositions'
  | 'dailyTarget' | 'profitTarget' | 'consistency' | 'session' | 'news';

export interface RuleCheck extends Omit<GateCheck, 'id'> {
  id: RuleCheckId;
  /**
   * true = een grens is werkelijk overschreden (niet alleen: deze order past
   * niet). Voor totale drawdown betekent dat: breaker laten klappen, handmatig
   * resetten. Een dagverlies herstelt zichzelf bij de volgende dagstart.
   */
  breach?: boolean;
}

/** YYYY-MM-DD van een moment in een tijdzone. Onbekende zone = UTC. */
export function tradingDayKey(ms: number, timeZone = 'UTC'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Het UTC-moment waarop de handelsdag van `ms` in `timeZone` begon. */
export function tradingDayStart(ms: number, timeZone = 'UTC'): number {
  const key = tradingDayKey(ms, timeZone);
  const midnightUtc = Date.parse(`${key}T00:00:00Z`);
  // Verschuiving van de zone rond dat moment, twee keer om DST-randen goed te krijgen.
  let guess = midnightUtc;
  for (let i = 0; i < 2; i++) guess = midnightUtc - zoneOffsetMs(guess, timeZone);
  return guess;
}

function zoneOffsetMs(ms: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(ms);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return asUtc - Math.floor(ms / 1000) * 1000;
  } catch {
    return 0;
  }
}

/** Weekdag (0 = zondag) en minuten na middernacht van `ms` in `timeZone`. */
function localClock(ms: number, timeZone: string): { weekday: number; minutes: number } {
  const local = new Date(ms + zoneOffsetMs(ms, timeZone));
  return { weekday: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  return h <= 24 && min < 60 ? h * 60 + min : null;
}

/** Valt `ms` binnen een van de vensters? Een venster over middernacht (22:00–02:00) mag. */
export function insideSession(ms: number, windows: SessionWindow[], timeZone = 'UTC'): boolean {
  const { weekday, minutes } = localClock(ms, timeZone);
  return windows.some(w => {
    const a = parseHm(w.start); const b = parseHm(w.end);
    if (a == null || b == null) return false;
    const days = w.days && w.days.length ? w.days : null;
    if (a <= b) return (!days || days.includes(weekday)) && minutes >= a && minutes < b;
    // Over middernacht: het deel na middernacht hoort bij de dag waarop het venster begon.
    if (minutes >= a) return !days || days.includes(weekday);
    if (minutes < b) return !days || days.includes((weekday + 6) % 7);
    return false;
  });
}

const pct = (x: number) => `${(x * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
const money = (x: number, ccy?: string | null) => `${x.toFixed(2)}${ccy ? ` ${ccy}` : ''}`;

/**
 * De accountregels voor één voorgestelde opening. Geeft alleen regels terug die
 * in het profiel staan; een ontbrekend veld levert geen regel op.
 */
export function evaluateAccountRules(
  profile: RiskProfile,
  snap: AccountRiskSnapshot,
  ctx: AccountRuleContext,
): RuleCheck[] {
  const out: RuleCheck[] = [];
  const tz = profile.resetTimezone || 'UTC';
  const ccy = snap.currency;
  const initial = profile.initialBalance && profile.initialBalance > 0 ? profile.initialBalance : null;
  const proposed = ctx.proposedRiskMoney;
  const todayPnl = snap.equity - snap.dayStartBalance;

  // ── Dagverlies: vandaag verloren (incl. zwevend) tegen de grens van vandaag.
  if (profile.maxDailyLossPct != null && profile.maxDailyLossPct > 0) {
    const useInitial = profile.dailyLossBase === 'initialBalance' && initial != null;
    const base = useInitial ? initial! : snap.dayStartBalance;
    const limit = profile.maxDailyLossPct * base;
    const lost = Math.max(0, snap.dayStartBalance - snap.equity);
    const headroom = limit - lost;
    const basis = useInitial ? 'initial balance' : 'day-start balance';
    if (lost >= limit) {
      out.push({ id: 'dailyLoss', status: 'BLOCK', breach: true,
        detail: `Daily loss ${money(lost, ccy)} reached the ${pct(profile.maxDailyLossPct)} limit (${money(limit, ccy)} of ${basis}) — halted until the ${tz} day resets` });
    } else if (proposed == null) {
      out.push({ id: 'dailyLoss', status: 'BLOCK',
        detail: `Order has no stop-loss — its loss is unbounded against ${money(headroom, ccy)} of daily headroom` });
    } else if (proposed > headroom) {
      out.push({ id: 'dailyLoss', status: 'BLOCK',
        detail: `Risk at stop ${money(proposed, ccy)} exceeds remaining daily headroom ${money(headroom, ccy)}` });
    } else {
      out.push({ id: 'dailyLoss', status: 'PASS', detail: `lost ${money(lost, ccy)} of ${money(limit, ccy)} today` });
    }
  }

  // ── Totale drawdown, statisch. Trailing is de bestaande circuit breaker.
  if (profile.maxDrawdownPct != null && profile.maxDrawdownPct > 0 && profile.drawdownType === 'static') {
    if (initial == null) {
      out.push({ id: 'totalDrawdown', status: 'SKIP',
        detail: 'Static drawdown needs a starting balance — the trailing breaker still applies' });
    } else {
      const floor = initial * (1 - profile.maxDrawdownPct);
      if (snap.equity <= floor) {
        out.push({ id: 'totalDrawdown', status: 'BLOCK', breach: true,
          detail: `Equity ${money(snap.equity, ccy)} at or below the static floor ${money(floor, ccy)} (${pct(profile.maxDrawdownPct)} of ${money(initial, ccy)})` });
      } else if (proposed == null || snap.equity - proposed < floor) {
        out.push({ id: 'totalDrawdown', status: 'BLOCK',
          detail: proposed == null
            ? `Order has no stop-loss — it could breach the static floor ${money(floor, ccy)}`
            : `Risk at stop ${money(proposed, ccy)} would take equity below the static floor ${money(floor, ccy)}` });
      } else {
        out.push({ id: 'totalDrawdown', status: 'PASS', detail: `${money(snap.equity - floor, ccy)} above static floor` });
      }
    }
  }

  // ── Open risico: alle stops samen plus deze order.
  if (profile.maxOpenRiskPct != null && profile.maxOpenRiskPct > 0) {
    const base = profile.sizingBase === 'initialBalance' && initial != null ? initial
      : profile.sizingBase === 'balance' ? snap.balance : snap.equity;
    const limit = profile.maxOpenRiskPct * base;
    const unbounded = snap.openPositions.filter(p => p.riskMoney == null).map(p => p.symbol);
    const open = snap.openPositions.reduce((s, p) => s + (p.riskMoney ?? 0), 0);
    if (unbounded.length) {
      out.push({ id: 'openRisk', status: 'BLOCK',
        detail: `Open position without a stop (${unbounded.join(', ')}) — open risk is unbounded` });
    } else if (proposed == null) {
      out.push({ id: 'openRisk', status: 'BLOCK', detail: 'Order has no stop-loss — open risk would be unbounded' });
    } else if (open + proposed > limit) {
      out.push({ id: 'openRisk', status: 'BLOCK',
        detail: `Open risk ${money(open, ccy)} + ${money(proposed, ccy)} exceeds ${pct(profile.maxOpenRiskPct)} (${money(limit, ccy)})` });
    } else {
      out.push({ id: 'openRisk', status: 'PASS', detail: `${money(open + proposed, ccy)} of ${money(limit, ccy)} at risk` });
    }
  }

  if (profile.maxConcurrentPositions != null && profile.maxConcurrentPositions > 0) {
    const n = snap.openPositions.length;
    out.push(n >= profile.maxConcurrentPositions
      ? { id: 'maxPositions', status: 'BLOCK', detail: `${n} positions open — max ${profile.maxConcurrentPositions}` }
      : { id: 'maxPositions', status: 'PASS', detail: `${n}/${profile.maxConcurrentPositions} open` });
  }

  if (profile.dailyProfitTargetPct != null && profile.dailyProfitTargetPct > 0) {
    const base = initial ?? snap.dayStartBalance;
    const target = profile.dailyProfitTargetPct * base;
    out.push(todayPnl >= target
      ? { id: 'dailyTarget', status: 'BLOCK', detail: `Daily target reached (${money(todayPnl, ccy)} ≥ ${money(target, ccy)}) — done for the ${tz} day` }
      : { id: 'dailyTarget', status: 'PASS', detail: `${money(todayPnl, ccy)} of ${money(target, ccy)} today` });
  }

  if (profile.profitTargetPct != null && profile.profitTargetPct > 0) {
    if (initial == null) {
      out.push({ id: 'profitTarget', status: 'SKIP', detail: 'Profit target needs a starting balance' });
    } else {
      const target = initial * profile.profitTargetPct;
      const made = snap.equity - initial;
      const action = profile.profitTargetAction ?? (profile.mode === 'funded_challenge' ? 'halt' : 'continue');
      const needDays = profile.minTradingDays ?? 0;
      const days = snap.tradingDays;
      const daysMet = needDays <= 0 || (days != null && days >= needDays);
      if (made < target) {
        out.push({ id: 'profitTarget', status: 'PASS', detail: `${money(made, ccy)} of ${money(target, ccy)} target` });
      } else if (!daysMet) {
        out.push({ id: 'profitTarget', status: 'PASS',
          detail: `Target reached; ${days ?? '?'} of ${needDays} minimum trading days — not yet passed` });
      } else if (action === 'halt') {
        out.push({ id: 'profitTarget', status: 'BLOCK', detail: `Profit target reached (${money(made, ccy)} ≥ ${money(target, ccy)}) — no new positions` });
      } else {
        out.push({ id: 'profitTarget', status: 'PASS', detail: `Profit target reached; profile continues trading` });
      }
    }
  }

  if (profile.consistencyPct != null && profile.consistencyPct > 0) {
    const closed = snap.dailyClosedPnl;
    if (!closed) {
      out.push({ id: 'consistency', status: 'SKIP', detail: 'Daily history not read — consistency not checked' });
    } else {
      const today = tradingDayKey(snap.now, tz);
      let total = 0;
      for (const [day, v] of closed) if (day !== today) total += v;
      total += todayPnl;
      // Het doel telt mee als ondergrens: vroeg in een challenge is "totaal" klein,
      // en de regel moet dan niet al na één trade de dag sluiten.
      const floor = initial != null && profile.profitTargetPct ? initial * profile.profitTargetPct : 0;
      const cap = profile.consistencyPct * Math.max(total, floor);
      out.push(cap > 0 && todayPnl >= cap
        ? { id: 'consistency', status: 'BLOCK', detail: `Today ${money(todayPnl, ccy)} ≥ ${pct(profile.consistencyPct)} consistency cap (${money(cap, ccy)})` }
        : { id: 'consistency', status: 'PASS', detail: `today ${money(todayPnl, ccy)} of ${money(cap, ccy)} cap` });
    }
  }

  if (profile.sessionWindows && profile.sessionWindows.length) {
    out.push(insideSession(snap.now, profile.sessionWindows, tz)
      ? { id: 'session', status: 'PASS', detail: `inside trading session (${tz})` }
      : { id: 'session', status: 'BLOCK', detail: `Outside configured trading session (${tz})` });
  }

  if (profile.newsRestriction === 'high_impact_day') {
    const h = ctx.highImpactToday;
    out.push(h === true
      ? { id: 'news', status: 'BLOCK', detail: `High-impact release today for ${ctx.symbol} — no new positions` }
      : h === false
        ? { id: 'news', status: 'PASS', detail: 'no high-impact release today' }
        : { id: 'news', status: 'SKIP', detail: 'not checked — calendar covers US releases only, or was unreachable' });
  }

  return out;
}

/** "08:00-17:00, 20:00-22:00" → vensters. Ongeldige stukken vallen weg; niets geldigs = geen sessieregel. */
export function parseSessionText(text: string, weekdaysOnly: boolean): SessionWindow[] | undefined {
  const windows = text.split(',').map(p => p.trim()).filter(Boolean).flatMap(p => {
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(p);
    return m && parseHm(m[1]) != null && parseHm(m[2]) != null
      ? [{ start: m[1], end: m[2], ...(weekdaysOnly ? { days: [1, 2, 3, 4, 5] } : {}) }]
      : [];
  });
  return windows.length ? windows : undefined;
}

/**
 * De drempel voor de trailing circuit breaker. Bij statische drawdown meet de
 * breaker niet vanaf de piek: dan zou hij op hetzelfde percentage van de
 * hoogste equity klappen en de statische regel stil overrulen. De piek wordt
 * nog wel bijgehouden, en de kill switch (forceTrip) werkt gewoon.
 */
export function trailingBreakerThreshold(profile: Pick<RiskProfile, 'maxDrawdownPct' | 'drawdownType'>): number {
  if (profile.drawdownType === 'static') return Number.POSITIVE_INFINITY;
  return profile.maxDrawdownPct ?? 0.12;
}
