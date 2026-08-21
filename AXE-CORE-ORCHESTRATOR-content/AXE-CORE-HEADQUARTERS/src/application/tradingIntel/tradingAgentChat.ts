/**
 * tradingAgentChat — talk to the trading agent about its own reasoning.
 *
 * Scoped separately from AXE's main assistant (voiceStore) so trading talk
 * doesn't pollute the general chat history. Was a single callProvider() call
 * against just the ★ Primary slot — no fallback at all. Found live
 * 2026-08-17: with the main assistant's own cascade (google → ollama →
 * openrouter) working fine on the same key/quota state, this path alone
 * surfaced "quota exceeded" and stopped dead, because it had nowhere else to
 * go. Now builds the same kind of cascade the main assistant and trading
 * research already use — see buildStableChatCascade in providers.ts.
 */
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import { buildStableChatCascade, defaultOllamaSlot, PROVIDERS, type KeySlot } from '@/domain/providers';
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

function readStoredSlot(key: string): KeySlot | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as KeySlot;
    return p?.provider ? p : null;
  } catch {
    return null;
  }
}

function readPrimarySlot(): KeySlot | null {
  return readStoredSlot('axe_slot_primary');
}

/** Every provider with a saved key, for the cascade to fall through beyond
 *  the three named identity slots — same approach as useTradingDeskState's
 *  buildTradingCallLlm and installStableChat's collectAllSlots. */
function collectConfiguredSlots(): KeySlot[] {
  const slots: KeySlot[] = [];
  const push = (s: KeySlot | null | undefined) => {
    if (s?.provider && !slots.some(x => x.provider === s.provider)) slots.push(s);
  };
  push(readPrimarySlot());
  push(readStoredSlot('axe_slot_fallback1'));
  push(readStoredSlot('axe_slot_fallback2'));
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, { key?: string; model?: string; baseUrl?: string } | undefined>;
    for (const [id, c] of Object.entries(conns)) {
      if (!c?.key || c.key.length < 4) continue;
      const cfg = PROVIDERS.find(p => p.id === id);
      push({ provider: id as KeySlot['provider'], key: c.key, model: c.model || cfg?.defaultModel, baseUrl: c.baseUrl || cfg?.baseUrl });
    }
  } catch { /* ignore */ }
  push(defaultOllamaSlot());
  return slots;
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

/**
 * The provider cascade, for callers that are not the chat box.
 *
 * The autopilot called runTradingResearch WITHOUT a callLlm, so when CrewAI
 * failed it fell through to heuristicAgent — a canned sentence, not a desk.
 * That is where "Desk ETHUSD: balanced — no full size until tape + catalyst
 * align" came from, on every pair, for days, while it read as research on the
 * desk and was weighted like research by the score.
 *
 * The cascade already walks EVERY configured slot and deliberately ends on
 * Ollama, which cannot be revoked. Handing it to the autopilot is what makes
 * "Gemini is down" mean "the next provider answers" rather than "trading stops
 * thinking" — which is exactly what Luka asked for.
 */
export function buildResearchCascade(): KeySlot[] {
  return buildStableChatCascade(collectConfiguredSlots(), {
    primary: readPrimarySlot(),
    fallback1: readStoredSlot('axe_slot_fallback1'),
    fallback2: readStoredSlot('axe_slot_fallback2'),
  });
}

export async function sendTradingChatMessage(input: SendTradingChatInput): Promise<string> {
  const allSlots = collectConfiguredSlots();
  const cascade = buildStableChatCascade(allSlots, {
    primary: readPrimarySlot(),
    fallback1: readStoredSlot('axe_slot_fallback1'),
    fallback2: readStoredSlot('axe_slot_fallback2'),
  });
  if (!cascade.length) {
    throw new Error('No ★ Primary provider configured — set one in Settings first.');
  }
  const system = buildSystemPrompt(input);
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: system },
    ...input.history.slice(-12).map(m => ({ role: (m.role === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.text })),
    { role: 'user', content: input.text },
  ];
  let lastErr: unknown;
  for (const slot of cascade) {
    try {
      return await callProvider(slot, messages);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All LLM slots failed');
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
