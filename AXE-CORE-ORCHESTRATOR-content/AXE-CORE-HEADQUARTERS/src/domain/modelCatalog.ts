/**
 * The models worth offering in a picker, per provider.
 *
 * ## Why a curated list and not the provider's full roster
 *
 * OpenRouter alone lists 417 models. A dropdown of 417 names is a worse
 * interface than no dropdown: nothing in "gpt-5.6-luna-pro" says whether it
 * suits a funnel scoring thirty pairs or a trade decision, and the difference
 * in cost between neighbouring entries is a factor of thirty.
 *
 * So this is a short list per provider, each verified to exist. That last part
 * is not a formality — `stealth/ox-alpha` was added here on the strength of its
 * own documentation, and measured against openrouter.ai/api/v1/models it was
 * absent from all 417 entries. A picker offering a model that does not exist
 * turns a working key into a failing card, which is exactly what it did.
 *
 * The picker also always offers "no preference", which inherits the shared
 * cascade. That is a real answer and usually the right one.
 */
import type { ProviderId } from '@/domain/providers';

export interface CatalogEntry {
  model: string;
  /** What this one is good for, in the fewest words that are still true. */
  note: string;
}

/**
 * Verified against each provider's live roster on 2026-08-27.
 *
 * Keep it short. This list exists to make a choice easy, and a list long enough
 * to need scrolling has stopped doing that.
 */
export const MODEL_CATALOG: Partial<Record<ProviderId, CatalogEntry[]>> = {
  google: [
    { model: 'gemini-3.5-flash', note: 'Fast, cheap, reads images' },
    { model: 'gemini-3-flash-preview', note: 'Newer, still settling' },
    { model: 'gemini-3.1-flash-lite', note: 'Cheapest Gemini' },
    { model: 'gemini-2.5-flash', note: 'Previous generation' },
  ],
  anthropic: [
    { model: 'claude-sonnet-5', note: 'Code and reasoning' },
    { model: 'claude-opus-5-fast', note: 'The heavy one, when it matters' },
  ],
  openai: [
    { model: 'gpt-4o-mini', note: 'Cheap and quick' },
    { model: 'gpt-5.6-luna-pro', note: 'Long context, low price' },
  ],
  groq: [
    { model: 'openai/gpt-oss-120b', note: 'Fast open model' },
    { model: 'openai/gpt-oss-20b', note: 'Faster, smaller' },
    { model: 'groq/compound', note: 'Groq routing' },
  ],
  openrouter: [
    { model: 'openrouter/auto', note: 'Routes per request' },
    { model: 'openai/gpt-5.6-luna-pro', note: '1M context, cheap' },
    { model: 'anthropic/claude-sonnet-5', note: 'Code and reasoning' },
    { model: 'deepseek/deepseek-v4-flash-0731', note: 'Long context, cheapest' },
  ],
  openrouter2: [
    { model: 'openrouter/auto', note: 'Routes per request' },
    { model: 'openai/gpt-5.6-luna-pro', note: '1M context, cheap' },
    { model: 'anthropic/claude-sonnet-5', note: 'Code and reasoning' },
    { model: 'deepseek/deepseek-v4-flash-0731', note: 'Long context, cheapest' },
  ],
  cerebras: [
    { model: 'gpt-oss-120b', note: 'Very fast' },
  ],
  ollama: [
    { model: 'gemma4:latest', note: 'Local, cannot be revoked' },
  ],
};

export function modelsFor(provider: ProviderId): CatalogEntry[] {
  return MODEL_CATALOG[provider] ?? [];
}

/** Every (provider, model) pair on offer, for a flat picker. */
export function catalogPairs(
  providers: readonly ProviderId[],
): Array<{ provider: ProviderId; model: string; note: string }> {
  const out: Array<{ provider: ProviderId; model: string; note: string }> = [];
  for (const p of providers) {
    for (const e of modelsFor(p)) out.push({ provider: p, model: e.model, note: e.note });
  }
  return out;
}
