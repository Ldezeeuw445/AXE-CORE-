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
  type GlobalMemoryEntry,
} from '@/infrastructure/persistence/globalMemoryService';
import { recall } from '@/infrastructure/persistence/agentMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import type { TradingAgentDecision } from '@/domain/tradingIntel/demoTypes';
import { TRADING_AGENT_ID } from '@/domain/tradingIntel/demoTypes';

const PREFIX = `ta:${TRADING_AGENT_ID}:`;

function key(part: string): string {
  return `${PREFIX}${part}`;
}

// Per-event Obsidian mirroring is deliberately disabled. It wrote a separate
// note for every decision/lesson/thesis (~2000 fragments) and had been
// silently failing to produce any — that is note-spam, not memory. The trading
// vault is now a growing, consolidated knowledge base generated from the ledger
// instead: one living scorecard per pair + a strategy index (see
// tradingObsidianMemory.ts's syncTradingObsidian, run after every self-test).
// Kept as a no-op so the existing call sites stay valid without change.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function mirrorObsidian(_title: string, _content: string, _tags: string[]): Promise<void> {
  /* intentionally no-op — see note above */
}

export async function rememberTradeDecision(d: TradingAgentDecision): Promise<void> {
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: key(`decision:${d.id}`),
    value: JSON.stringify(d),
    confidence: d.confidence,
    metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', symbol: d.symbol, action: d.action },
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
    metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', symbol, kind: 'lesson' },
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
    metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', symbol: symbol.toUpperCase(), kind: 'thesis' },
  });

  void mirrorObsidian(
    `Thesis ${symbol.toUpperCase()}`,
    [`# Open thesis — ${symbol.toUpperCase()}`, '', thesis, '', `[[Trading Agent]] · [[${symbol.toUpperCase()}]]`].join('\n'),
    [symbol.toLowerCase(), 'thesis'],
  );
}

/**
 * The trading agent's own history.
 *
 * This used to fetch the newest 200 `system_event` rows and THEN keep its own.
 * Measured on the live database: 137 of those 200 were its own and 63 belonged
 * to other agents — a third of the window spent on events it cannot use, and
 * the cap applied before the filter, so its older memories were unreachable no
 * matter how many it had. It has 5 157.
 *
 * The namespace moves the filter into the query, so every row fetched is one
 * it can actually use.
 */
export async function loadTradingAgentMemory(limit = 80): Promise<GlobalMemoryEntry[]> {
  const rows = await recall('axe_trader', { limit: Math.max(limit, 200) });
  // Mapped back to the shape callers already expect: this changes where the
  // memory comes from, not what the brain and the panels are handed.
  return rows.slice(0, limit).map(r => ({
    id: r.id,
    user_id: r.user_id ?? AXE_USER_ID,
    category: r.category ?? 'system_event',
    key: r.key ?? '',
    value: r.content,
    confidence: r.confidence ?? 0.7,
    created_at: r.created_at,
    updated_at: r.created_at,
    metadata: { agent: TRADING_AGENT_ID, symbol: r.symbol ?? undefined, kind: r.kind },
  })) as GlobalMemoryEntry[];
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
