/**
 * simulate — een account door de geschiedenis, bar voor bar.
 *
 * De oude backtest testte signaalkwaliteit: instappen op de slotkoers van de
 * signaalbar, uitstappen op een omgekeerd signaal of na 24 bars, geen stop,
 * geen doel, geen kosten, geen saldo — "equity" was een product van rendementen.
 * Dat zegt of een idee ergens op slaat, niet wat het met een account doet.
 *
 * Dit rekent met geld:
 *   - het signaal komt uit dezelfde strategySignals als live (de aanroeper geeft
 *     `signalAt`), er is geen tweede signaallogica;
 *   - een besluit op de slotkoers van bar i vult op de OPEN van bar i+1, met
 *     spread en slippage — zoals een marktorder, en zoals Nautilus het doet;
 *   - stop en doel komen uit tradePlan (dezelfde 1,5 ATR / 1,5R als live);
 *   - raken stop en doel dezelfde bar, dan eerst de stop (pessimistisch, net als
 *     Nautilus' bar_adaptive_high_low_ordering); een gat voorbij de stop vult op
 *     de open, niet op de stop;
 *   - grootte uit positionSizing: vaste lots of risico-% als geld bij de stop;
 *   - commissie per lot per kant, maximaal gelijktijdige posities, maximaal
 *     trades per dag, shorts aan/uit;
 *   - met een RiskProfile: dezelfde evaluateAccountRules als de live poort bij
 *     elke opening, en bewaking van dagverlies, drawdown en doel per bar — de
 *     basis van de funded-simulator.
 *
 * Koersen zijn bid (zoals MT5-candles); de ask is bid + spread.
 */
import type { RiskProfile } from '@/domain/tradingIntel/botTypes';
import { evaluateAccountRules, tradingDayKey, type AccountRiskSnapshot } from '@/domain/tradingIntel/accountRules';
import { sizeLotsForRisk } from '@/domain/tradingIntel/positionSizing';
import { atrAt, protectiveLevels, type OhlcLike } from './tradePlan';
import type { LabInstrument } from './instrumentEstimate';

/** Het signaal van de canonieke strategySignals op bar i (buy/sell/hold). */
export type LabSignal = 'buy' | 'sell' | 'hold';

export interface LabBar { time: string; open: number; high: number; low: number; close: number }

export interface LabCosts {
  /** Spread in koerseenheden (ask − bid). */
  spread: number;
  /** Commissie per lot per kant, in de P&L-valuta. */
  commissionPerLot: number;
  /** Nadelige slippage in koerseenheden op elke marktvulling en elke stop. */
  slippage: number;
}

export type LabSizing =
  | { mode: 'fixed'; lots: number }
  | { mode: 'risk'; riskPct: number; base?: 'equity' | 'balance' | 'initialBalance' };

export interface LabConfig {
  startingBalance: number;
  sizing: LabSizing;
  instrument: LabInstrument;
  costs: LabCosts;
  atrMultiple?: number;
  rewardRisk?: number | null;
  maxConcurrent?: number;
  maxTradesPerDay?: number | null;
  /** Sluit na zoveel bars; null = alleen stop/doel/signaal. */
  maxHoldBars?: number | null;
  exitOnOppositeSignal?: boolean;
  allowShort?: boolean;
  warmupBars?: number;
  /** Accountregels bij elke opening, en funded-bewaking per bar. */
  profile?: RiskProfile | null;
  /** Dagen (New York, YYYY-MM-DD) met een high-impact release, voor newsRestriction. */
  highImpactDays?: ReadonlySet<string> | null;
  /** Stop met handelen na een doorbraak of een gehaald doel (funded). Standaard: ja als er een profiel is. */
  haltOnFundedOutcome?: boolean;
}

export type LabExitReason = 'stop' | 'target' | 'signal' | 'max-hold' | 'end';

export interface LabTrade {
  id: number;
  side: 'buy' | 'sell';
  signalIndex: number;
  entryIndex: number;
  exitIndex: number;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  lots: number;
  /** Geplande risico tot de stop bij de opening (na afronden). */
  riskAtEntry: number;
  grossPnl: number;
  commission: number;
  pnl: number;
  rMultiple: number;
  exitReason: LabExitReason;
  balanceAfter: number;
}

export interface LabEquityPoint {
  index: number;
  time: string;
  balance: number;
  equity: number;
  /** Laagste equity binnen deze bar (tegen de open posities in). */
  worstEquity: number;
  drawdownPct: number;
}

export type LabEventKind = 'blocked' | 'breach' | 'target' | 'pass';

export interface LabEvent {
  kind: LabEventKind;
  index: number;
  time: string;
  rule: string;
  detail: string;
  equity: number;
  balance: number;
  drawdownPct: number;
  /** De trade die open stond of net sloot, als die er was. */
  tradeId?: number;
}

export interface LabMetrics {
  startingBalance: number;
  endingBalance: number;
  netProfit: number;
  netReturnPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  avgR: number;
  maxDrawdownPct: number;
  maxDrawdownMoney: number;
  maxConsecutiveLosses: number;
  commissionPaid: number;
  exposurePct: number;
  bars: number;
  tradingDays: number;
  firstTime: string | null;
  lastTime: string | null;
  blockedByRule: Record<string, number>;
}

export interface LabRun {
  trades: LabTrade[];
  equity: LabEquityPoint[];
  events: LabEvent[];
  metrics: LabMetrics;
  /** Waar de funded-bewaking eindigde; null zonder profiel. */
  funded: { status: 'ACTIVE' | 'PASS' | 'BREACHED'; event: LabEvent | null } | null;
  warnings: string[];
}

interface OpenPos {
  id: number; side: 'buy' | 'sell'; signalIndex: number; entryIndex: number; entryPrice: number;
  stopLoss: number; takeProfit: number | null; lots: number; riskAtEntry: number; commission: number;
}

interface Pending { side: 'buy' | 'sell'; signalIndex: number; stopLoss: number; takeProfit: number | null; lots: number; riskAtEntry: number }

const MAX_BLOCK_EVENTS = 200;

export function simulateAccount(
  bars: readonly LabBar[],
  signalAt: (i: number) => LabSignal,
  cfg: LabConfig,
): LabRun {
  const inst = cfg.instrument;
  const spec = inst.spec;
  const tick = spec.tickSize;
  const spread = Math.max(0, cfg.costs.spread);
  const slip = Math.max(0, cfg.costs.slippage);
  const commissionPerLot = Math.max(0, cfg.costs.commissionPerLot);
  const maxConcurrent = Math.max(1, cfg.maxConcurrent ?? 1);
  const exitOnFlip = cfg.exitOnOppositeSignal ?? true;
  const profile = cfg.profile ?? null;
  const allowShort = cfg.allowShort ?? profile?.allowShort ?? true;
  const warmup = Math.max(15, cfg.warmupBars ?? 51);
  const tz = profile?.resetTimezone || 'UTC';
  const haltOnOutcome = cfg.haltOnFundedOutcome ?? profile != null;
  const initial = profile?.initialBalance && profile.initialBalance > 0 ? profile.initialBalance : cfg.startingBalance;
  const warnings = [...inst.warnings];

  const ohlc: OhlcLike[] = bars.map(b => ({ o: b.open, h: b.high, l: b.low, c: b.close }));
  const money = (distance: number, lots: number, price: number) => (distance / tick) * inst.tickValueAt(price) * lots;

  let balance = cfg.startingBalance;
  let peakEquity = cfg.startingBalance;
  let maxDdPct = 0;
  let maxDdMoney = 0;
  let nextId = 1;
  const open: OpenPos[] = [];
  let pending: Pending | null = null;
  let pendingExits = new Set<number>();
  const trades: LabTrade[] = [];
  const equity: LabEquityPoint[] = [];
  const events: LabEvent[] = [];
  const blockedByRule: Record<string, number> = {};
  const dailyClosed = new Map<string, number>();
  const openDays = new Set<string>();
  let dayKey = '';
  let dayStartBalance = balance;
  let tradesToday = 0;
  let barsInMarket = 0;
  let halted: { status: 'PASS' | 'BREACHED'; event: LabEvent } | null = null;

  const closePos = (p: OpenPos, i: number, price: number, reason: LabExitReason) => {
    const dir = p.side === 'buy' ? 1 : -1;
    const gross = money(dir * (price - p.entryPrice), p.lots, price);
    const exitCommission = commissionPerLot * p.lots;
    const commission = p.commission + exitCommission;
    const pnl = gross - commission;
    balance += gross - exitCommission; // opening commission was already taken
    const day = tradingDayKey(Date.parse(bars[i].time), tz);
    dailyClosed.set(day, (dailyClosed.get(day) ?? 0) + pnl);
    trades.push({
      id: p.id, side: p.side, signalIndex: p.signalIndex, entryIndex: p.entryIndex, exitIndex: i,
      entryTime: bars[p.entryIndex].time, exitTime: bars[i].time, entryPrice: p.entryPrice, exitPrice: price,
      stopLoss: p.stopLoss, takeProfit: p.takeProfit, lots: p.lots, riskAtEntry: p.riskAtEntry,
      grossPnl: gross, commission, pnl, rMultiple: p.riskAtEntry > 0 ? pnl / p.riskAtEntry : 0,
      exitReason: reason, balanceAfter: balance,
    });
    open.splice(open.indexOf(p), 1);
  };

  const floatingAt = (price: number) => open.reduce((s, p) => {
    const dir = p.side === 'buy' ? 1 : -1;
    const exit = p.side === 'buy' ? price : price + spread; // long sluit op bid, short op ask
    return s + money(dir * (exit - p.entryPrice), p.lots, price);
  }, 0);

  const record = (kind: LabEventKind, i: number, rule: string, detail: string, eq: number, tradeId?: number): LabEvent => {
    const e: LabEvent = {
      kind, index: i, time: bars[i].time, rule, detail, equity: eq, balance,
      drawdownPct: peakEquity > 0 ? Math.max(0, (peakEquity - eq) / peakEquity) : 0, tradeId,
    };
    if (kind !== 'blocked' || events.filter(x => x.kind === 'blocked').length < MAX_BLOCK_EVENTS) events.push(e);
    return e;
  };

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const t = Date.parse(bar.time);
    const key = tradingDayKey(t, tz);
    if (key !== dayKey) { dayKey = key; dayStartBalance = balance; tradesToday = 0; }

    // ── A. marktorders van het besluit op bar i-1, op de open van bar i ────
    if (pendingExits.size) {
      for (const p of [...open]) {
        if (!pendingExits.has(p.id)) continue;
        const px = p.side === 'buy' ? bar.open - slip : bar.open + spread + slip;
        closePos(p, i, px, 'signal');
      }
      pendingExits = new Set();
    }
    if (pending && !halted) {
      const fill = pending.side === 'buy' ? bar.open + spread + slip : bar.open - slip;
      const commission = commissionPerLot * pending.lots;
      balance -= commission;
      open.push({
        id: nextId++, side: pending.side, signalIndex: pending.signalIndex, entryIndex: i, entryPrice: fill,
        stopLoss: pending.stopLoss, takeProfit: pending.takeProfit, lots: pending.lots,
        riskAtEntry: pending.riskAtEntry, commission,
      });
      tradesToday += 1;
      openDays.add(key);
    }
    pending = null;

    // ── B. stop en doel binnen de bar, stop eerst ──────────────────────────
    for (const p of [...open]) {
      if (p.side === 'buy') {
        const gapStop = bar.open <= p.stopLoss;
        const gapTarget = p.takeProfit != null && bar.open >= p.takeProfit;
        if (gapStop) closePos(p, i, bar.open - slip, 'stop');
        else if (gapTarget) closePos(p, i, bar.open, 'target');
        else if (bar.low <= p.stopLoss) closePos(p, i, p.stopLoss - slip, 'stop');
        else if (p.takeProfit != null && bar.high >= p.takeProfit) closePos(p, i, p.takeProfit, 'target');
      } else {
        const askOpen = bar.open + spread;
        const gapStop = askOpen >= p.stopLoss;
        const gapTarget = p.takeProfit != null && askOpen <= p.takeProfit;
        if (gapStop) closePos(p, i, askOpen + slip, 'stop');
        else if (gapTarget) closePos(p, i, askOpen, 'target');
        else if (bar.high + spread >= p.stopLoss) closePos(p, i, p.stopLoss + slip, 'stop');
        else if (p.takeProfit != null && bar.low + spread <= p.takeProfit) closePos(p, i, p.takeProfit, 'target');
      }
    }
    if (cfg.maxHoldBars != null) {
      for (const p of [...open]) {
        if (i - p.entryIndex >= cfg.maxHoldBars) closePos(p, i, p.side === 'buy' ? bar.close : bar.close + spread, 'max-hold');
      }
    }

    // ── C. equity: slot en slechtste punt binnen de bar ─────────────────────
    if (open.length) barsInMarket += 1;
    const eqClose = balance + floatingAt(bar.close);
    const worst = balance + open.reduce((s, p) => {
      const dir = p.side === 'buy' ? 1 : -1;
      const adverse = p.side === 'buy' ? bar.low : bar.high + spread;
      return s + money(dir * (adverse - p.entryPrice), p.lots, adverse);
    }, 0);
    const worstEquity = Math.min(eqClose, worst);
    const ddPct = peakEquity > 0 ? (peakEquity - worstEquity) / peakEquity : 0;
    maxDdPct = Math.max(maxDdPct, ddPct);
    maxDdMoney = Math.max(maxDdMoney, peakEquity - worstEquity);
    equity.push({ index: i, time: bar.time, balance, equity: eqClose, worstEquity, drawdownPct: ddPct });

    // Funded-bewaking: dezelfde grenzen als de live poort, per bar gemeten.
    if (profile && !halted) {
      // De trade die de grens raakte: een die nog open staat, of een die in deze bar sloot.
      const openTrade = open[0]?.id ?? [...trades].reverse().find(tr => tr.exitIndex === i)?.id;
      if (profile.maxDailyLossPct > 0) {
        const base = profile.dailyLossBase === 'initialBalance' ? initial : dayStartBalance;
        const limit = profile.maxDailyLossPct * base;
        if (dayStartBalance - worstEquity >= limit) {
          const ev = record('breach', i, 'dailyLoss', `Daily loss ${(dayStartBalance - worstEquity).toFixed(2)} reached ${(profile.maxDailyLossPct * 100).toFixed(2)}% (${limit.toFixed(2)})`, worstEquity, openTrade);
          if (haltOnOutcome) halted = { status: 'BREACHED', event: ev };
        }
      }
      if (!halted && profile.maxDrawdownPct != null && profile.maxDrawdownPct > 0) {
        const staticDd = profile.drawdownType === 'static';
        const floor = staticDd ? initial * (1 - profile.maxDrawdownPct) : peakEquity * (1 - profile.maxDrawdownPct);
        if (worstEquity <= floor) {
          const ev = record('breach', i, 'totalDrawdown',
            `${staticDd ? 'Static' : 'Trailing'} drawdown: equity ${worstEquity.toFixed(2)} at or below ${floor.toFixed(2)}`, worstEquity, openTrade);
          if (haltOnOutcome) halted = { status: 'BREACHED', event: ev };
        }
      }
      if (!halted && profile.profitTargetPct != null && profile.profitTargetPct > 0 && eqClose - initial >= initial * profile.profitTargetPct) {
        const need = profile.minTradingDays ?? 0;
        const daysOk = openDays.size >= need;
        const consistencyOk = consistencyHolds(profile, dailyClosed, eqClose - initial);
        if (daysOk && consistencyOk.ok) {
          const ev = record('pass', i, 'profitTarget', `Profit target ${(profile.profitTargetPct * 100).toFixed(2)}% reached with ${openDays.size} trading day(s)`, eqClose);
          if (haltOnOutcome) halted = { status: 'PASS', event: ev };
        } else if (!events.some(e => e.kind === 'target')) {
          record('target', i, 'profitTarget',
            !daysOk ? `Target reached; ${openDays.size}/${need} trading days` : `Target reached; consistency ${consistencyOk.detail}`, eqClose);
        }
      }
      if (halted) {
        // Een doorbraak of een gehaalde challenge sluit alles: er wordt niet meer gehandeld.
        for (const p of [...open]) closePos(p, i, p.side === 'buy' ? bar.close : bar.close + spread, 'end');
      }
    }
    peakEquity = Math.max(peakEquity, eqClose);

    // ── D. besluit op de slotkoers van bar i, uitgevoerd op de open van i+1 ─
    if (i < warmup || halted || i === bars.length - 1) continue;
    const sig = signalAt(i);
    if (sig !== 'buy' && sig !== 'sell') continue;
    if (exitOnFlip) {
      for (const p of open) if (p.side !== sig) pendingExits.add(p.id);
    }
    const stillOpen = open.filter(p => !pendingExits.has(p.id)).length;
    const block = (rule: string, detail: string) => {
      blockedByRule[rule] = (blockedByRule[rule] ?? 0) + 1;
      record('blocked', i, rule, detail, eqClose);
    };
    if (sig === 'sell' && !allowShort) { block('allowShort', 'shorts disabled'); continue; }
    if (open.some(p => p.side === sig && !pendingExits.has(p.id)) && maxConcurrent === 1) continue;
    if (stillOpen >= maxConcurrent) { block('maxConcurrent', `${stillOpen} open, max ${maxConcurrent}`); continue; }
    if (cfg.maxTradesPerDay != null && tradesToday >= cfg.maxTradesPerDay) { block('maxTradesPerDay', `${tradesToday} today`); continue; }

    const atr = atrAt(ohlc, i);
    const entryEst = sig === 'buy' ? bar.close + spread : bar.close;
    const plan = protectiveLevels({ side: sig, entry: bar.close, atr, atrMultiple: cfg.atrMultiple, rewardRisk: cfg.rewardRisk });
    const tvNow = inst.tickValueAt(bar.close);
    const specNow = { ...spec, lossTickValue: tvNow };
    let lots: number;
    let riskAtEntry: number;
    if (cfg.sizing.mode === 'fixed') {
      lots = cfg.sizing.lots;
      riskAtEntry = money(Math.abs(entryEst - plan.stopLoss), lots, bar.close);
    } else {
      const baseAmt = cfg.sizing.base === 'balance' ? balance : cfg.sizing.base === 'initialBalance' ? initial : eqClose;
      const sized = sizeLotsForRisk({ riskBudget: baseAmt * cfg.sizing.riskPct, entry: entryEst, stop: plan.stopLoss, spec: specNow });
      if (sized.refused) { block('sizing', sized.refused); continue; }
      lots = sized.lots;
      riskAtEntry = sized.riskAtStop;
    }
    if (!Number.isFinite(riskAtEntry) || lots <= 0) { block('sizing', 'no usable size'); continue; }

    if (profile) {
      const snap: AccountRiskSnapshot = {
        now: t, balance, equity: eqClose, currency: inst.pnlCurrency, dayStartBalance,
        peakEquity,
        openPositions: open.filter(p => !pendingExits.has(p.id)).map(p => ({
          symbol: spec.symbol,
          riskMoney: Math.max(0, money((p.side === 'buy' ? 1 : -1) * (p.entryPrice - p.stopLoss), p.lots, bar.close)),
        })),
        dailyClosedPnl: dailyClosed,
        tradingDays: openDays.size,
      };
      const nyDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
      // Sessies, nieuws, dagverlies, open risico, doelen: dezelfde functie als de live poort.
      const checks = evaluateAccountRules(
        profile,
        snap,
        { symbol: spec.symbol, proposedRiskMoney: riskAtEntry, highImpactToday: cfg.highImpactDays ? cfg.highImpactDays.has(nyDay) : null },
      );
      const hit = checks.find(c => c.status === 'BLOCK');
      if (hit) { block(hit.id, hit.detail); continue; }
    }

    pending = { side: sig, signalIndex: i, stopLoss: plan.stopLoss, takeProfit: plan.takeProfit, lots, riskAtEntry };
  }

  // ── E. wat nog open staat, sluit op de laatste slotkoers ───────────────────
  const last = bars.length - 1;
  if (last >= 1) for (const p of [...open]) closePos(p, last, p.side === 'buy' ? bars[last].close : bars[last].close + spread, 'end');

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  let streak = 0; let maxStreak = 0;
  for (const t of trades) { streak = t.pnl <= 0 ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak); }

  if (trades.length < 30) warnings.push(`Only ${trades.length} trades — too few to tell an edge from luck`);

  return {
    trades,
    equity,
    events,
    metrics: {
      startingBalance: cfg.startingBalance,
      endingBalance: balance,
      netProfit: balance - cfg.startingBalance,
      netReturnPct: cfg.startingBalance > 0 ? (balance - cfg.startingBalance) / cfg.startingBalance : 0,
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? wins.length / trades.length : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? -grossLoss / losses.length : 0,
      expectancy: trades.length ? (grossWin - grossLoss) / trades.length : 0,
      avgR: trades.length ? trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length : 0,
      maxDrawdownPct: maxDdPct,
      maxDrawdownMoney: maxDdMoney,
      maxConsecutiveLosses: maxStreak,
      commissionPaid: trades.reduce((s, t) => s + t.commission, 0),
      exposurePct: bars.length > 1 ? barsInMarket / (bars.length - 1) : 0,
      bars: bars.length,
      tradingDays: openDays.size,
      firstTime: bars[0]?.time ?? null,
      lastTime: bars[bars.length - 1]?.time ?? null,
      blockedByRule,
    },
    funded: profile ? { status: halted?.status ?? 'ACTIVE', event: halted?.event ?? null } : null,
    warnings,
  };
}

/** Grootste winstdag ≤ consistencyPct van de totale winst (alleen als het profiel die regel heeft). */
function consistencyHolds(
  profile: Pick<RiskProfile, 'consistencyPct'>,
  dailyClosed: ReadonlyMap<string, number>,
  totalProfit: number,
): { ok: boolean; detail: string } {
  if (!profile.consistencyPct || profile.consistencyPct <= 0) return { ok: true, detail: 'no rule' };
  if (totalProfit <= 0) return { ok: false, detail: 'no profit' };
  const best = Math.max(0, ...dailyClosed.values());
  const share = best / totalProfit;
  return share <= profile.consistencyPct
    ? { ok: true, detail: `best day ${(share * 100).toFixed(1)}% ≤ ${(profile.consistencyPct * 100).toFixed(0)}%` }
    : { ok: false, detail: `best day ${(share * 100).toFixed(1)}% > ${(profile.consistencyPct * 100).toFixed(0)}%` };
}
