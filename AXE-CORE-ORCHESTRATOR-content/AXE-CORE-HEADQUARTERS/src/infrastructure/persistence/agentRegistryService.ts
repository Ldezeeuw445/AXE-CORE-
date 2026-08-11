/**
 * agentRegistryService — reads/writes `public.agents` through axe-core-api.
 *
 * Goes through sbGetRows/sbInsertRow/sbUpdateRow (service_role, proven
 * working for agent_memory) rather than sbRunSql — sbRunSql is the read-only
 * exec_sql RPC that silently swallowed writes to global_memory,
 * core_obsidian_notes and every other table until each was moved off it.
 * `agents` starts on the working path instead of repeating that bug a fifth
 * time.
 */
import { sbGetRows, sbInsertRow, sbUpdateRow } from '@/infrastructure/gateways/axeCoreApiService';
import { AGENT_SEEDS, type AgentStatus } from '@/domain/agents/agentRegistry';

export interface AgentRecord {
  id: string;
  name: string;
  group_label: string;
  icon: string | null;
  color: string | null;
  status: AgentStatus;
  description: string | null;
  system_prompt: string | null;
  skills: string[];
  tools: string[];
  created_at?: string;
  updated_at?: string;
}

let seeded = false;

/**
 * Insert any AGENT_SEEDS entry missing from the table. Idempotent and safe
 * to call on every app boot — existing rows (including anything Luka has
 * since edited via the Agents tab) are never touched.
 */
export async function ensureAgentsSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true; // optimistic: a failed attempt just retries next boot, not this session
  try {
    const existing = await sbGetRows<{ id: string }>('agents', { limit: 200 });
    const have = new Set(existing.map(r => r.id));
    const missing = AGENT_SEEDS.filter(s => !have.has(s.id));
    for (const s of missing) {
      await sbInsertRow('agents', {
        id: s.id,
        name: s.name,
        group_label: s.groupLabel,
        icon: s.icon,
        color: s.color,
        status: s.status,
        description: s.description,
        skills: [],
        tools: [],
      });
    }
  } catch (err) {
    seeded = false;
    console.error('[agentRegistry] seeding failed:', err);
  }
}

export async function loadAgents(): Promise<AgentRecord[]> {
  return sbGetRows<AgentRecord>('agents', { limit: 200, orderBy: 'group_label', orderDir: 'asc' });
}

export async function updateAgent(id: string, patch: Partial<Pick<AgentRecord,
  'system_prompt' | 'skills' | 'tools' | 'description' | 'status'
>>): Promise<void> {
  await sbUpdateRow('agents', id, patch);
}
