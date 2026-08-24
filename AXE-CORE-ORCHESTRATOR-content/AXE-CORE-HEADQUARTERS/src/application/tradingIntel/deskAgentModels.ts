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

export const DESK_AGENT_MODELS: Record<'intel' | 'companion', { provider: ProviderId; model: string }> = {
  intel:     { provider: 'google', model: 'gemini-3.5-flash' },
  companion: { provider: 'openai', model: 'gpt-4o-mini' },
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
