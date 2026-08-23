/**
 * One memory, with a namespace per agent.
 *
 * Named for what it adds — namespaces — rather than "unified", because
 * unifiedMemoryService already exists next to it and reads the OLD tables for
 * the Memory tab. Two files with one name is how six memory tables started.
 *
 * ## What this replaces
 *
 * Memory was spread over six live tables holding 9 875 rows. That was not a
 * tidiness problem: `agent_memory` held 24 rows while `global_memory` held
 * 6 777, and the trading agent read `agent_memory`. It was deciding from 0.4%
 * of what the system knew, which is why every lesson in its Brain tab was the
 * same sentence about BTCUSD.
 *
 * ## The rule
 *
 *   agent = 'axe_trader'   the trader's own memory, private to it
 *   agent = null           global memory, readable by everyone
 *
 * An agent READS its own namespace plus global. An agent WRITES only its own.
 * That is "every agent has its own memory" and "there is one global memory" in
 * a single table — not two systems that drift apart, which is how six tables
 * happened in the first place.
 *
 * Writing to another agent's namespace is not offered by this module at all.
 * A capability that could would eventually be used, and then two things own
 * one fact again.
 */
import { sbGetRows, sbInsertRow, isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';

/** The namespaces that exist. Agents own memory; capabilities do not. */
export type MemoryNamespace =
  | 'axe_trader' | 'axe_intel' | 'axe_developer' | 'axe_companion' | 'axe_core';

/**
 * Memory every agent may read.
 *
 * A literal, not NULL. NULL already means "unknown", and reusing it for
 * "shared" made the two indistinguishable — and unqueryable through the table
 * API, whose filter drops empty values.
 */
export const GLOBAL = 'global' as const;

export type MemoryKind = 'fact' | 'lesson' | 'event' | 'doc';

export interface MemoryRow {
  id: string;
  agent: string;
  user_id: string | null;
  kind: MemoryKind;
  key: string | null;
  content: string;
  category: string | null;
  tags: string[] | null;
  symbol: string | null;
  importance: number | null;
  confidence: number | null;
  source: string | null;
  created_at: string;
}

export interface RememberInput {
  /** Whose memory. Omit for global — a fact every agent should see. */
  agent?: MemoryNamespace | typeof GLOBAL;
  kind?: MemoryKind;
  /** Stable key makes this an upsert within the namespace. */
  key?: string;
  content: string;
  category?: string;
  tags?: string[];
  symbol?: string;
  importance?: number;
  confidence?: number;
  source?: string;
}

/**
 * Write one memory.
 *
 * Never throws: memory is a side effect of doing something else, and a failed
 * write must not take down the trade, the reply, or the build that produced
 * it. Failures are logged, not raised.
 */
export async function remember(input: RememberInput): Promise<boolean> {
  if (!isAxeApiConfigured) return false;
  const content = input.content?.trim();
  if (!content) return false;

  try {
    await sbInsertRow('memory', {
      agent: input.agent ?? GLOBAL,
      user_id: AXE_USER_ID,
      kind: input.kind ?? 'fact',
      key: input.key ?? null,
      content: content.slice(0, 8000),
      category: input.category ?? null,
      tags: input.tags ?? null,
      symbol: input.symbol ?? null,
      importance: input.importance ?? null,
      confidence: input.confidence ?? null,
      source: input.source ?? 'axe',
    });
    return true;
  } catch (err) {
    console.warn('[memory] write failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * What this agent can see: its own namespace plus global, newest first.
 *
 * The global rows are the point. Before this existed the trader could read 24
 * rows; the same call now reaches ~8 900 — the same database it was already
 * connected to, just no longer partitioned away from it.
 */
export async function recall(
  agent: MemoryNamespace | null,
  opts: { limit?: number; symbol?: string; kind?: MemoryKind } = {},
): Promise<MemoryRow[]> {
  if (!isAxeApiConfigured) return [];
  const limit = Math.min(opts.limit ?? 200, 1000);

  try {
    // Two reads rather than one OR: the API's table endpoint filters on a
    // single column, and asking for everything then filtering here would pull
    // thousands of rows to discard most of them.
    const [own, global] = await Promise.all([
      agent
        ? sbGetRows<MemoryRow>('memory', {
            limit, filterCol: 'agent', filterVal: agent,
            orderBy: 'created_at', orderDir: 'desc',
          })
        : Promise.resolve([]),
      sbGetRows<MemoryRow>('memory', {
        limit, filterCol: 'agent', filterVal: GLOBAL,
        orderBy: 'created_at', orderDir: 'desc',
      }),
    ]);

    return mergeNewestFirst(own ?? [], global ?? [], opts, limit);
  } catch (err) {
    console.warn('[memory] recall failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Merge two already-sorted lists and apply the narrow filters.
 *
 * Pure, so the ordering rule is testable without a database — and the ordering
 * is the part that matters: an agent that reads its own stale note above a
 * fresher global fact acts on the older one.
 */
export function mergeNewestFirst(
  own: MemoryRow[],
  global: MemoryRow[],
  opts: { symbol?: string; kind?: MemoryKind },
  limit: number,
): MemoryRow[] {
  const all = [...own, ...global].filter(r => {
    if (opts.symbol && r.symbol !== opts.symbol) return false;
    if (opts.kind && r.kind !== opts.kind) return false;
    return true;
  });
  all.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  return all.slice(0, limit);
}

/** Render for a prompt: compact, newest first, oldest dropped rather than truncated mid-line. */
export function formatForPrompt(rows: MemoryRow[], maxChars = 4000): string {
  const lines: string[] = [];
  let used = 0;
  for (const r of rows) {
    const where = r.agent;
    const line = `- [${where}${r.symbol ? ` ${r.symbol}` : ''}] ${r.content.replace(/\s+/g, ' ').trim()}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}
