/**
 * Which hub a memory row belongs to. One answer, one file.
 *
 * This rule was written out four separate times: as SQL in
 * memoryHubCountsService (three times over, once per table), as an if-chain in
 * useGlobalMemoryStats, and as a ternary chain in NeuralMemorySystem. Each
 * copy carried its own comment saying "keep this in step with the others",
 * which is what a codebase says right before they drift.
 *
 * They had already drifted: only two of the four knew that a `ta:` key is the
 * trading agent rather than a system event, and none of them knew about the
 * `memory` table at all -- 11,680 rows in no view.
 *
 * JS and SQL cannot literally share an implementation, so they sit here side
 * by side instead. If you change one, the other is on the next screen.
 */
import type { HubId } from '@/domain/memory/memoryHubs';

/* ────────────────────────────────────────────────────────────────
   global_memory — the largest store, and the one that hid Trading.
   ──────────────────────────────────────────────────────────────── */

export interface GlobalRowLike {
  key?: string | null;
  category?: string | null;
  metadata?: { agentId?: string } | Record<string, unknown> | null;
}

/**
 * `ta:` is tested BEFORE category, and that order is the whole point: the
 * trading agent writes every one of its ~15,000 rows as `system_event`, so
 * checking category first files its entire brain under "launches and outages".
 */
export function hubForGlobalRow(row: GlobalRowLike): HubId {
  const agentId = (row.metadata as { agentId?: string } | null | undefined)?.agentId;
  const key = row.key ?? '';
  if (key.startsWith('ta:')) return 'trading';
  if (agentId) return 'agents';
  switch (row.category) {
    case 'conversation_context': return 'conversations';
    case 'user_preference':      return 'preferences';
    case 'system_event':         return 'events';
    default:                     return 'insights';
  }
}

export const GLOBAL_HUB_CASE = `
  CASE
    WHEN key LIKE 'ta:%'                        THEN 'trading'
    WHEN metadata->>'agentId' IS NOT NULL       THEN 'agents'
    WHEN category = 'conversation_context'      THEN 'conversations'
    WHEN category = 'user_preference'           THEN 'preferences'
    WHEN category = 'system_event'              THEN 'events'
    ELSE 'insights'
  END`;

/* ────────────────────────────────────────────────────────────────
   memory — the three agents' own store.
   ──────────────────────────────────────────────────────────────── */

/**
 * The trader joins Trading, where its global_memory rows already are, so one
 * agent is not split across two mountains. Intel and Companion are agents.
 */
export function hubForAgentRow(agent: string | null | undefined): HubId {
  if (agent === 'axe_trader') return 'trading';
  if (agent === 'axe_intel' || agent === 'axe_companion') return 'agents';
  return 'insights';
}

export const AGENT_HUB_CASE = `
  CASE
    WHEN agent = 'axe_trader'                   THEN 'trading'
    WHEN agent IN ('axe_intel','axe_companion') THEN 'agents'
    ELSE 'insights'
  END`;

/* ────────────────────────────────────────────────────────────────
   Obsidian notes — by the folder that carries the meaning.
   ──────────────────────────────────────────────────────────────── */

/**
 * The vault is AXE/Reflections, AXE/Skills, AXE/System, so the SECOND segment
 * is where the meaning lives. Reading the first found `axe` for all 57 notes
 * and dropped every one of them into Resources. Top-level names still work for
 * a vault that grows into them.
 */
export function hubForNotePath(path: string): HubId {
  const parts = (path || '').toLowerCase().split('/');
  const segment = parts[0] === 'axe' ? parts[1] : parts[0];
  switch (segment) {
    case 'projects':      return 'projects';
    case 'tasks':
    case 'goals':         return 'tasksgoals';
    case 'reflections':   return 'insights';
    case 'skills':        return 'knowledge';
    case 'system':        return 'events';
    case 'conversations': return 'conversations';
    default:              return 'resources';
  }
}

export const NOTE_HUB_CASE = `
  CASE lower(split_part(path,'/',2))
    WHEN 'reflections' THEN 'insights'
    WHEN 'skills'      THEN 'knowledge'
    WHEN 'system'      THEN 'events'
    WHEN 'projects'    THEN 'projects'
    WHEN 'tasks'       THEN 'tasksgoals'
    WHEN 'goals'       THEN 'tasksgoals'
    ELSE 'resources'
  END`;

/** rag_memories is the Knowledge hub in its entirety. */
export const RAG_HUB: HubId = 'knowledge';
