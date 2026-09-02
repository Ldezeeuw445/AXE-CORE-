/**
 * Where the decision log lives, and how the trading memory is read as a whole.
 *
 * Two jobs, kept together because they answer one question: what does this
 * desk actually know, and how do we know it is still true?
 *
 * Decisions are stored in global memory under this app's own namespace, the
 * same store the ledger uses — so a decision and the ledger rows it was drawn
 * from cannot end up in different places with different retention.
 */
import {
  loadGlobalMemories, saveGlobalMemory,
} from '@/infrastructure/persistence/globalMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { sbRunSql } from '@/infrastructure/gateways/axeCoreApiService';
import {
  newDecisionId, sortDecisions, type DeskDecision,
} from '@/domain/tradingIntel/deskDecisions';

// Same category as the ledger, kept apart by the key prefix — exactly how the
// ledger already separates its own rows. A decision and the ledger rows it was
// drawn from then share one store and one retention, which is the point: they
// are only useful together.
const CATEGORY = 'trading_memory';
const PREFIX = 'dd:';

export async function listDecisions(): Promise<DeskDecision[]> {
  const rows = await loadGlobalMemories(AXE_USER_ID, CATEGORY, 300).catch(() => []);
  const out: DeskDecision[] = [];
  for (const r of rows) {
    if (!(r.key || '').startsWith(PREFIX)) continue;
    try {
      const d = JSON.parse(r.value) as DeskDecision;
      if (d?.id && d.what) out.push(d);
    } catch { /* a malformed row is not a decision */ }
  }
  return sortDecisions(out);
}

export async function saveDecision(
  input: Omit<DeskDecision, 'id' | 'at'> & Partial<Pick<DeskDecision, 'id' | 'at'>>,
): Promise<DeskDecision> {
  const decision: DeskDecision = {
    id: input.id ?? newDecisionId(),
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    run: (input.run || 'all').trim().toLowerCase(),
    what: input.what.trim(),
    why: input.why.trim(),
    evidence: input.evidence ?? [],
    expectation: input.expectation?.trim() || undefined,
    outcome: input.outcome,
  };
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: CATEGORY,
    key: `${PREFIX}${decision.id}`,
    value: JSON.stringify(decision),
    confidence: 1,
    metadata: { kind: 'decision', run: decision.run, decisionKind: decision.kind },
  });
  return decision;
}

/** Grade a decision that made a prediction. */
export async function gradeDecision(
  id: string, verdict: 'held' | 'failed' | 'unclear', note: string,
): Promise<DeskDecision | null> {
  const all = await listDecisions();
  const found = all.find(d => d.id === id);
  if (!found) return null;
  return saveDecision({
    ...found,
    outcome: { at: new Date().toISOString(), verdict, note: note.trim() },
  });
}

/* ------------------------------------------------------- memory overview */

export interface AgentMemoryHealth {
  agent: string;
  rows: number;
  newest: string | null;
  /** Hours since the newest row, or null when there is nothing at all. */
  ageHours: number | null;
  /** Writing recently enough to be part of the current cycle. */
  live: boolean;
}

/** An agent that has not written in this long has stopped taking part. */
const STALE_AFTER_HOURS = 6;

/**
 * Which agents are actually recording, and which have gone quiet.
 *
 * This is the check that has no other home. Measured 2026-08-26: axe_trader
 * held 5 133 facts whose newest was three days old, while axe_intel and
 * axe_companion had both written within the hour — and axe_research had never
 * written at all. The agent that places the trades was the one not recording,
 * and nothing on any screen said so.
 *
 * Counting rows alone would have hidden it: 5 133 is the biggest number on the
 * page. The age is the part that matters.
 */
export async function agentMemoryHealth(): Promise<AgentMemoryHealth[]> {
  const rows = await sbRunSql(`
    select agent, count(*) as rows, max(created_at) as newest
    from memory
    group by agent
    order by count(*) desc
  `).catch(() => []) as Array<{ agent: string; rows: number | string; newest: string | null }>;

  const now = Date.now();
  return rows.map(r => {
    const newest = r.newest ?? null;
    const ageHours = newest ? (now - Date.parse(newest)) / 3_600_000 : null;
    return {
      agent: r.agent ?? 'unknown',
      rows: Number(r.rows) || 0,
      newest,
      ageHours,
      live: ageHours != null && ageHours < STALE_AFTER_HOURS,
    };
  });
}

/** Every agent the trading desk is supposed to have, so a silent one is a
 *  visible gap rather than a missing row. */
export const EXPECTED_TRADING_AGENTS = [
  'axe_research', 'axe_intel', 'axe_companion', 'axe_trader', 'global',
] as const;
