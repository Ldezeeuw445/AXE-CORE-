import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { saveSetting, loadSetting } from '@/infrastructure/persistence/userSettingsService';
import { OLLAMA_MODEL_CATALOG } from '@/domain/catalogs/ollamaModelCatalog';

export interface LlmModelRegistryEntry {
  name: string;
  displayName: string;
  provider: string;
  category: 'code' | 'general' | 'analysis' | 'lightweight';
  description: string;
  priority: number;
  enabled: boolean;
}

type CoreLlmModelRow = {
  name: string;
  display_name: string;
  provider: string | null;
  category: string | null;
  description: string | null;
  priority: number | null;
  enabled: boolean | null;
  metadata: Record<string, unknown> | null;
};

const DEFAULT_LLM_MODELS: LlmModelRegistryEntry[] = OLLAMA_MODEL_CATALOG.map(m => ({
  name: m.name,
  displayName: m.displayName,
  provider: 'ollama',
  category: m.category,
  description: m.description,
  priority: m.priority,
  enabled: true,
}));

function normalizeRow(row: CoreLlmModelRow): LlmModelRegistryEntry {
  const meta = row.metadata ?? {};
  return {
    name: row.name,
    displayName: row.display_name,
    provider: row.provider ?? 'ollama',
    category: (row.category as LlmModelRegistryEntry['category']) ?? 'general',
    description: row.description ?? (typeof meta.description === 'string' ? meta.description : ''),
    priority: row.priority ?? 999,
    enabled: row.enabled ?? true,
  };
}

function toDbRow(model: LlmModelRegistryEntry) {
  return {
    name: model.name,
    display_name: model.displayName,
    provider: model.provider,
    category: model.category,
    description: model.description,
    priority: model.priority,
    enabled: model.enabled,
    metadata: {
      description: model.description,
    },
  };
}

export function getDefaultLlmModelRegistry(): LlmModelRegistryEntry[] {
  return DEFAULT_LLM_MODELS.map(model => ({ ...model }));
}

export function getStoredLlmModelRegistry(): LlmModelRegistryEntry[] {
  try {
    const raw = localStorage.getItem('axe_ollama_model_registry');
    if (!raw) return getDefaultLlmModelRegistry();
    const parsed = JSON.parse(raw) as LlmModelRegistryEntry[];
    return Array.isArray(parsed) && parsed.length ? parsed : getDefaultLlmModelRegistry();
  } catch {
    return getDefaultLlmModelRegistry();
  }
}

export function registryEntriesFromNames(names: string[]): LlmModelRegistryEntry[] {
  return names.map((name, index) => {
    const fallback = DEFAULT_LLM_MODELS.find(m => m.name === name);
    return fallback ?? {
      name,
      displayName: name,
      provider: 'ollama',
      category: 'general',
      description: '',
      priority: index + 100,
      enabled: true,
    };
  });
}

export async function loadLlmModelRegistry(): Promise<LlmModelRegistryEntry[]> {
  const fallback = await loadSetting<LlmModelRegistryEntry[]>('axe_ollama_model_registry', getDefaultLlmModelRegistry());
  const sb = getSupabase();
  if (!sb) return fallback;
  try {
    const { data } = await sb.from('core_llm_models').select('*').eq('enabled', true).order('priority', { ascending: true });
    if (data?.length) {
      const mapped = data.map(row => normalizeRow(row as CoreLlmModelRow));
      localStorage.setItem('axe_ollama_model_registry', JSON.stringify(mapped));
      return mapped;
    }
  } catch {
    // fall back to local cache
  }
  return fallback;
}

export async function saveLlmModelRegistry(models: LlmModelRegistryEntry[]): Promise<void> {
  localStorage.setItem('axe_ollama_model_registry', JSON.stringify(models));
  void saveSetting('axe_ollama_model_registry', models);

  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('core_llm_models').upsert(models.map(toDbRow), { onConflict: 'name' });
  } catch {
    // Ignore, local persistence still succeeded.
  }
}
