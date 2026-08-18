export interface OllamaModelCatalogEntry {
  name: string;
  displayName: string;
  category: 'code' | 'general' | 'analysis' | 'lightweight';
  description: string;
  priority: number;
}

// These names match the models actually pulled on the Ollama host
// (`ollama list` on the Hetzner VPS — see infra/README or ARCHITECTURE.md),
// so the capability router below reaches the right one by exact name. If you
// pull a new model, add it here with its exact `ollama list` NAME (tag
// included).
//
// Both gemma4 (~7.2GB smallest tag) and llama3.1:8b — with or without a
// capped context (tried both, live, 2026-08-18) — OOM-kill on this box's
// 7.7GB RAM; confirmed via dmesg, the ~6.5GB resident cost is the 8B-class
// model weights themselves, not KV cache. Nothing at the 8B tier stays up
// here right now. gemma3:4b (3.3GB) is the largest model that reliably does,
// so it now covers both "fast" and "general reasoning" duty below.
export const OLLAMA_MODEL_CATALOG: OllamaModelCatalogEntry[] = [
  {
    name: 'gemma3:4b',
    displayName: 'Gemma 3 4B',
    category: 'general',
    description: 'Snel, gratis, lokaal — vervangt Gemini voor snelle antwoorden',
    priority: 1,
  },
  {
    name: 'deepseek-coder:6.7b',
    displayName: 'DeepSeek-Coder 6.7B',
    category: 'code',
    description: 'Code schrijven, refactors, debugging (primair)',
    priority: 2,
  },
  {
    name: 'llama3:latest',
    displayName: 'Llama 3',
    category: 'general',
    description: 'Algemene assistentie',
    priority: 3,
  },
  {
    name: 'mistral:latest',
    displayName: 'Mistral',
    category: 'lightweight',
    description: 'Lichtgewicht lokale agent',
    priority: 4,
  },
];

// Per-capability preference order, using the exact pulled model names.
// The coder leads code; Gemma leads everything else (fast + general
// reasoning/analysis/privacy, now that no 8B model stays up on this box).
// Any installed model not named here falls through in place, so this only
// sharpens routing, never blocks it.
const OLLAMA_CAPABILITY_PRIORITIES: Record<string, string[]> = {
  code:      ['deepseek-coder:6.7b', 'gemma3:4b', 'llama3:latest', 'mistral:latest'],
  analysis:  ['gemma3:4b', 'llama3:latest', 'mistral:latest', 'deepseek-coder:6.7b'],
  reasoning: ['gemma3:4b', 'llama3:latest', 'mistral:latest', 'deepseek-coder:6.7b'],
  creative:  ['llama3:latest', 'gemma3:4b', 'mistral:latest', 'deepseek-coder:6.7b'],
  fast:      ['gemma3:4b', 'mistral:latest', 'llama3:latest', 'deepseek-coder:6.7b'],
  privacy:   ['gemma3:4b', 'mistral:latest', 'llama3:latest', 'deepseek-coder:6.7b'],
};

export function getDefaultOllamaModelNames(): string[] {
  return [...OLLAMA_MODEL_CATALOG]
    .sort((a, b) => a.priority - b.priority)
    .map(m => m.name);
}

export function sortOllamaModelsForCapability(models: string[], capability?: string): string[] {
  const preferred = capability ? OLLAMA_CAPABILITY_PRIORITIES[capability] ?? [] : [];
  const remaining = [...models];
  const ordered: string[] = [];

  for (const name of preferred) {
    const idx = remaining.indexOf(name);
    if (idx >= 0) {
      ordered.push(name);
      remaining.splice(idx, 1);
    }
  }

  ordered.push(...remaining);
  return ordered;
}
