/**
 * skillRegistryService — durable skill library + per-agent assignments.
 * Stored in user_settings; optional best-effort Obsidian note mirror.
 */
import { saveSetting, loadSetting } from '@/infrastructure/persistence/userSettingsService';
import {
  BUILTIN_SKILLS,
  AXE_CORE_DEFAULT_SKILLS,
  SPECIALIST_DEFAULT_SKILLS,
  type SkillDefinition,
  type SkillCategory,
  buildSkillsPromptSection,
} from '@/domain/skills/skillCatalog';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { emitAxeEvent } from '@/infrastructure/events/eventBus';

const CUSTOM_SKILLS_KEY = 'axe_custom_skills';
const ASSIGNMENTS_KEY = 'axe_skill_assignments';

export type SkillAssignmentMap = Record<string, string[]>;

export async function loadCustomSkills(): Promise<SkillDefinition[]> {
  const list = await loadSetting<SkillDefinition[]>(CUSTOM_SKILLS_KEY, []);
  return list.map(s => ({ ...s, source: 'custom' as const }));
}

export async function saveCustomSkills(skills: SkillDefinition[]): Promise<void> {
  await saveSetting(CUSTOM_SKILLS_KEY, skills);
  emitAxeEvent('axe:skills-changed', {});
}

export async function loadAllSkills(): Promise<SkillDefinition[]> {
  const custom = await loadCustomSkills();
  const map = new Map<string, SkillDefinition>();
  for (const s of BUILTIN_SKILLS) map.set(s.id, s);
  for (const s of custom) map.set(s.id, s);
  return Array.from(map.values());
}

export async function loadSkillAssignments(): Promise<SkillAssignmentMap> {
  const stored = await loadSetting<SkillAssignmentMap>(ASSIGNMENTS_KEY, {});
  if (!stored['axe core'] && !stored['axe-core']) {
    stored['axe core'] = [...AXE_CORE_DEFAULT_SKILLS];
  }
  for (const [id, skills] of Object.entries(SPECIALIST_DEFAULT_SKILLS)) {
    if (!stored[id] && !stored[id.replace('-', ' ')]) {
      stored[id] = [...skills];
    }
  }
  return stored;
}

export async function saveSkillAssignments(map: SkillAssignmentMap): Promise<void> {
  await saveSetting(ASSIGNMENTS_KEY, map);
  emitAxeEvent('axe:skills-changed', {});
}

export async function getSkillsForAgent(agentKey: string): Promise<string[]> {
  const map = await loadSkillAssignments();
  const k = agentKey.toLowerCase();
  return map[k] ?? map[k.replace(/_/g, ' ')] ?? map[k.replace(/-/g, ' ')] ?? [];
}

export async function setSkillsForAgent(agentKey: string, skillIds: string[]): Promise<void> {
  const map = await loadSkillAssignments();
  map[agentKey.toLowerCase()] = skillIds;
  await saveSkillAssignments(map);
  emitAxeEvent('axe:skills-changed', { agentKey: agentKey.toLowerCase(), skillIds });
  emitAxeEvent('axe:organization-refresh', { reason: 'skills' });
}

export async function addCustomSkill(input: {
  name: string;
  description: string;
  instruction: string;
  category?: SkillCategory;
}): Promise<SkillDefinition> {
  const id = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `skill-${Date.now()}`;
  const skill: SkillDefinition = {
    id,
    name: input.name.trim(),
    category: input.category ?? 'custom',
    description: input.description.trim() || input.name,
    instruction: input.instruction.trim() || input.description.trim() || input.name,
    source: 'custom',
  };
  const list = await loadCustomSkills();
  if (list.some(s => s.id === id)) {
    await saveCustomSkills(list.map(s => (s.id === id ? skill : s)));
  } else {
    await saveCustomSkills([...list, skill]);
  }
  await mirrorSkillToObsidian(skill).catch(() => {});
  emitAxeEvent('axe:memory-changed', { kind: 'obsidian' });
  return skill;
}

async function mirrorSkillToObsidian(skill: SkillDefinition): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('core_obsidian_notes').upsert(
      {
        title: `Skill: ${skill.name}`,
        content: `# ${skill.name}\n\n${skill.description}\n\n## Instruction\n${skill.instruction}\n\n- id: \`${skill.id}\`\n- category: ${skill.category}\n- source: ${skill.source}\n`,
        tags: ['skill', skill.category, skill.source],
        path: `AXE/Skills/${skill.id}.md`,
      },
      { onConflict: 'path' },
    );
  } catch {
    /* non-fatal */
  }
}

export async function getSkillsPromptForAgent(agentKey: string): Promise<string> {
  const [ids, custom] = await Promise.all([getSkillsForAgent(agentKey), loadCustomSkills()]);
  return buildSkillsPromptSection(ids, custom);
}

export async function listSkillsGrouped(): Promise<Record<string, SkillDefinition[]>> {
  const all = await loadAllSkills();
  const grouped: Record<string, SkillDefinition[]> = {};
  for (const s of all) {
    (grouped[s.category] ??= []).push(s);
  }
  return grouped;
}
