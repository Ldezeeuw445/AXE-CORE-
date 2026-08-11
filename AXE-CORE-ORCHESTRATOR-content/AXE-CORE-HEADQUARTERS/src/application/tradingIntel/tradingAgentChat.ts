/**
 * tradingAgentChat — talk to the trading agent about its own reasoning.
 *
 * Scoped separately from AXE's main assistant (voiceStore) so trading talk
 * doesn't pollute the general chat history. Uses the same ★ Primary provider
 * slot as the rest of the app (axe_slot_primary in localStorage — same
 * pattern axeBootstrap.ts's warmPrimaryAtBoot already reads inline) via a
 * single callProvider() call — not the full multi-provider fallback cascade
 * the main assistant uses, since this is a scoped v1, not the identity chat.
 */
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { ThinkingTrace, AgentLearningStats } from '@/domain/tradingIntel/botTypes';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { getLearningStats, listThinkingTraces } from '@/infrastructure/persistence/tradingLearningService';
import { loadTradingAgentMemory } from '@/infrastructure/persistence/tradingAgentMemoryService';

const HISTORY_KEY = 'axe_trading_agent_chat_history';
const MAX_HISTORY = 40;

export interface TradingChatAttachment {
  name: string;
  kind: 'image' | 'file';
  /** Only images keep a data URL for inline preview — arbitrary files would
   *  bloat the persisted history for no benefit since nothing renders them. */
  dataUrl?: string;
}

export interface TradingChatMessage {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
  attachments?: TradingChatAttachment[];
}

export async function loadTradingChatHistory(): Promise<TradingChatMessage[]> {
  return loadSetting<TradingChatMessage[]>(HISTORY_KEY, []);
}

export async function saveTradingChatHistory(messages: TradingChatMessage[]): Promise<void> {
  await saveSetting(HISTORY_KEY, messages.slice(-MAX_HISTORY));
}

export async function clearTradingChatHistory(): Promise<void> {
  await saveSetting(HISTORY_KEY, []);
}

function readPrimarySlot(): KeySlot | null {
  try {
    const raw = localStorage.getItem('axe_slot_primary');
    if (!raw) return null;
    const p = JSON.parse(raw) as KeySlot;
    return p?.provider ? p : null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(ctx: {
  symbol?: string;
  lastTrace?: ThinkingTrace | null;
  learning?: AgentLearningStats | null;
  memory?: GlobalMemoryEntry[];
}): string {
  const lines: string[] = [
    "You are AXE ALGO — AXE's self-improving demo trading agent, running inside AXE CORE's Trading tab.",
    "You reason over live intel, technicals, and your own memory to decide trades, and you journal every decision.",
    'The person you are talking to is Luka, your operator. Answer plainly, reference your actual numbers below, and be honest when you are unsure or when a cycle was blocked by risk.',
    '',
    `Current symbol on the desk: ${ctx.symbol ?? '(none selected)'}`,
  ];
  if (ctx.learning) {
    lines.push(
      `Learning: ${ctx.learning.tradesClosed} trades closed, ${(ctx.learning.winRate * 100).toFixed(0)}% win rate, learned min-confidence ${(ctx.learning.learnedMinConfidence * 100).toFixed(0)}%.`,
    );
    if (ctx.learning.lastLesson) lines.push(`Last lesson: ${ctx.learning.lastLesson}`);
  }
  if (ctx.lastTrace) {
    lines.push(
      `Last decision: ${ctx.lastTrace.finalAction.toUpperCase()} ${ctx.lastTrace.symbol} @ ${(ctx.lastTrace.confidence * 100).toFixed(0)}% confidence${ctx.lastTrace.blockedByRisk ? ` (blocked: ${ctx.lastTrace.blockedByRisk})` : ''}.`,
    );
    lines.push('Reasoning steps from that cycle:');
    for (const s of ctx.lastTrace.steps.slice(-8)) lines.push(`- [${s.phase}] ${s.detail}`);
  }
  if (ctx.memory?.length) {
    lines.push('Recent memory:');
    for (const m of ctx.memory.slice(0, 10)) lines.push(`- ${m.key.replace(/^ta:[^:]+:/, '')}: ${String(m.value).slice(0, 160)}`);
  }
  return lines.join('\n');
}

export interface SendTradingChatInput {
  text: string;
  history: TradingChatMessage[];
  symbol?: string;
  lastTrace?: ThinkingTrace | null;
  learning?: AgentLearningStats | null;
  memory?: GlobalMemoryEntry[];
}

export async function sendTradingChatMessage(input: SendTradingChatInput): Promise<string> {
  const slot = readPrimarySlot();
  if (!slot) {
    throw new Error('No ★ Primary provider configured — set one in Settings first.');
  }
  const system = buildSystemPrompt(input);
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: system },
    ...input.history.slice(-12).map(m => ({ role: (m.role === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.text })),
    { role: 'user', content: input.text },
  ];
  return callProvider(slot, messages);
}

/**
 * Gathers the same grounding context the Brain tab already has (learning
 * stats, recent memory, last thinking trace) for callers that don't have
 * useTradingDeskState mounted — the RightPanel widget and floating window
 * live outside the Trading tab's route entirely, so they fetch this
 * standalone instead of receiving it as props.
 */
export async function loadDefaultChatContext(): Promise<{
  learning: AgentLearningStats;
  memory: GlobalMemoryEntry[];
  lastTrace: ThinkingTrace | null;
}> {
  const [learning, memory, traces] = await Promise.all([
    getLearningStats(),
    loadTradingAgentMemory(),
    listThinkingTraces(1),
  ]);
  return { learning, memory, lastTrace: traces[0] ?? null };
}
