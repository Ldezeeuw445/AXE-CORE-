/**
 * Custom (user-added) LLM providers — the "Add Provider" form in Settings.
 * Storage-only module (localStorage, synced to Supabase) so it can be read
 * from anywhere, including llmGateway.ts's dispatch code, without depending
 * on SettingsPage's React state.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';

export const CUSTOM_PROVIDERS_KEY = 'axe_custom_providers';

export interface CustomProvider {
  id: string;
  name: string;
  accent: string;
  baseUrl: string;
  defaultModel: string;
  needsKey: boolean;
  format: 'openai' | 'anthropic' | 'google';
}

export function loadCustomProviders(): CustomProvider[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PROVIDERS_KEY) ?? '[]'); } catch { return []; }
}

export function saveCustomProviders(list: CustomProvider[]) {
  localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(list));
  void saveSetting(CUSTOM_PROVIDERS_KEY, list);
}

export function findCustomProvider(id: string): CustomProvider | undefined {
  return loadCustomProviders().find(p => p.id === id);
}
