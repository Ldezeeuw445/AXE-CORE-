/**
 * tradingAgentMemoryService — dedicated memory lane for the AXE Trading Agent.
 *
 * Writes and reads BOTH live in the `axe_trader` namespace. That sentence is
 * the whole point of this header, because for four days it was not true.
 *
 * ## The split this fixes
 *
 * f1f1dd6 (23 August) moved the READ here from global_memory to
 * `recall('axe_trader')`, and migrated the 5 157 existing rows across. The
 * WRITE was left on `saveGlobalMemory`. From that moment the agent wrote to one
 * table and read from another, and neither call failed — so nothing surfaced.
 *
 * Measured 2026-08-27: 10 464 rows in global_memory, the newest half an hour
 * old; 5 157 in the namespace, the newest four days old and frozen at the
 * migration. The trader was not silent. It was writing into a drawer it had
 * stopped opening, recalling a world that ended on the 23rd, and the Memory
 * tab reported it as "gone quiet" — which was true of the table it now reads
 * and false about the agent.
 *
 * ## Why the namespace wins rather than a write to both
 *
 * Writing to both would leave two places that are each nearly right, which is
 * how this bug happened. The namespace is where the read already looks and
 * where every other desk agent already writes.
 *
 * Moving out of global_memory also unclogs something else. buildDurableMemoryContext
 * takes the newest 120 rows there with no category filter; measured on the same
 * day, 93 of those 120 were this agent's trade events. The durable memory handed
 * to the brain was four-fifths machine chatter about fills.
 */
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { recall, remember } from '@/infrastructure/persistence/agentMemoryService';
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
  await remember({
    agent: 'axe_trader',
    // MemoryKind is a small shared vocabulary — 'fact' | 'lesson' | 'event' |
    // 'doc'. A decision is an event; the key keeps the finer distinction, and
    // buildTradingAgentContext already reads the type off the key.
    kind: 'event',
    key: key(`decision:${d.id}`),
    content: JSON.stringify(d),
    category: 'system_event',
    symbol: d.symbol,
    confidence: d.confidence,
    source: 'axe_algo',
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
  await remember({
    agent: 'axe_trader',
    kind: 'lesson',
    key: key(`lesson:${symbol}:${Date.now()}`),
    content: lesson.slice(0, 1500),
    category: 'system_event',
    symbol,
    confidence,
    source: 'axe_algo',
  });

  void mirrorObsidian(
    `Lesson ${symbol} ${new Date().toISOString().slice(0, 10)}`,
    [`# Lesson — ${symbol}`, '', lesson, '', `[[Trading Agent]] · [[${symbol}]]`].join('\n'),
    [symbol.toLowerCase(), 'lesson'],
  );
}

export async function rememberOpenThesis(symbol: string, thesis: string): Promise<void> {
  await remember({
    agent: 'axe_trader',
    // An open thesis is a standing fact about the symbol, not an event: it is
    // replaced rather than appended, which is what the stable key already does.
    kind: 'fact',
    key: key(`thesis:${symbol.toUpperCase()}`),
    content: thesis.slice(0, 2000),
    category: 'system_event',
    symbol: symbol.toUpperCase(),
    confidence: 0.75,
    source: 'axe_algo',
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
