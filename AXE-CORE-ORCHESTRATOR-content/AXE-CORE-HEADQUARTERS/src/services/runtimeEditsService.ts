/**
 * runtimeEditsService.ts
 * ------------------------------------------------------------------
 * Edits made from the Runtime workspace inspector (system prompt, skills)
 * are mirrored into `user_settings` via userSettingsService — this is
 * already a real Supabase table, so edits survive reloads without
 * requiring a new schema. We also best-effort upsert into `core_agents`
 * so anything else reading that table sees the same edit, but that path
 * is allowed to fail silently since its exact schema/constraints aren't
 * guaranteed across environments.
 */
import { getSupabase } from '@/lib/supabaseClient';
import { saveSetting, loadSetting } from '@/services/userSettingsService';

export interface AgentOverride {
  systemPrompt?: string | null;
  skills?: string[];
  updatedAt: string;
}

const OVERRIDES_KEY = 'axe_runtime_agent_overrides';

/** Keys are lower-cased agent save-keys (e.g. "wags", "axe core", "orchestrator"). */
export async function loadAgentOverrides(): Promise<Record<string, AgentOverride>> {
  return loadSetting<Record<string, AgentOverride>>(OVERRIDES_KEY, {});
}

export async function saveAgentEdit(
  agentSaveKey: string,
  edits: { systemPrompt?: string; skills?: string[] },
): Promise<void> {
  const overrides = await loadAgentOverrides();
  const key = agentSaveKey.toLowerCase();
  overrides[key] = { ...overrides[key], ...edits, updatedAt: new Date().toISOString() };
  await saveSetting(OVERRIDES_KEY, overrides);

  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('core_agents').upsert(
      {
        name: agentSaveKey,
        system_prompt: edits.systemPrompt,
        skills: edits.skills,
      },
      { onConflict: 'name' },
    );
  } catch {
    // Ignore — the user_settings mirror above is the durable source of truth for the Runtime workspace.
  }
}
