/**
 * eveSkills.ts
 * ------------------------------------------------------------------
 * Reads the active EVE skills for a given provider from localStorage
 * and returns them as a system-prompt supplement.
 *
 * Called before every callProvider() invocation so that skills
 * configured in EveFramework automatically shape every LLM call.
 */

interface EveSkill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  icon: string;
  active: boolean;
}

interface EveProvider {
  id: string;
  name: string;
  model: string;
  accent: string;
  connected: boolean;
  skills: EveSkill[];
  expanded: boolean;
}

const LS_KEY = 'axe_eve_providers';

/**
 * Returns the active EVE skills for a provider formatted as a
 * system-prompt section, or '' if none are configured.
 */
export function getEveSystemPromptSupplement(providerId: string): string {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return '';
    const providers: EveProvider[] = JSON.parse(raw);
    const provider = providers.find(p => p.id === providerId);
    if (!provider?.connected) return '';
    const active = provider.skills.filter(s => s.active);
    if (active.length === 0) return '';
    return (
      `\n\n## EVE Skills (${provider.name})\n` +
      active.map(s => `- **${s.name}**: ${s.prompt}`).join('\n')
    );
  } catch {
    return '';
  }
}

/**
 * Returns all active skills across all providers, keyed by providerId.
 * Useful for building a merged overview in the UI.
 */
export function getAllEveSkills(): Record<string, EveSkill[]> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const providers: EveProvider[] = JSON.parse(raw);
    const result: Record<string, EveSkill[]> = {};
    for (const p of providers) {
      const active = p.skills.filter(s => s.active);
      if (active.length > 0) result[p.id] = active;
    }
    return result;
  } catch {
    return {};
  }
}
