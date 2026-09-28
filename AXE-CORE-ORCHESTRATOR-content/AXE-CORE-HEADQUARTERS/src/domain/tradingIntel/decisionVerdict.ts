/**
 * decisionVerdict — één beslissing van AXE Algo als gestructureerd oordeel.
 *
 * Het spoor (ThinkingTrace.steps) is vrije tekst per stap: goed om te lezen,
 * onmogelijk om op te filteren of in een kaart te zetten zonder strings te
 * ontleden. Dit is dezelfde beslissing in velden, gevuld door de motor met de
 * waarden die hij op dat moment in handen had — niet achteraf uit de tekst
 * gereconstrueerd.
 *
 * PASS  = er is een order verstuurd (of had verstuurd mogen worden met autoExecute aan).
 * BLOCK = iets hield de motor tegen — een poort, een regel, de sizing, de funnel,
 *         of de broker; `blockReason` zegt wat. Ook bij HOLD: een getripte
 *         breaker is een geblokkeerd bureau, geen rustige markt.
 * WAIT  = de motor zag geen reden om te handelen (HOLD) en niets blokkeerde.
 */
import type { GateCheck } from '@/domain/tradingIntel/preTradeGate';
import { parseLaneStance, type LaneStance } from '@/domain/tradingIntel/laneStance';

export type VerdictState = 'PASS' | 'BLOCK' | 'WAIT';

export type ExecutionState = 'filled' | 'closed' | 'rejected' | 'not-sent' | 'autoexecute-off';

export interface LaneContribution {
  /** De stand die de lane innam, als hij er een uitsprak (STANCE-regel). */
  stance: LaneStance | null;
  /** Eerste regel van wat de lane zei, ingekort. */
  summary: string | null;
}

export interface DecisionVerdict {
  state: VerdictState;
  action: 'buy' | 'sell' | 'hold';
  symbol: string;
  strategy: string | null;
  timeframe: string | null;
  confidence: number;
  confidenceFloor: number | null;
  contributions: {
    research: { signal: string; confidence: number; thesis: string } | null;
    intel: LaneContribution;
    companion: LaneContribution;
  };
  gates: GateCheck[];
  sizing: {
    lots: number;
    riskPct: number;
    riskAtStop: number;
    stopDistance: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    note: string;
  } | null;
  account: { id: string | null; environment: string | null; live: boolean };
  blockReason: string | null;
  execution: { state: ExecutionState; detail: string; tradeId: string | null; price: number | null };
  /** Pas bekend als de positie gesloten is; wordt later aan het spoor gehangen. */
  outcome?: { pnl: number; closedAt: string; exitReason: string | null };
}

function lane(text: string | null | undefined): LaneContribution {
  if (!text?.trim()) return { stance: null, summary: null };
  const first = text.trim().split('\n').find(l => l.trim() && !/^STANCE\s*:/i.test(l.trim())) ?? '';
  return { stance: parseLaneStance(text), summary: first.trim().slice(0, 200) || null };
}

export function buildDecisionVerdict(input: {
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  strategy?: string | null;
  timeframe?: string | null;
  confidence: number;
  confidenceFloor?: number | null;
  research?: { signal: string; confidence: number; thesis: string } | null;
  intelText?: string | null;
  companionText?: string | null;
  gates?: GateCheck[];
  sizing?: DecisionVerdict['sizing'];
  account: DecisionVerdict['account'];
  /** Wat het openen tegenhield: risico, regels, sizing, of de funnel. */
  blockReason?: string | null;
  autoExecute: boolean;
  placed?: { ok: boolean; error?: string; tradeId?: string | null; price?: number | null; closed?: boolean } | null;
}): DecisionVerdict {
  const blockReason = input.blockReason?.trim() || null;
  const wantsTrade = input.action !== 'hold';
  const lots = input.sizing?.lots ?? 0;

  let state: VerdictState;
  if (blockReason) state = 'BLOCK';
  else if (!wantsTrade) state = 'WAIT';
  else if (lots <= 0) state = 'BLOCK';
  else state = 'PASS';

  let execution: DecisionVerdict['execution'];
  if (input.placed) {
    execution = input.placed.ok
      ? {
        state: input.placed.closed ? 'closed' : 'filled',
        detail: `${input.action.toUpperCase()} ${lots} lots${input.placed.price != null ? ` @ ${input.placed.price}` : ''}`,
        tradeId: input.placed.tradeId ?? null,
        price: input.placed.price ?? null,
      }
      : { state: 'rejected', detail: input.placed.error || 'rejected by broker', tradeId: null, price: null };
  } else if (state === 'PASS' && !input.autoExecute) {
    execution = { state: 'autoexecute-off', detail: 'Cleared, but auto-execute is off — no order sent', tradeId: null, price: null };
  } else {
    execution = {
      state: 'not-sent',
      detail: state === 'WAIT' ? 'HOLD — nothing to send' : (blockReason ?? 'No size — nothing to send'),
      tradeId: null, price: null,
    };
  }
  // Een afgewezen order is geen PASS meer: de poort liet hem door, de broker niet.
  if (execution.state === 'rejected') state = 'BLOCK';

  return {
    state,
    action: input.action,
    symbol: input.symbol,
    strategy: input.strategy ?? null,
    timeframe: input.timeframe ?? null,
    confidence: input.confidence,
    confidenceFloor: input.confidenceFloor ?? null,
    contributions: {
      research: input.research ?? null,
      intel: lane(input.intelText),
      companion: lane(input.companionText),
    },
    gates: input.gates ?? [],
    sizing: input.sizing ?? null,
    account: input.account,
    blockReason: state === 'BLOCK' ? (blockReason ?? (execution.state === 'rejected' ? execution.detail : 'No size')) : null,
    execution,
  };
}

/**
 * Hang een uitkomst aan het spoor van de beslissing die de trade opende.
 *
 * Gekoppeld op het trade-id dat de uitvoering teruggaf (de spiegelrij van de
 * broker-fill); de reconciler geeft dezelfde id mee als hij de close vindt.
 * Geeft null terug als geen spoor bij dit id hoort — dan valt er niets te
 * schrijven, en een verzonnen koppeling is erger dan geen.
 */
export function withOutcome<T extends { verdict?: DecisionVerdict }>(
  traces: T[],
  tradeId: string,
  outcome: NonNullable<DecisionVerdict['outcome']>,
): T[] | null {
  const i = traces.findIndex(t => t.verdict?.execution.tradeId === tradeId && !t.verdict.outcome);
  if (i < 0) return null;
  const t = traces[i];
  const next = [...traces];
  next[i] = { ...t, verdict: { ...t.verdict!, outcome } };
  return next;
}
