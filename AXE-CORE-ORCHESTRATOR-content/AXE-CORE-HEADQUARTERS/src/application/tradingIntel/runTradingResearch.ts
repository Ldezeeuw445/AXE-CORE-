/**
 * runTradingResearch — orchestrates a TradingAgents-style multi-agent briefing.
 *
 * DEFAULT path: CrewAI research crew on VPS (multi-source → specialists → debate).
 * Fallback: local TradingAgents-style desk (heuristic or per-role LLM).
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
import { crewRun, isAxeApiConfigured, fetchHistoricalCandles, fetchMarketNews } from '@/infrastructure/gateways/axeCoreApiService';
import { callCompanionTool } from '@/infrastructure/gateways/companionToolsService';
import { recordEvent } from '@/infrastructure/persistence/memoryRecorder';
import {
  buildResearchCrewTask,
  RESEARCH_CREW_SPECIALISTS,
} from '@/application/tradingIntel/researchCrewPrompt';

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
  /** Default true — CrewAI is preferred for this tab */
  useCrew?: boolean;
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

// Live crew output doesn't reliably say "CONFIDENCE: 0.72" the way the
// prompt asks for — it comes back as e.g. "**CONFIDENCE:** Medium-High
// (Based on recent market trends...)". The old numeric-only regex never
// matched that, so it silently fell back to a fixed heuristic composite —
// which is why every report looked like it converged on ~61% regardless of
// what the crew actually said. Checked most-specific phrase first so
// "Medium-High" doesn't get caught by the bare "medium" pattern.
const CONFIDENCE_WORD_SCALE: Array<[RegExp, number]> = [
  [/very\s*high/i, 0.9],
  [/very\s*low/i, 0.15],
  [/(?:medium|moderate)[\s\-/]*(?:to)?[\s\-/]*high/i, 0.65],
  [/low[\s\-/]*(?:to)?[\s\-/]*(?:medium|moderate)/i, 0.4],
  [/\bhigh\b/i, 0.8],
  [/\b(?:medium|moderate)\b/i, 0.5],
  [/\blow\b/i, 0.3],
];

function parseConfidence(text: string, fallback: number): number {
  const line = text.match(/CONFIDENCE:\s*([^\n]+)/i)?.[1] ?? text;
  const decimal = line.match(/\b(0?\.\d+|1(?:\.0+)?)\b/);
  if (decimal) return Math.min(1, Math.max(0, parseFloat(decimal[1])));
  const pct = line.match(/(\d{1,3})\s*%/);
  if (pct) return Math.min(1, Math.max(0, parseInt(pct[1], 10) / 100));
  for (const [re, val] of CONFIDENCE_WORD_SCALE) {
    if (re.test(line)) return val;
  }
  return fallback;
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
      summary: `${ticker}: technical structure needs confirmation at key levels.`,
      keyPoints: ['HTF bias before entries', 'Volume on breakouts', 'Invalidation below swing'],
    },
    fundamentals_analyst: {
      confidence: 0.58,
      stance: 'NEUTRAL',
      summary: `Fundamentals for ${ticker}: need explicit numbers before size.`,
      keyPoints: ['Cash-flow durability', 'Leverage / dilution', 'Peer multiples'],
    },
    news_analyst: {
      confidence: 0.55,
      stance: 'NEUTRAL',
      summary: `News pulse ${ticker}: asymmetric headline risk until primaries checked.`,
      keyPoints: ['Company vs macro noise', 'Event calendar', base.slice(0, 100)],
    },
    sentiment_analyst: {
      confidence: 0.5,
      stance: 'NEUTRAL',
      summary: `Sentiment ${ticker} mixed — extremes can flip fast.`,
      keyPoints: ['Avoid crowded chase', 'Extremes → mean reversion'],
    },
    bull_researcher: {
      confidence: 0.6,
      stance: 'BULL',
      summary: `Bull ${ticker}: upside if catalysts land and structure holds.`,
      keyPoints: ['Asymmetric upside if confirmed', 'Scale-in only on confirmation'],
    },
    bear_researcher: {
      confidence: 0.6,
      stance: 'BEAR',
      summary: `Bear ${ticker}: downside if liquidity/narrative/macro break.`,
      keyPoints: ['Hard stop', 'Beta correlation risk-off'],
    },
    research_manager: {
      confidence: 0.64,
      stance: 'NEUTRAL',
      summary: `Desk ${ticker}: balanced — no full size until tape + catalyst align.`,
      keyPoints: ['Default WATCH', 'Need confirmation'],
    },
    trader: {
      confidence: 0.57,
      stance: 'WATCH',
      summary: `Plan ${ticker}: wait for level + trigger. Small size until conf > 0.7.`,
      keyPoints: ['Predefined entries', '0.25–0.5R until hardened'],
    },
    risk_conservative: {
      confidence: 0.7,
      stance: 'HOLD',
      summary: 'Conservative: capital first.',
      keyPoints: ['Max loss pre-defined', 'No average losers'],
    },
    risk_aggressive: {
      confidence: 0.55,
      stance: 'BUY',
      summary: 'Aggressive: press only with confirmation + hard stop.',
      keyPoints: ['Scale on confirm', 'Cut fast'],
    },
    risk_neutral: {
      confidence: 0.6,
      stance: 'NEUTRAL',
      summary: 'Neutral risk: standard size.',
      keyPoints: ['1R unit', 'Target ≥ 1.5R'],
    },
    portfolio_manager: {
      confidence: 0.66,
      stance: 'WATCH',
      summary: `PM ${ticker}: pilot only — no full deployment yet.`,
      keyPoints: ['Approve research', 'Re-run on fresh data'],
    },
  };
  const t = templates[role] ?? templates.research_manager;
  return { role, label: m.label, ...t };
}

async function llmAgent(
  role: AgentRole,
  ticker: string,
  notes: string | undefined,
  callLlm: (system: string, user: string) => Promise<string>,
): Promise<AgentBrief> {
  const m = meta(role);
  const system = `You are the ${m.label} in a multi-agent trading research desk (TradingAgents-style).
Respond in English. Concise. Format:
STANCE: BUY|SELL|HOLD|WATCH|AVOID or BULL|BEAR|NEUTRAL
CONFIDENCE: 0.00-1.00
SUMMARY: 2-3 sentences
POINTS:
- bullet`;
  try {
    const raw = await callLlm(system, `Ticker: ${ticker}\nFocus: ${m.description}\nContext: ${notes || 'None'}`);
    const stanceMatch = raw.match(/STANCE:\s*([A-Z]+)/i);
    const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]*?)(?:POINTS:|$)/i);
    return {
      role,
      label: m.label,
      stance: (stanceMatch?.[1]?.toUpperCase() || 'NEUTRAL') as AgentBrief['stance'],
      confidence: parseConfidence(raw, 0.55),
      summary: (summaryMatch?.[1] || raw).trim().slice(0, 600),
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
  const signal = (Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0] || 'WATCH') as TradingSignal;
  const confidence = wSum > 0 ? Math.min(0.95, confSum / wSum) : 0.5;
  return { signal, confidence };
}

/** Minimal shape of what Companion's get_smart_money_intel tool returns
 *  (its loadIntelSnapshot) — only the fields actually used here, not the
 *  full cross-app-shared type. */
interface CompanionIntelSnapshot {
  tide?: { netCallPremium: number; netPutPremium: number; bias: string } | null;
  insiders?: Array<{ ticker: string; insider: string; type: string; value: number; date: string }>;
  options?: Array<{ symbol: string; side: string; strike: number; exp: string; premium: number; sweep?: boolean }>;
}

/**
 * Real price levels + real headlines for the crew to actually cite, instead
 * of guessing and self-labeling FRAMEWORK_ESTIMATE (the prompt already asks
 * for REAL_DATA_AVAILABLE vs FRAMEWORK_ESTIMATE — it just had nothing real
 * to check against before this). Best-effort: a provider outage here
 * shouldn't block the research cycle, so failures degrade to an honest
 * "unavailable" line rather than throwing.
 */
async function buildRealDataContext(ticker: string): Promise<string> {
  const [candlesRes, newsRes, intelRes] = await Promise.allSettled([
    fetchHistoricalCandles(ticker, '1h', 60),
    fetchMarketNews('forex', 5),
    callCompanionTool<CompanionIntelSnapshot>('get_smart_money_intel', { symbol: ticker }),
  ]);

  const lines: string[] = ['## REAL DATA (fetched just now — cite these, don\'t estimate)'];

  if (candlesRes.status === 'fulfilled' && candlesRes.value.candles.length > 0) {
    const candles = candlesRes.value.candles;
    const last = candles[candles.length - 1];
    const high = Math.max(...candles.map(c => c.high));
    const low = Math.min(...candles.map(c => c.low));
    const first = candles[0];
    const changePct = ((last.close - first.close) / first.close) * 100;
    lines.push(
      `Price (${candlesRes.value.source}): last=${last.close} · last ${candles.length}h range ${low}–${high} · ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% over that window.`,
    );
  } else {
    lines.push('Price: unavailable right now — do not fabricate a level, mark DATA_QUALITY as FRAMEWORK_ESTIMATE for price context.');
  }

  if (newsRes.status === 'fulfilled' && newsRes.value.news.length > 0) {
    lines.push('Recent headlines:');
    for (const n of newsRes.value.news.slice(0, 5)) {
      lines.push(`- ${n.headline} (${n.source})`);
    }
  } else {
    lines.push('Headlines: unavailable right now.');
  }

  // AXE Companion — smart-money intel (insider trades, congress trades,
  // dark pool, unusual options, market tide). Best-effort: Companion is a
  // separate Tauri app that may not be running right now, and this is
  // supplementary signal, not something to block research on.
  const intel = intelRes.status === 'fulfilled' && intelRes.value.ok ? intelRes.value.data : null;
  if (intel) {
    const intelLines: string[] = [];
    if (intel.tide) {
      intelLines.push(`Market tide: ${intel.tide.bias} (calls $${(intel.tide.netCallPremium / 1e6).toFixed(1)}M / puts $${(intel.tide.netPutPremium / 1e6).toFixed(1)}M)`);
    }
    for (const t of intel.insiders?.slice(0, 3) ?? []) {
      intelLines.push(`Insider: ${t.ticker} ${t.insider} ${t.type} $${(t.value / 1e6).toFixed(2)}M (${t.date})`);
    }
    for (const o of intel.options?.slice(0, 3) ?? []) {
      intelLines.push(`Unusual options: ${o.symbol} ${o.side} ${o.strike} exp ${o.exp} $${(o.premium / 1e6).toFixed(2)}M${o.sweep ? ' SWEEP' : ''}`);
    }
    if (intelLines.length) {
      lines.push('Smart-money intel (AXE Companion):');
      lines.push(...intelLines.map(l => `- ${l}`));
    }
  }

  return lines.join('\n');
}

export async function runTradingResearch(
  input: RunResearchInput,
): Promise<TradingIntelReport> {
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) throw new Error('Ticker is required');

  let report = createEmptyReport({
    ticker,
    name: input.name,
    source: (input.useCrew !== false && isAxeApiConfigured) ? 'crewai' : input.callLlm ? 'axe_core' : 'trading_agents',
  });
  report.status = 'running';
  report.horizon = input.horizon || 'swing';
  report.tags = ['trading-agents', 'multi-agent'];
  report = await upsertIntelReport(report);
  input.onProgress?.('init', `Research desk opened for ${ticker}`);

  // CrewAI DEFAULT for this tab when VPS is up
  const preferCrew = input.useCrew !== false;
  if (preferCrew && isAxeApiConfigured) {
    input.onProgress?.('crew', 'Dispatching research CrewAI (always-on for this tab)…');
    try {
      input.onProgress?.('crew', 'Pulling real price/news context…');
      const realData = await buildRealDataContext(ticker);
      const notesWithRealData = [input.notes, realData].filter(Boolean).join('\n\n');
      const task = buildResearchCrewTask({
        ticker,
        horizon: input.horizon,
        notes: notesWithRealData,
      });
      const res = await crewRun({
        task,
        specialists: [...RESEARCH_CREW_SPECIALISTS],
        context: notesWithRealData,
      });
      if (res.status === 'ok' && res.result) {
        report.body = res.result;
        report.signal = parseSignal(res.result);
        report.thesis = (res.result.match(/THESIS:\s*([\s\S]*?)(?:LEVELS:|RISKS:|CATALYSTS:|TRADE_PLAN:|FULL_BRIEF:|$)/i)?.[1] || res.result).trim().slice(0, 800);
        report.source = 'crewai';
        report.runRef = `crew:${Date.now()}`;
        report.agents = PIPELINE.map(role => heuristicAgent(role, ticker, res.result?.slice(0, 240)));
        const comp = compositeSignal(report.agents);
        report.confidence = parseConfidence(res.result, comp.confidence);
        report.status = 'complete';
        report.catalysts = extractBullets(res.result, 5);
        report.risks = extractBullets(res.result, 5);
        report.tags = Array.from(new Set([...(report.tags || []), 'crewai', 'research-crew', report.signal.toLowerCase()]));
        input.onProgress?.('done', `${report.signal} · crew`);
        // crewai_manager's only write site before this: none. Its hub in
        // Neural/Terrain existed but stayed empty regardless of how many
        // research crews actually ran — recorded here, at the real outcome,
        // not a UI click, so the count reflects genuine crew activity.
        recordEvent({
          kind: 'agent_run',
          summary: `Research crew: ${ticker} → ${report.signal} (${Math.round(report.confidence * 100)}%)`,
          details: { ticker, signal: report.signal, confidence: report.confidence, horizon: input.horizon },
          agentId: 'crewai_manager',
        });
        return upsertIntelReport(report);
      }
      input.onProgress?.('crew', res.error || 'Crew returned no result — local desk fallback');
      recordEvent({
        kind: 'error',
        summary: `Research crew returned no result for ${ticker}`,
        details: { ticker, error: res.error ?? null },
        agentId: 'crewai_manager',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Crew failed — local desk fallback';
      input.onProgress?.('crew', msg);
      recordEvent({
        kind: 'error',
        summary: `Research crew failed for ${ticker}: ${msg.slice(0, 120)}`,
        details: { ticker, error: msg },
        agentId: 'crewai_manager',
      });
    }
  } else if (preferCrew && !isAxeApiConfigured) {
    input.onProgress?.('crew', 'AXE API offline — local TradingAgents desk fallback');
  }

  const agents: AgentBrief[] = [];
  for (const role of PIPELINE) {
    input.onProgress?.(role, meta(role).label);
    if (input.callLlm) agents.push(await llmAgent(role, ticker, input.notes, input.callLlm));
    else {
      await new Promise(r => setTimeout(r, 40));
      agents.push(heuristicAgent(role, ticker, input.notes));
    }
  }

  const { signal, confidence } = compositeSignal(agents);
  const mgr = agents.find(a => a.role === 'research_manager');
  const trader = agents.find(a => a.role === 'trader');
  report.agents = agents;
  report.signal = signal;
  report.confidence = confidence;
  report.thesis = mgr?.summary || `Desk view ${ticker}: ${signal} @ ${(confidence * 100).toFixed(0)}%.`;
  report.risks = agents.filter(a => a.role.startsWith('risk_') || a.role === 'bear_researcher').flatMap(a => a.keyPoints).slice(0, 6);
  report.catalysts = agents.filter(a => a.role === 'bull_researcher' || a.role === 'news_analyst').flatMap(a => a.keyPoints).slice(0, 5);
  report.body = [`# Trading Intel — ${ticker}`, `Signal **${signal}** · ${(confidence * 100).toFixed(0)}%`, '', '## Thesis', report.thesis, '', '## Trade plan', trader?.summary || '—', '', '## Agents', ...agents.map(a => `### ${a.label}\n${a.summary}`), '', 'Framework: TradingAgents-inspired · CrewAI preferred'].join('\n');
  report.status = 'complete';
  report.tags = Array.from(new Set([...(report.tags || []), signal.toLowerCase(), report.assetClass]));
  input.onProgress?.('done', `${signal} · ${(confidence * 100).toFixed(0)}%`);
  return upsertIntelReport(report);
}

export function buildCallLlmFromSlots(
  slots: KeySlot[],
  callProvider: (slot: KeySlot, messages: Array<{ role: string; content: string }>) => Promise<string>,
): ((system: string, user: string) => Promise<string>) | undefined {
  if (!slots.length) return undefined;
  return async (system, user) => {
    let lastErr: unknown;
    // Every slot, not the first three. The cascade is deliberately ordered with
    // Ollama last precisely because it cannot be revoked -- stopping at three
    // throws that away and fails the research run while a working provider is
    // still sitting in the list.
    for (const slot of slots) {
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
