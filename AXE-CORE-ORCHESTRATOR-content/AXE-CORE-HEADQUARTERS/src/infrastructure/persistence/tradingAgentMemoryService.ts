/**
 * tradingAgentMemoryService — dedicated memory lane for the AXE Trading Agent.
 * Stored in global_memory with category system_event + key prefix ta:
 * so the agent only recalls its own trades, lessons, and open thesis.
 * Important decisions are also mirrored into Obsidian (Trading/ folder).
 *
 * Still on `saveGlobalMemory` directly, not `memoryRecorder.recordEvent`:
 * loadTradingAgentMemory()/buildTradingAgentContext() below filter on the
 * `ta:<agent>:` key prefix and on custom metadata (agent/symbol/kind) that
 * recordEvent doesn't preserve (its metadata is a fixed {kind, summary}).
 * See tradingAgentBrain.ts's header for the fuller version of this note.
 */
import {
  saveGlobalMemory,
  loadGlobalMemories,
  type GlobalMemoryEntry,
} from '@/infrastructure/persistence/globalMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import type { TradingAgentDecision } from '@/domain/tradingIntel/demoTypes';
import { TRADING_AGENT_ID } from '@/domain/tradingIntel/demoTypes';
import {
  writeObsidianNote,
  notePathFromTitle,
} from '@/infrastructure/persistence/obsidianMemoryService';

const PREFIX = `ta:${TRADING_AGENT_ID}:`;

function key(part: string): string {
  return `${PREFIX}${part}`;
}

async function mirrorObsidian(title: string, content: string, tags: string[]): Promise<void> {
  try {
    await writeObsidianNote({
      path: notePathFromTitle(title, 'Trading'),
      title,
      content,
      tags: ['trading', 'trading-agent', ...tags],
      source: 'system',
      metadata: { agent: TRADING_AGENT_ID },
    });
  } catch (err) {
    console.warn('[tradingAgentMemory] obsidian mirror skipped:', err);
  }
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

  const body = [
    `# Trading decision — ${d.symbol}`,
    '',
    `- **Action:** ${d.action.toUpperCase()}`,
    `- **Confidence:** ${(d.confidence * 100).toFixed(0)}%`,
    d.qty != null ? `- **Qty:** ${d.qty}` : null,
    d.inputs?.lastPrice != null ? `- **Last:** ${d.inputs.lastPrice}` : null,
    d.executedTradeId ? `- **Trade id:** ${d.executedTradeId}` : null,
    '',
    '## Rationale',
    d.rationale,
    '',
    `[[Trading Agent]] · [[${d.symbol}]]`,
    '',
    `_id: ${d.id} · ${d.createdAt}_`,
  ]
    .filter(Boolean)
    .join('\n');

  void mirrorObsidian(
    `${d.symbol} ${d.action} ${d.createdAt.slice(0, 16)}`,
    body,
    [d.symbol.toLowerCase(), d.action],
  );
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

  void mirrorObsidian(
    `Lesson ${symbol} ${new Date().toISOString().slice(0, 10)}`,
    [`# Lesson — ${symbol}`, '', lesson, '', `[[Trading Agent]] · [[${symbol}]]`].join('\n'),
    [symbol.toLowerCase(), 'lesson'],
  );
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

  void mirrorObsidian(
    `Thesis ${symbol.toUpperCase()}`,
    [`# Open thesis — ${symbol.toUpperCase()}`, '', thesis, '', `[[Trading Agent]] · [[${symbol.toUpperCase()}]]`].join('\n'),
    [symbol.toLowerCase(), 'thesis'],
  );
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
