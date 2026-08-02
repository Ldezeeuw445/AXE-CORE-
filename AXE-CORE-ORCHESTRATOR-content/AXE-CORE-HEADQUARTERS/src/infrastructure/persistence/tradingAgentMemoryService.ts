/**
 * tradingAgentMemoryService — dedicated memory lane for the AXE Trading Agent.
 * Stored in global_memory with category system_event + key prefix ta:
 * so the agent only recalls its own trades, lessons, and open thesis.
 */
import {
  saveGlobalMemory,
  loadGlobalMemories,
  type GlobalMemoryEntry,
} from '@/infrastructure/persistence/globalMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import type { TradingAgentDecision } from '@/domain/tradingIntel/demoTypes';
import { TRADING_AGENT_ID } from '@/domain/tradingIntel/demoTypes';

const PREFIX = `ta:${TRADING_AGENT_ID}:`;

function key(part: string): string {
  return `${PREFIX}${part}`;
}

export async function rememberTradeDecision(d: TradingAgentDecision): Promise<void> {
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: key(`decision:${d.id}`),
    value: JSON.stringify(d),
    confidence: d.confidence,
    metadata: { agent: TRADING_AGENT_ID, symbol: d.symbol, action: d.action },
  });
}

export async function rememberLesson(symbol: string, lesson: string, confidence = 0.7): Promise<void> {
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: key(`lesson:${symbol}:${Date.now()}`),
    value: lesson.slice(0, 1500),
    confidence,
    metadata: { agent: TRADING_AGENT_ID, symbol, kind: 'lesson' },
  });
}

export async function rememberOpenThesis(symbol: string, thesis: string): Promise<void> {
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: key(`thesis:${symbol.toUpperCase()}`),
    value: thesis.slice(0, 2000),
    confidence: 0.75,
    metadata: { agent: TRADING_AGENT_ID, symbol: symbol.toUpperCase(), kind: 'thesis' },
  });
}

export async function loadTradingAgentMemory(limit = 80): Promise<GlobalMemoryEntry[]> {
  const all = await loadGlobalMemories(AXE_USER_ID, 'system_event', 200);
  return all
    .filter(m => (m.key || '').startsWith(PREFIX) || m.metadata?.agent === TRADING_AGENT_ID)
    .slice(0, limit);
}

export async function buildTradingAgentContext(symbol?: string): Promise<string> {
  const mem = await loadTradingAgentMemory(40);
  const filtered = symbol
    ? mem.filter(m => {
        const s = String(m.metadata?.symbol || '').toUpperCase();
        return !s || s === symbol.toUpperCase() || (m.value || '').includes(symbol.toUpperCase());
      })
    : mem;

  if (!filtered.length) {
    return 'Trading agent memory: empty — no prior demo trades or lessons.';
  }

  const lines = filtered.slice(0, 20).map(m => {
    const kind = m.metadata?.kind || m.metadata?.action || 'note';
    const val = m.value.length > 220 ? m.value.slice(0, 220) + '…' : m.value;
    return `- [${kind}] ${m.key.replace(PREFIX, '')}: ${val}`;
  });

  return [`Trading agent memory (${TRADING_AGENT_ID}):`, ...lines].join('\n');
}
