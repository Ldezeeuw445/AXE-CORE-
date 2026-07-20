/**
 * infrastructure/llm/slotResolver.ts
 *
 * Resolves configured provider credentials ("key slots") from persisted
 * connection settings + env-var defaults. This is the only place that knows
 * how provider connections are stored; the routing policy and gateway just
 * receive ready-to-use KeySlot values.
 */

import type { KeySlot, ProviderId } from '@/core/llm/types';
import { ENV_KEYS, PROVIDERS, isKeyOptional } from '@/core/llm/providers';
import { normalizeProviderBaseUrl } from '@/core/llm/baseUrls';
import { readJSON } from '@/infrastructure/storage/localStore';
import { getStoredLlmModelRegistry } from '@/services/llmModelRegistryService';
import { getDefaultOllamaModelNames, sortOllamaModelsForCapability } from '@/services/ollamaModelCatalog';

const CONNECTIONS_KEY = 'axe_llm_connections';

interface StoredConnection { key?: string; model?: string; models?: string[]; baseUrl?: string }

function readConnections(): Record<string, StoredConnection | undefined> {
  return readJSON<Record<string, StoredConnection | undefined>>(CONNECTIONS_KEY, {});
}

/** Resolve a single provider's slot, or null when it isn't usable. */
export function getProviderKeySlot(providerId: string): KeySlot | null {
  try {
    const conn = readConnections()[providerId];
    const cfg = PROVIDERS.find(p => p.id === providerId);
    const key = conn?.key || (providerId !== 'ollama' ? (ENV_KEYS[providerId] ?? '') : '');
    const baseUrl = normalizeProviderBaseUrl(providerId as ProviderId, conn?.baseUrl || cfg?.baseUrl);
    if (isKeyOptional(providerId) && providerId !== 'ollama' && !baseUrl) return null;
    if (!isKeyOptional(providerId) && !key) return null;
    return { provider: providerId as ProviderId, key, model: conn?.model || cfg?.defaultModel, baseUrl };
  } catch { return null; }
}

/** Ollama exposes one slot per installed model (cloud models sorted last). */
export function getOllamaKeySlots(): KeySlot[] {
  try {
    const ollama = readConnections()['ollama'];
    const cfg = PROVIDERS.find(p => p.id === 'ollama')!;
    const baseUrl = normalizeProviderBaseUrl('ollama', ollama?.baseUrl || cfg.baseUrl);
    const models: string[] = ollama?.models?.length ? ollama.models : (ollama?.model ? [ollama.model] : getStoredLlmModelRegistry().map(m => m.name).filter(Boolean) || getDefaultOllamaModelNames());
    const sorted = sortOllamaModelsForCapability([...models.filter(m => !m.endsWith(':cloud')), ...models.filter(m => m.endsWith(':cloud'))]);
    return sorted.filter(Boolean).map(model => ({ provider: 'ollama' as ProviderId, key: '', model, baseUrl }));
  } catch { return []; }
}

/** Every currently usable slot across all providers, in registry order. */
export function getAllConfiguredSlots(): KeySlot[] {
  const all: KeySlot[] = [];
  for (const p of PROVIDERS) {
    if (p.id === 'ollama') all.push(...getOllamaKeySlots());
    else { const s = getProviderKeySlot(p.id); if (s) all.push(s); }
  }
  return all;
}
