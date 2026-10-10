export interface OllamaModelCatalogEntry {
  name: string;
  displayName: string;
  category: 'code' | 'general' | 'analysis' | 'lightweight';
  description: string;
  priority: number;
}

// These names match the models actually pulled on the Ollama host: the modelbox (Strato, 8 cores, 16 GB,
// ollama.axecompanion.com), live since 4 Oct 2026. Run `ollama list` there and use the exact NAME, tag
// included, so the capability router below reaches the right one.
//
// Until 10 Oct this list described the old 7.7 GB Hetzner box ("no 8B model stays up", gemma3:4b first).
// gemma3:4b does not exist on the modelbox, so the default registry offered a model that answers 404.
// The old names stay at the tail: the Mac mini's own Ollama still has some of them.
export const OLLAMA_MODEL_CATALOG: OllamaModelCatalogEntry[] = [
  {
    name: 'llama3.1:8b',
    displayName: 'Llama 3.1 8B',
    category: 'general',
    description: 'Algemeen model voor crews, analyse en gesprek; het model dat de crews standaard krijgen',
    priority: 1,
  },
  {
    name: 'qwen2.5-coder:7b',
    displayName: 'Qwen2.5-Coder 7B',
    category: 'code',
    description: 'Code schrijven en repareren, snel (primair voor code)',
    priority: 2,
  },
  {
    name: 'hermes3:8b',
    displayName: 'Hermes 3 8B',
    category: 'general',
    description: 'Gesprek, rollen en agent-achtig werk; Nederlands werkt goed',
    priority: 3,
  },
  {
    name: 'deepseek-coder-v2:16b',
    displayName: 'DeepSeek-Coder V2 16B',
    category: 'code',
    description: 'Zwaardere code en reviews; trager, gebruik het voor de lastige gevallen',
    priority: 4,
  },
  {
    name: 'qwen2.5-coder:14b',
    displayName: 'Qwen2.5-Coder 14B',
    category: 'code',
    description: 'Code met meer redeneerruimte dan de 7B',
    priority: 5,
  },
  {
    name: 'llama3.2:3b',
    displayName: 'Llama 3.2 3B',
    category: 'lightweight',
    description: 'Snelle korte antwoorden',
    priority: 6,
  },
  {
    name: 'mistral:latest',
    displayName: 'Mistral',
    category: 'lightweight',
    description: 'Lichtgewicht algemeen model',
    priority: 7,
  },
  {
    name: 'llama3:latest',
    displayName: 'Llama 3',
    category: 'general',
    description: 'Algemene assistentie (ouder dan 3.1)',
    priority: 8,
  },
  {
    name: 'deepseek-coder:6.7b',
    displayName: 'DeepSeek-Coder 6.7B',
    category: 'code',
    description: 'Code, lichter dan de V2',
    priority: 9,
  },
  {
    name: 'gemma3:4b',
    displayName: 'Gemma 3 4B',
    category: 'general',
    description: 'Snel en klein; staat op de Mac mini, niet op de modelbox',
    priority: 10,
  },
];

// Per-capability preference order, using the exact pulled model names.
// Any installed model not named here falls through in place, so this only sharpens routing, never blocks it.
const OLLAMA_CAPABILITY_PRIORITIES: Record<string, string[]> = {
  code:      ['qwen2.5-coder:7b', 'deepseek-coder-v2:16b', 'qwen2.5-coder:14b', 'deepseek-coder:6.7b', 'llama3.1:8b'],
  analysis:  ['llama3.1:8b', 'hermes3:8b', 'qwen2.5-coder:14b', 'mistral:latest', 'llama3:latest', 'gemma3:4b'],
  reasoning: ['llama3.1:8b', 'deepseek-coder-v2:16b', 'hermes3:8b', 'mistral:latest', 'llama3:latest', 'gemma3:4b'],
  creative:  ['hermes3:8b', 'llama3.1:8b', 'mistral:latest', 'llama3:latest', 'gemma3:4b'],
  fast:      ['llama3.2:3b', 'gemma3:4b', 'llama3.1:8b', 'mistral:latest', 'llama3:latest'],
  privacy:   ['llama3.1:8b', 'hermes3:8b', 'llama3.2:3b', 'gemma3:4b', 'mistral:latest'],
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
