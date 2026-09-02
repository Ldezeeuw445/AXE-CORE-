/**
 * Which model each desk agent thinks with.
 *
 * Two different families on purpose. Intel and Companion exist to disagree —
 * Companion is the second opinion, and a second opinion from the same model,
 * on the same data, with a differently-worded prompt is not a second opinion.
 * It is the same model agreeing with itself in another voice.
 *
 * Both are the cheap tier of a frontier family, which is the combination
 * asked for: gemini-3.5-flash and gpt-4o-mini are inexpensive per token and
 * still capable enough to read flow data and say something useful about it.
 *
 * The preference is a preference, not a requirement. Each falls back through
 * every other configured provider, ending at Ollama — which cannot be revoked
 * or run out of quota. A lane going quiet because one key is exhausted would
 * break the pipeline at exactly the moment the pipeline is meant to show you
 * where it breaks.
 */
import { PROVIDERS, type KeySlot, type ProviderId } from '@/domain/providers';
import { resolveChoice, type AgentId, type ModelChoice } from '@/domain/agentModels';

/**
 * The provider keys Luka has configured, in fallback order.
 *
 * application/ does not import the presentation-layer voiceStore, so this
 * reads the same localStorage keys it persists to — the pattern already used
 * by toolRegistry.browser and conversationReviewService. Kept here rather than
 * copied a third time.
 */
function loadKeySlot(name: string): KeySlot | null {
  try {
    const raw = localStorage.getItem(name);
    return raw ? (JSON.parse(raw) as KeySlot) : null;
  } catch {
    return null;
  }
}

export function loadConfiguredSlots(): KeySlot[] {
  return [
    loadKeySlot('axe_slot_primary'),
    loadKeySlot('axe_slot_fallback1'),
    loadKeySlot('axe_slot_fallback2'),
    loadKeySlot('axe_slot_fallback3'),
  ].filter((s): s is KeySlot => !!s?.key);
}

/**
 * What each agent is set to right now, read from what was chosen.
 *
 * This used to be a hardcoded pair — intel and companion, two constants, no way
 * to change either without a build. The defaults still live in
 * domain/agentModels.ts; this only adds the layer that lets a choice override
 * them, and reads it from the same durable config the Settings screen writes.
 *
 * Synchronous on purpose: it is called inside the cycle, per lane, and an await
 * here would put a network round-trip between the desk and every thought it
 * has. The durable copy is mirrored to localStorage on save, which is what this
 * reads.
 */
export const AGENT_MODELS_KEY = 'axe_agent_models';

export function loadAgentModelChoices(): Partial<Record<AgentId, ModelChoice | null>> {
  try {
    const raw = localStorage.getItem(AGENT_MODELS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<AgentId, ModelChoice | null>>) : {};
  } catch {
    return {};
  }
}

/** The model an agent should think with, or null to leave the cascade alone. */
export function modelForAgent(id: AgentId): ModelChoice | null {
  return resolveChoice(id, loadAgentModelChoices());
}

/**
 * Kept so existing call sites keep working, now backed by the choice.
 *
 * Reads at call time rather than at module load: a choice made in Settings has
 * to take effect on the next cycle, not on the next app restart.
 */
export const DESK_AGENT_MODELS: Record<'intel' | 'companion', { provider: ProviderId; model: string }> = {
  get intel() { return modelForAgent('intel') ?? { provider: 'google' as ProviderId, model: 'gemini-3.5-flash' }; },
  get companion() { return modelForAgent('companion') ?? { provider: 'openai' as ProviderId, model: 'gpt-4o-mini' }; },
};

/**
 * Order the configured slots so the agent's own model is tried first.
 *
 * Returns every slot, reordered — never a filtered list. Filtering would make
 * "my provider has no key" indistinguishable from "no providers at all", and
 * only one of those is worth telling the user about.
 */
export function slotsPreferring(
  all: KeySlot[],
  want: { provider: ProviderId; model: string },
): KeySlot[] {
  const preferred = all.find(s => s.provider === want.provider);
  const rest = all.filter(s => s.provider !== want.provider);
  if (!preferred) return rest;
  // The model is overridden even when the slot carries another: the agent's
  // choice is about cost and character, and inheriting whatever the chat tab
  // last selected would silently undo it.
  return [{ ...preferred, model: want.model }, ...rest];
}

/** Human label for the lane header, so you can see what it thought with. */
export function modelLabel(want: { provider: ProviderId; model: string }): string {
  const cfg = PROVIDERS.find(p => p.id === want.provider);
  return `${cfg?.name ?? want.provider} · ${want.model}`;
}
