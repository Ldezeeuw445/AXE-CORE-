export interface OllamaModelCatalogEntry {
  name: string;
  displayName: string;
  category: 'code' | 'general' | 'analysis' | 'lightweight';
  description: string;
  priority: number;
}

export const OLLAMA_MODEL_CATALOG: OllamaModelCatalogEntry[] = [
  {
    name: 'qwen2.5-coder',
    displayName: 'Qwen2.5-Coder',
    category: 'code',
    description: 'Code schrijven, refactors, debugging',
    priority: 1,
  },
  {
    name: 'deepseek-coder-v2',
    displayName: 'DeepSeek-Coder-V2',
    category: 'code',
    description: 'Grote codebases, programmeren',
    priority: 2,
  },
  {
    name: 'llama3.1:8b',
    displayName: 'Llama 3.1',
    category: 'general',
    description: 'Algemene agent taken, planning',
    priority: 3,
  },
  {
    name: 'mistral:7b',
    displayName: 'Mistral 7B',
    category: 'lightweight',
    description: 'Lichtgewicht lokale agents',
    priority: 4,
  },
  {
    name: 'gemma3:4b',
    displayName: 'Gemma 3',
    category: 'general',
    description: 'Algemene assistentie',
    priority: 5,
  },
];

export function getDefaultOllamaModelNames(): string[] {
  return [...OLLAMA_MODEL_CATALOG]
    .sort((a, b) => a.priority - b.priority)
    .map(m => m.name);
}
