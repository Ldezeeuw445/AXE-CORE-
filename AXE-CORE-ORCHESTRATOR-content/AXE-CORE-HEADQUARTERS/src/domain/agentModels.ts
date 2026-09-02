/**
 * Which model each agent thinks with, chosen rather than compiled in.
 *
 * ## Why per agent and not one setting
 *
 * The agents do different jobs and the right model differs by more than
 * quality. A funnel scoring thirty pairs wants the cheapest thing with a long
 * context; a code editor wants the model that actually writes working code; a
 * trade decision is sometimes worth the most expensive model available for the
 * seconds it takes. One shared choice makes two of those three wrong, and the
 * cost difference between them is a factor of thirty.
 *
 * Intel and Companion additionally have to differ from EACH OTHER. Companion is
 * the second opinion, and a second opinion from the same model on the same data
 * with a differently-worded prompt is the same model agreeing with itself in
 * another voice.
 *
 * ## A preference, never a requirement
 *
 * A choice reorders the cascade; it does not replace it. If the chosen provider
 * has no key, or its quota is gone, the agent falls through every other
 * configured provider and ends at Ollama, which cannot be revoked. An agent
 * going silent because one key ran out would break the pipeline at exactly the
 * moment the pipeline exists to show you where it breaks.
 *
 * `null` means "no preference" and is a real answer — it inherits the shared
 * cascade, which is what every agent did before this existed.
 */
import type { ProviderId } from '@/domain/providers';

export type AgentId =
  | 'research' | 'intel' | 'companion' | 'trader'
  | 'thinktank' | 'code' | 'browser';

export interface ModelChoice {
  provider: ProviderId;
  model: string;
}

export interface AgentSpec {
  id: AgentId;
  label: string;
  /** What this agent is for, so a choice can be made without reading code. */
  what: string;
  /** What matters when picking for it. */
  wants: string;
  /** Shipped default, used until something is chosen. */
  fallback: ModelChoice | null;
}

/**
 * The agents worth choosing a model for, and what each is optimising for.
 *
 * The `wants` line is the point of this table: a dropdown of 417 model names
 * with no guidance is a worse interface than no dropdown, and the reason to
 * pick a slow expensive model for one agent and a fast cheap one for another
 * is not visible from the names.
 */
export const AGENT_SPECS: AgentSpec[] = [
  {
    id: 'research', label: 'AXE Research', what: 'Finds the thesis',
    wants: 'Reasoning over long, messy input. Runs once per symbol, so cost per call matters less than depth.',
    fallback: null,
  },
  {
    id: 'intel', label: 'AXE Intel', what: 'Adds what the feeds know',
    wants: 'Cheap and fast — it summarises flow data every cycle, for every symbol.',
    fallback: { provider: 'google', model: 'gemini-3.5-flash' },
  },
  {
    id: 'companion', label: 'AXE Companion', what: 'Second opinion, with levels',
    wants: 'A DIFFERENT family from Intel. Same model twice is one opinion wearing two hats.',
    fallback: { provider: 'openai', model: 'gpt-4o-mini' },
  },
  {
    id: 'trader', label: 'AXE Trader', what: 'Places the trade',
    wants: 'The decision that costs money. Worth a frontier model for the seconds it runs.',
    fallback: null,
  },
  {
    id: 'thinktank', label: 'ThinkTank', what: 'Thinks a problem through, and builds',
    wants: 'Deep reasoning AND working code — it is asked to design and then to write.',
    fallback: null,
  },
  {
    id: 'code', label: 'Code editor', what: 'Writes and edits the codebase',
    wants: 'Code quality above all, and a context long enough to hold real files.',
    fallback: null,
  },
  {
    id: 'browser', label: 'Browser agent', what: 'Reads pages and acts on them',
    wants: 'Cheap and long-context — pages are large and mostly boilerplate.',
    fallback: null,
  },
];

export function agentSpec(id: AgentId): AgentSpec | undefined {
  return AGENT_SPECS.find(a => a.id === id);
}

/**
 * The choice in force for an agent: what was picked, else the shipped default.
 *
 * Returns null when neither exists, which the caller reads as "use the shared
 * cascade unchanged".
 */
export function resolveChoice(
  id: AgentId,
  chosen: Partial<Record<AgentId, ModelChoice | null>> | null | undefined,
): ModelChoice | null {
  const picked = chosen?.[id];
  if (picked === null) return null;          // explicitly cleared
  if (picked?.provider && picked.model) return picked;
  return agentSpec(id)?.fallback ?? null;
}

/**
 * Whether two agents would think with the same model.
 *
 * Only interesting for the pair that exists to disagree — the UI uses it to say
 * so rather than to prevent it, because there are days when you genuinely want
 * both lanes on the model that is working.
 */
export function sameModel(a: ModelChoice | null, b: ModelChoice | null): boolean {
  if (!a || !b) return false;
  return a.provider === b.provider && a.model === b.model;
}
