/**
 * runTradingResearch — orchestrates a TradingAgents-style multi-agent briefing.
 *
 * Uses AXE LLM slots when available; always produces a structured report
 * stored via tradingIntelService. Optional CrewAI handoff via axe API.
 *
 * Architecture mirrors TauricResearch/TradingAgents (arXiv:2412.20138):
 * Analysts → Bull/Bear debate → Research Manager → Trader → Risk → PM
 */
import type {
  AgentBrief,
  AgentRole,
  TradingIntelReport,
  TradingSignal,
} from '@/domain/tradingIntel/types';
import { AGENT_CATALOG } from '@/domain/tradingIntel/types';
import {
  createEmptyReport,
  upsertIntelReport,
} from '@/infrastructure/persistence/tradingIntelService';
import { crewRun, isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';

type KeySlot = {
  provider: string;
  key: string;
  model?: string;
  baseUrl?: string;
};

export interface RunResearchInput {
  ticker: string;
  name?: string;
  horizon?: string;
  notes?: string;
  /** Prefer live CrewAI on VPS when configured */
  useCrew?: boolean;
  /** Optional LLM caller — injected from voiceStore / llmGateway to avoid hard coupling */
  callLlm?: (system: string, user: string) => Promise<string>;
  onProgress?: (phase: string, detail?: string) => void;
}

const PIPELINE: AgentRole[] = [
  'market_analyst',
  'fundamentals_analyst',
  'news_analyst',
  'sentiment_analyst',
  'bull_researcher',
  'bear_researcher',
  'research_manager',
  'trader',
  'risk_conservative',
  'risk_aggressive',
  'risk_neutral',
  'portfolio_manager',
];

function meta(role: AgentRole) {
  return AGENT_CATALOG.find(a => a.role === role)!;
}

function parseSignal(text: string): TradingSignal {
  const u = text.toUpperCase();
  if (/\bBUY\b/.test(u) && !/\bDO NOT BUY\b/.test(u)) return 'BUY';
  if (/\bSELL\b/.test(u)) return 'SELL';
  if (/\bAVOID\b/.test(u)) return 'AVOID';
  if (/\bHOLD\b/.test(u)) return 'HOLD';
  return 'WATCH';
}

function extractBullets(text: string, max = 4): string[] {
  const lines = text
    .split('\n')
    .map(l => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(l => l.length > 12 && l.length < 180);
  const unique = [...new Set(lines)];
  return unique.slice(0, max);
}

function heuristicAgent(role: AgentRole, ticker: string, notes?: string): AgentBrief {
  const m = meta(role);
  const base = notes?.trim() || `No extra context — baseline desk view on ${ticker}.`;

  const templates: Record<string, Omit<AgentBrief, 'role' | 'label'>> = {
    market_analyst: {
      confidence: 0.62,
      stance: 'NEUTRAL',
      summary: `${ticker}: technical structure needs confirmation at key levels. Trend vs range regime still unresolved without fresh tape.`,
      keyPoints: [
        'Identify HTF bias (daily/4H) before entries',
        'Watch volume confirmation on breakouts',
        'Define invalidation below last swing structure',
      ],
    },
    fundamentals_analyst: {
      confidence: 0.58,
      stance: 'NEUTRAL',
      summary: `Fundamentals screen for ${ticker}: quality and valuation require explicit numbers (EPS, margins, leverage) before size.`,
      keyPoints: [
        'Prioritize cash-flow durability over narrative',
        'Flag leverage / dilution risk',
        'Compare vs sector peers on growth/multiple',
      ],
    },
    news_analyst: {
      confidence: 0.55,
      stance: 'NEUTRAL',
      summary: `News pulse for ${ticker}: treat headline risk as asymmetric until primary sources are checked.`,
      keyPoints: [
        'Separate company-specific vs macro noise',
        'Event calendar (earnings, FOMC, unlocks) drives volatility',
        base.slice(0, 120),
      ],
    },
    sentiment_analyst: {
      confidence: 0.5,
      stance: 'NEUTRAL',
      summary: `Sentiment around ${ticker} is mixed — crowd positioning can flip quickly near extremes.`,
      keyPoints: [
        'Avoid chasing crowded momentum without structure',
        'Sentiment extremes often precede mean reversion',
      ],
    },
    bull_researcher: {
      confidence: 0.6,
      stance: 'BULL',
      summary: `Bull case ${ticker}: upside path exists if catalysts land and structure holds above invalidation.`,
      keyPoints: [
        'Asymmetric upside if thesis catalysts confirm',
        'Scale-in only after confirmation, not FOMO',
      ],
    },
    bear_researcher: {
      confidence: 0.6,
      stance: 'BEAR',
      summary: `Bear case ${ticker}: downside if liquidity thins, narrative breaks, or macro tightens.`,
      keyPoints: [
        'Define hard stop / invalidation',
        'Watch correlation to beta (BTC/SPX) risk-off',
      ],
    },
    research_manager: {
      confidence: 0.64,
      stance: 'NEUTRAL',
      summary: `Research desk ${ticker}: balanced debate — no full-size allocation until tape + catalyst align.`,
      keyPoints: [
        'Default stance: WATCH with staged plan',
        'Bull needs confirmation; bear needs break of structure',
      ],
    },
    trader: {
      confidence: 0.57,
      stance: 'WATCH',
      summary: `Trade plan ${ticker}: wait for clear level + trigger. Size small until confidence > 0.7.`,
      keyPoints: [
        'Entry only at predefined levels',
        'Risk 0.25–0.5R until thesis hardens',
        horizonNote(notes),
      ],
    },
    risk_conservative: {
      confidence: 0.7,
      stance: 'HOLD',
      summary: 'Conservative risk: capital preservation first — reduce size, widen only with edge.',
      keyPoints: ['Max loss defined before entry', 'No averaging losers'],
    },
    risk_aggressive: {
      confidence: 0.55,
      stance: 'BUY',
      summary: 'Aggressive risk: will press if momentum confirms — still requires hard stop.',
      keyPoints: ['Scale with confirmation only', 'Cut fast if thesis fails'],
    },
    risk_neutral: {
      confidence: 0.6,
      stance: 'NEUTRAL',
      summary: 'Neutral risk: standard position sizing with balanced stop/target.',
      keyPoints: ['1R risk unit', 'Target ≥ 1.5R'],
    },
    portfolio_manager: {
      confidence: 0.66,
      stance: 'WATCH',
      summary: `PM decision ${ticker}: do not deploy full size yet. Approve pilot / watch only.`,
      keyPoints: [
        'Approve research; hold fire on large allocation',
        'Re-run after fresh market data or catalyst',
      ],
    },
  };

  const t = templates[role] ?? templates.research_manager;
  return {
    role,
    label: m.label,
    ...t,
    raw: undefined,
  };
}

function horizonNote(notes?: string): string {
  if (notes && /swing|day|scalp|position/i.test(notes)) return `Horizon hint from notes: ${notes.slice(0, 80)}`;
  return 'Default horizon: swing (days–weeks) unless specified';
}

async function llmAgent(
  role: AgentRole,
  ticker: string,
  notes: string | undefined,
  callLlm: (system: string, user: string) => Promise<string>,
): Promise<AgentBrief> {
  const m = meta(role);
  const system = `You are the ${m.label} in a multi-agent trading research desk (TradingAgents-style).
Respond in English. Be concise, professional, no hype.
Output format:
STANCE: BUY|SELL|HOLD|WATCH|AVOID or BULL|BEAR|NEUTRAL
CONFIDENCE: 0.00-1.00
SUMMARY: 2-3 sentences
POINTS:
- bullet
- bullet
- bullet`;
  const user = `Ticker: ${ticker}\nRole focus: ${m.description}\nContext: ${notes || 'None'}\nProduce your desk brief.`;
  try {
    const raw = await callLlm(system, user);
    const stanceMatch = raw.match(/STANCE:\s*([A-Z]+)/i);
    const confMatch = raw.match(/CONFIDENCE:\s*(0?\.\d+|1(?:\.0+)?)/i);
    const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]*?)(?:POINTS:|$)/i);
    const stance = (stanceMatch?.[1]?.toUpperCase() || 'NEUTRAL') as AgentBrief['stance'];
    const confidence = Math.min(1, Math.max(0, parseFloat(confMatch?.[1] || '0.55') || 0.55));
    const summary = (summaryMatch?.[1] || raw).trim().slice(0, 600);
    return {
      role,
      label: m.label,
      stance,
      confidence,
      summary,
      keyPoints: extractBullets(raw),
      raw: raw.slice(0, 4000),
    };
  } catch {
    return heuristicAgent(role, ticker, notes);
  }
}

function compositeSignal(agents: AgentBrief[]): { signal: TradingSignal; confidence: number } {
  const weights: Partial<Record<AgentRole, number>> = {
    portfolio_manager: 3,
    research_manager: 2.5,
    trader: 2,
    risk_conservative: 1.5,
    bull_researcher: 1,
    bear_researcher: 1,
    market_analyst: 1.2,
  };
  const score: Record<TradingSignal, number> = { BUY: 0, SELL: 0, HOLD: 0, WATCH: 0, AVOID: 0 };
  let wSum = 0;
  let confSum = 0;
  for (const a of agents) {
    const w = weights[a.role] ?? 0.8;
    wSum += w;
    confSum += a.confidence * w;
    const s = String(a.stance || '').toUpperCase();
    if (s === 'BUY' || s === 'BULL') score.BUY += w * a.confidence;
    else if (s === 'SELL' || s === 'BEAR') score.SELL += w * a.confidence;
    else if (s === 'AVOID') score.AVOID += w * a.confidence;
    else if (s === 'HOLD') score.HOLD += w * a.confidence;
    else score.WATCH += w * a.confidence;
  }
  const signal = (Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    'WATCH') as TradingSignal;
  const confidence = wSum > 0 ? Math.min(0.95, confSum / wSum) : 0.5;
  return { signal, confidence };
}

export async function runTradingResearch(
  input: RunResearchInput,
): Promise<TradingIntelReport> {
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) throw new Error('Ticker is required');

  let report = createEmptyReport({
    ticker,
    name: input.name,
    source: input.useCrew ? 'crewai' : input.callLlm ? 'axe_core' : 'trading_agents',
  });
  report.status = 'running';
  report.horizon = input.horizon || 'swing';
  report.tags = ['trading-agents', 'multi-agent'];
  report = await upsertIntelReport(report);

  input.onProgress?.('init', `Research desk opened for ${ticker}`);

  // Optional CrewAI path — store synthesis if VPS returns content
  if (input.useCrew && isAxeApiConfigured) {
    input.onProgress?.('crew', 'Dispatching CrewAI specialists…');
    try {
      const task = [
        `Trading research desk for ${ticker}.`,
        'Produce a multi-agent style briefing: market, fundamentals, news, bull case, bear case, trade plan, risks.',
        'End with SIGNAL: BUY|SELL|HOLD|WATCH|AVOID and CONFIDENCE 0-1.',
        input.notes ? `Context: ${input.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const res = await crewRun({
        task,
        specialists: ['axe_core', 'dollar_bill'],
      });
      if (res.status === 'ok' && res.result) {
        report.body = res.result;
        report.signal = parseSignal(res.result);
        report.thesis = res.result.slice(0, 500);
        report.source = 'crewai';
        report.runRef = `crew:${Date.now()}`;
        report.agents = PIPELINE.map(role => heuristicAgent(role, ticker, res.result?.slice(0, 200)));
        const comp = compositeSignal(report.agents);
        report.confidence = comp.confidence;
        report.status = 'complete';
        report.catalysts = extractBullets(res.result, 3);
        report.risks = extractBullets(res.result, 3);
        return upsertIntelReport(report);
      }
      input.onProgress?.('crew', res.error || 'Crew returned no result — falling back');
    } catch (e) {
      input.onProgress?.(
        'crew',
        e instanceof Error ? e.message : 'Crew failed — falling back',
      );
    }
  }

  const agents: AgentBrief[] = [];
  for (const role of PIPELINE) {
    input.onProgress?.(role, meta(role).label);
    if (input.callLlm) {
      agents.push(await llmAgent(role, ticker, input.notes, input.callLlm));
    } else {
      // Deterministic structured desk (always usable offline)
      await new Promise(r => setTimeout(r, 40));
      agents.push(heuristicAgent(role, ticker, input.notes));
    }
  }

  const { signal, confidence } = compositeSignal(agents);
  const pm = agents.find(a => a.role === 'portfolio_manager');
  const mgr = agents.find(a => a.role === 'research_manager');
  const trader = agents.find(a => a.role === 'trader');

  report.agents = agents;
  report.signal = signal;
  report.confidence = confidence;
  report.thesis =
    mgr?.summary ||
    pm?.summary ||
    `Multi-agent desk view on ${ticker}: ${signal} @ ${(confidence * 100).toFixed(0)}% confidence.`;
  report.risks = agents
    .filter(a => a.role.startsWith('risk_') || a.role === 'bear_researcher')
    .flatMap(a => a.keyPoints)
    .slice(0, 6);
  report.catalysts = agents
    .filter(a => a.role === 'bull_researcher' || a.role === 'news_analyst')
    .flatMap(a => a.keyPoints)
    .slice(0, 5);
  report.body = [
    `# Trading Intel — ${ticker}`,
    `As of ${report.asOf} · Signal **${signal}** · Confidence ${(confidence * 100).toFixed(0)}%`,
    '',
    '## Thesis',
    report.thesis,
    '',
    '## Trade plan',
    trader?.summary || '—',
    '',
    '## Agent briefs',
    ...agents.map(
      a =>
        `### ${a.label}\nStance: ${a.stance ?? '—'} · Conf ${(a.confidence * 100).toFixed(0)}%\n${a.summary}\n${a.keyPoints.map(p => `- ${p}`).join('\n')}`,
    ),
    '',
    '---',
    'Framework: AXE CORE Trading Intel · inspired by TauricResearch/TradingAgents (arXiv:2412.20138)',
    'Disclaimer: Not financial advice. Research desk output for decision support only.',
  ].join('\n');
  report.status = 'complete';
  report.tags = Array.from(
    new Set([...(report.tags || []), signal.toLowerCase(), report.assetClass]),
  );

  input.onProgress?.('done', `${signal} · ${(confidence * 100).toFixed(0)}%`);
  return upsertIntelReport(report);
}

/** Optional helper: build callLlm from a generic provider slot list (lazy import friendly). */
export function buildCallLlmFromSlots(
  slots: KeySlot[],
  callProvider: (slot: KeySlot, messages: Array<{ role: string; content: string }>) => Promise<string>,
): ((system: string, user: string) => Promise<string>) | undefined {
  if (!slots.length) return undefined;
  return async (system, user) => {
    let lastErr: unknown;
    for (const slot of slots.slice(0, 3)) {
      try {
        return await callProvider(slot, [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ]);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('All LLM slots failed');
  };
}
