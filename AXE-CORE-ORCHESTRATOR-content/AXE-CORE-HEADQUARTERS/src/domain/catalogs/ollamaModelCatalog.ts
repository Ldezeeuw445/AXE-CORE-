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
export const OLLAMA_MODEL_CATALOG: OllamaModelCatalogEntry[] = [
  {
    name: 'gemma4:latest',
    displayName: 'Gemma 4',
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
    name: 'llama3.1:8b',
    displayName: 'Llama 3.1 8B',
    category: 'general',
    description: 'Algemene agent taken, planning',
    priority: 3,
  },
  {
    name: 'llama3:latest',
    displayName: 'Llama 3',
    category: 'general',
    description: 'Algemene assistentie',
    priority: 4,
  },
  {
    name: 'mistral:latest',
    displayName: 'Mistral',
    category: 'lightweight',
    description: 'Lichtgewicht lokale agent',
    priority: 5,
  },
];

// Per-capability preference order, using the exact pulled model names.
// The coder leads code; Llama 3.1 leads reasoning/analysis/privacy; Gemma
// leads "fast". Any installed model not named here falls through in place,
// so this only sharpens routing, never blocks it.
const OLLAMA_CAPABILITY_PRIORITIES: Record<string, string[]> = {
  code:      ['deepseek-coder:6.7b', 'llama3.1:8b', 'llama3:latest', 'mistral:latest', 'gemma4:latest'],
  analysis:  ['llama3.1:8b', 'llama3:latest', 'mistral:latest', 'deepseek-coder:6.7b', 'gemma4:latest'],
  reasoning: ['llama3.1:8b', 'llama3:latest', 'mistral:latest', 'deepseek-coder:6.7b', 'gemma4:latest'],
  creative:  ['llama3:latest', 'llama3.1:8b', 'gemma4:latest', 'mistral:latest', 'deepseek-coder:6.7b'],
  fast:      ['gemma4:latest', 'mistral:latest', 'llama3.1:8b', 'llama3:latest', 'deepseek-coder:6.7b'],
  privacy:   ['llama3.1:8b', 'mistral:latest', 'gemma4:latest', 'llama3:latest', 'deepseek-coder:6.7b'],
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
