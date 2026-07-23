export interface OllamaModelCatalogEntry {
  name: string;
  displayName: string;
  category: 'code' | 'general' | 'analysis' | 'lightweight';
  description: string;
  priority: number;
}

export const OLLAMA_MODEL_CATALOG: OllamaModelCatalogEntry[] = [
  {
    // Nous Hermes 3 (Llama 3.1 8B) — strong local reasoning + tool-use, fits
    // the 8GB VPS. Pull with `ollama pull hermes3:8b` so the name matches.
    name: 'hermes3:8b',
    displayName: 'Hermes 3',
    category: 'general',
    description: 'Nous Hermes 3 — sterke lokale reasoning & tool-use',
    priority: 1,
  },
  {
    name: 'qwen2.5-coder',
    displayName: 'Qwen2.5-Coder',
    category: 'code',
    description: 'Code schrijven, refactors, debugging',
    priority: 2,
  },
  {
    name: 'deepseek-coder-v2',
    displayName: 'DeepSeek-Coder-V2',
    category: 'code',
    description: 'Grote codebases, programmeren',
    priority: 3,
  },
  {
    name: 'llama3.1:8b',
    displayName: 'Llama 3.1',
    category: 'general',
    description: 'Algemene agent taken, planning',
    priority: 4,
  },
  {
    name: 'mistral:7b',
    displayName: 'Mistral 7B',
    category: 'lightweight',
    description: 'Lichtgewicht lokale agents',
    priority: 5,
  },
  {
    name: 'gemma3:4b',
    displayName: 'Gemma 3',
    category: 'general',
    description: 'Algemene assistentie',
    priority: 6,
  },
];

// Hermes 3 leads reasoning/analysis/privacy (strong general model, fully
// local); coders still lead code. Any installed model not named here just
// falls through in its existing order, so this only helps, never blocks.
const OLLAMA_CAPABILITY_PRIORITIES: Record<string, string[]> = {
  code: ['qwen2.5-coder', 'deepseek-coder-v2', 'hermes3:8b', 'llama3.1:8b', 'mistral:7b', 'gemma3:4b'],
  analysis: ['hermes3:8b', 'llama3.1:8b', 'gemma3:4b', 'mistral:7b', 'qwen2.5-coder', 'deepseek-coder-v2'],
  reasoning: ['hermes3:8b', 'llama3.1:8b', 'gemma3:4b', 'mistral:7b', 'qwen2.5-coder', 'deepseek-coder-v2'],
  creative: ['hermes3:8b', 'gemma3:4b', 'llama3.1:8b', 'mistral:7b', 'qwen2.5-coder', 'deepseek-coder-v2'],
  fast: ['mistral:7b', 'llama3.1:8b', 'gemma3:4b', 'hermes3:8b', 'qwen2.5-coder', 'deepseek-coder-v2'],
  privacy: ['hermes3:8b', 'mistral:7b', 'llama3.1:8b', 'gemma3:4b', 'qwen2.5-coder', 'deepseek-coder-v2'],
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
