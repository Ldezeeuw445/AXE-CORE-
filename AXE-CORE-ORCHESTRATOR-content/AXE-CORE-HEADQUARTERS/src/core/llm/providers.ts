/**
 * core/llm/providers.ts
 *
 * The canonical provider registry: which providers exist, their wire format,
 * default models, env-var API keys, and which ones run through the VPS agent
 * bridge. This is pure configuration — no I/O, no framework imports.
 */

import type { ProviderCfg, ProviderId } from './types';
import { OLLAMA_DEFAULT_URL } from './baseUrls';

export const NO_KEY_PROVIDER_IDS = new Set<ProviderId>([
  'ollama', 'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'hermes',
]);

/** Providers that are executed via the VPS agent bridge instead of a chat API. */
export const VPS_BRIDGE_PROVIDER_IDS = new Set<ProviderId>([
  'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'hermes',
]);

const OPENHANDS_BASE_URL = import.meta.env.VITE_OPENHANDS_URL ?? '/proxy/openhands';
const OPENJARVIS_BASE_URL = import.meta.env.VITE_OPENJARVIS_URL ?? '/proxy/openjarvis';
const OPENCLAW_BASE_URL = import.meta.env.VITE_OPENCLAW_URL ?? '/proxy/openclaw';
const KILOCODE_BASE_URL = import.meta.env.VITE_KILOCODE_URL ?? '/proxy/kilocode';
const CREWAI_BASE_URL = import.meta.env.VITE_CREWAI_URL ?? '/proxy/crewai';
const HERMES_BASE_URL = import.meta.env.VITE_HERMES_URL ?? '/proxy/hermes';
const GROQ_BASE_URL = import.meta.env.VITE_GROQ_URL ?? 'https://api.groq.com/openai/v1';

export const PROVIDERS: ProviderCfg[] = [
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-5', format: 'anthropic', needsKey: true },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', defaultModel: 'gpt-4o', format: 'openai', needsKey: true },
  { id: 'google', name: 'Google', baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-flash-lite-latest', format: 'google', needsKey: true },
  { id: 'xai', name: 'Grok', baseUrl: 'https://api.x.ai', defaultModel: 'grok-4.3', format: 'openai', needsKey: true },
  { id: 'groq', name: 'Groq', baseUrl: GROQ_BASE_URL, defaultModel: 'qwen/qwen3-32b', format: 'openai', needsKey: true },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', defaultModel: 'google/gemma-3-4b-it:free', format: 'openai', needsKey: true },
  { id: 'krater', name: 'Krater', baseUrl: 'https://api.krater.ai', defaultModel: 'openai/gpt-4o-mini', format: 'openai', needsKey: true },
  { id: 'ollama', name: 'Ollama', baseUrl: OLLAMA_DEFAULT_URL, defaultModel: 'llama3.1:8b', format: 'openai', needsKey: false },
  { id: 'openhands', name: 'OpenHands', baseUrl: OPENHANDS_BASE_URL, defaultModel: 'claude-sonnet-4-5', format: 'openai', needsKey: false },
  { id: 'openjarvis', name: 'OpenJarvis', baseUrl: OPENJARVIS_BASE_URL, defaultModel: 'gpt-4o-mini', format: 'openai', needsKey: false },
  { id: 'openclaw', name: 'OpenClaw', baseUrl: OPENCLAW_BASE_URL, defaultModel: 'gpt-4o-mini', format: 'openai', needsKey: false },
  { id: 'kilocode', name: 'Kilo Code', baseUrl: KILOCODE_BASE_URL, defaultModel: 'gpt-4o-mini', format: 'openai', needsKey: false },
  { id: 'crewai', name: 'CrewAI', baseUrl: CREWAI_BASE_URL, defaultModel: 'gpt-4o-mini', format: 'openai', needsKey: false },
  { id: 'hermes', name: 'Hermes Agent', baseUrl: HERMES_BASE_URL, defaultModel: 'gpt-4o-mini', format: 'openai', needsKey: false },
];

export const ENV_KEYS: Partial<Record<string, string>> = {
  google: import.meta.env.VITE_GEMINI_API_KEY ?? '',
  xai: import.meta.env.VITE_XAI_API_KEY ?? '',
  openrouter: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
  openai: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  anthropic: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
  groq: import.meta.env.VITE_GROQ_API_KEY ?? '',
  krater: import.meta.env.VITE_KRATER_API_KEY ?? '',
};

export function getProviderCfg(id: string): ProviderCfg | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isKeyOptional(id: string): boolean {
  return NO_KEY_PROVIDER_IDS.has(id as ProviderId);
}

/** Stored model name → current canonical name, per provider. Applied when
 *  reading persisted slots so stale localStorage values keep working. */
const MODEL_MIGRATIONS: Record<string, Record<string, string>> = {
  google: {
    'gemini-1.5-flash': 'gemini-flash-lite-latest',
    'gemini-1.5-pro': 'gemini-flash-lite-latest',
    'gemini-1.0-pro': 'gemini-flash-lite-latest',
    'gemini-2.0-flash-lite': 'gemini-flash-lite-latest',
  },
  anthropic: {
    'claude-3-5-sonnet-20241022': 'claude-sonnet-5',
    'claude-3-5-haiku-20241022': 'claude-sonnet-5',
  },
  openrouter: {
    'google/gemma-3-4b-it:free': 'meta-llama/llama-3.1-8b-instruct:free',
  },
  openai: {
    'gpt-4o': 'gpt-4o-mini',
  },
};

export function migrateModel(providerId: string, model: string | undefined): string | undefined {
  if (!model) return model;
  return MODEL_MIGRATIONS[providerId]?.[model] ?? model;
}
