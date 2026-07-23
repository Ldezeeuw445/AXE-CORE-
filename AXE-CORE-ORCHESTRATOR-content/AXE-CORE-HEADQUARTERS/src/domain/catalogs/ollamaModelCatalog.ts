export interface OllamaModelCatalogEntry {
  name: string;
  displayName: string;
  category: 'code' | 'general' | 'analysis' | 'lightweight';
  description: string;
  priority: number;
}

// These names match the models actually pulled on the VPS (`ollama list`), so
// the capability router below reaches the right one by exact name. If you pull
// a new model, add it here with its exact `ollama list` NAME (tag included).
export const OLLAMA_MODEL_CATALOG: OllamaModelCatalogEntry[] = [
  {
    name: 'hermes3:8b',
    displayName: 'Hermes 3',
    category: 'general',
    description: 'Nous Hermes 3 — sterke lokale reasoning & tool-use',
    priority: 1,
  },
  {
    name: 'qwen2.5-coder:7b',
    displayName: 'Qwen2.5-Coder 7B',
    category: 'code',
    description: 'Code schrijven, refactors, debugging (primair)',
    priority: 2,
  },
  {
    name: 'deepseek-coder:6.7b',
    displayName: 'DeepSeek-Coder 6.7B',
    category: 'code',
    description: 'Programmeren, tweede code-model',
    priority: 3,
  },
  {
    name: 'llama3.1:8b',
    displayName: 'Llama 3.1 8B',
    category: 'general',
    description: 'Algemene agent taken, planning',
    priority: 4,
  },
  {
    name: 'llama3:latest',
    displayName: 'Llama 3',
    category: 'general',
    description: 'Algemene assistentie',
    priority: 5,
  },
  {
    name: 'mistral:latest',
    displayName: 'Mistral',
    category: 'lightweight',
    description: 'Lichtgewicht lokale agent',
    priority: 6,
  },
  {
    name: 'llama3.2:3b',
    displayName: 'Llama 3.2 3B',
    category: 'lightweight',
    description: 'Snelste lokale model (klein)',
    priority: 7,
  },
];

// Per-capability preference order, using the exact pulled model names.
// Coders lead code; Hermes leads reasoning/analysis/privacy; the small 3B
// leads "fast". Any installed model not named here falls through in place,
// so this only sharpens routing, never blocks it.
const OLLAMA_CAPABILITY_PRIORITIES: Record<string, string[]> = {
  code:      ['qwen2.5-coder:7b', 'deepseek-coder:6.7b', 'hermes3:8b', 'llama3.1:8b', 'llama3:latest', 'mistral:latest', 'llama3.2:3b'],
  analysis:  ['hermes3:8b', 'llama3.1:8b', 'llama3:latest', 'qwen2.5-coder:7b', 'mistral:latest', 'deepseek-coder:6.7b', 'llama3.2:3b'],
  reasoning: ['hermes3:8b', 'llama3.1:8b', 'llama3:latest', 'qwen2.5-coder:7b', 'mistral:latest', 'deepseek-coder:6.7b', 'llama3.2:3b'],
  creative:  ['hermes3:8b', 'llama3:latest', 'llama3.1:8b', 'mistral:latest', 'llama3.2:3b', 'qwen2.5-coder:7b', 'deepseek-coder:6.7b'],
  fast:      ['llama3.2:3b', 'mistral:latest', 'llama3.1:8b', 'hermes3:8b', 'qwen2.5-coder:7b', 'llama3:latest', 'deepseek-coder:6.7b'],
  privacy:   ['hermes3:8b', 'llama3.1:8b', 'mistral:latest', 'llama3.2:3b', 'qwen2.5-coder:7b', 'llama3:latest', 'deepseek-coder:6.7b'],
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
