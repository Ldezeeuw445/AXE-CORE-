/**
 * capabilityService.ts
 * Loads capability → model/agent routing from Supabase core_capabilities table.
 * Falls back to hardcoded config if Supabase is unavailable.
 * Used by the LangGraph orchestrator to make capability routing data-driven instead of hardcoded.
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

export interface CapabilityConfig {
  capability: string;
  display_name: string;
  description: string;
  preferred_provider: string;
  preferred_model: string;
  fallback_provider: string;
  fallback_model: string;
  preferred_agent: string;
  fallback_agent: string;
  execution_mode?: 'read' | 'patch' | 'execute';
  cost_priority: number;
  speed_priority: number;
  quality_priority: number;
  privacy_required: boolean;
  stream_required: boolean;
  keyword_patterns: string[];
  enabled: boolean;
}

export type ExecutionMode = 'read' | 'patch' | 'execute';

// Fallback: hardcoded defaults if Supabase is down
const FALLBACK_CAPABILITIES: CapabilityConfig[] = [
  { capability: 'fast',      display_name: 'Fast',      description: '', preferred_provider: 'google',      preferred_model: 'gemini-2.0-flash',               fallback_provider: 'ollama',     fallback_model: 'mistral:7b',                    preferred_agent: '', fallback_agent: '', execution_mode: 'read',    cost_priority: 80, speed_priority: 90, quality_priority: 40,  privacy_required: false, stream_required: true, keyword_patterns: [], enabled: true },
  { capability: 'code',      display_name: 'Code',      description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'ollama',     fallback_model: 'qwen2.5-coder',                preferred_agent: '', fallback_agent: '', execution_mode: 'patch',   cost_priority: 30, speed_priority: 40, quality_priority: 100, privacy_required: false, stream_required: true, keyword_patterns: ['\\bcode\\b','debug','function','typescript','javascript','python','react','bug'], enabled: true },
  { capability: 'analysis',  display_name: 'Analysis',  description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'ollama',     fallback_model: 'gemma3:4b',                  preferred_agent: '', fallback_agent: '', execution_mode: 'read',    cost_priority: 30, speed_priority: 30, quality_priority: 100, privacy_required: false, stream_required: true, keyword_patterns: ['analys','research','strateg','compare','architect','roadmap'], enabled: true },
  { capability: 'reasoning', display_name: 'Reasoning', description: '', preferred_provider: 'openrouter',  preferred_model: 'openai/gpt-4o',                  fallback_provider: 'ollama',     fallback_model: 'gemma3:4b',                   preferred_agent: '', fallback_agent: '', execution_mode: 'read',    cost_priority: 30, speed_priority: 40, quality_priority: 100, privacy_required: false, stream_required: true, keyword_patterns: ['calculate','bereken','redeneer','what if','why does'], enabled: true },
  { capability: 'privacy',   display_name: 'Privacy',   description: '', preferred_provider: 'ollama',      preferred_model: 'llama3.2',                       fallback_provider: 'ollama',     fallback_model: 'mistral:7b',                  preferred_agent: '', fallback_agent: '', execution_mode: 'read',    cost_priority: 50, speed_priority: 50, quality_priority: 60,  privacy_required: true,  stream_required: true, keyword_patterns: ['password','wachtwoord','private','secret','geheim','bsn','pincode'], enabled: true },
  { capability: 'creative',  display_name: 'Creative',  description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'ollama',     fallback_model: 'gemma3:4b',                   preferred_agent: '', fallback_agent: '', execution_mode: 'read',    cost_priority: 40, speed_priority: 50, quality_priority: 90,  privacy_required: false, stream_required: true, keyword_patterns: ['schrijf','write','brainstorm','creative','campaign'], enabled: true },
  { capability: 'trading',   display_name: 'Trading',   description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'openrouter', fallback_model: 'meta-llama/llama-3.1-8b-instruct:free', preferred_agent: '', fallback_agent: '', execution_mode: 'execute', cost_priority: 50, speed_priority: 60, quality_priority: 90, privacy_required: false, stream_required: true, keyword_patterns: ['trade','market','signal','forex','crypto','stock','risk','leverage'], enabled: true },
  { capability: 'research',  display_name: 'Research',  description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'ollama',     fallback_model: 'gemma3:4b',                  preferred_agent: '', fallback_agent: '', execution_mode: 'read',    cost_priority: 30, speed_priority: 30, quality_priority: 100, privacy_required: false, stream_required: true, keyword_patterns: ['research','zoek op','find out','what is','who is'], enabled: true },
];


const LOCAL_CAP_KEY = 'axe_local_capabilities_v1';
const CUSTOM_AGENTS_KEY = 'axe_custom_agents_v1';
const OVERRIDES_KEY = 'axe_agent_center_overrides_v1';

export function loadLocalCapabilities(): CapabilityConfig[] {
  try {
    const raw = localStorage.getItem(LOCAL_CAP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CapabilityConfig[];
    return Array.isArray(parsed) ? parsed.filter(c => c && c.capability && c.enabled !== false) : [];
  } catch {
    return [];
  }
}

/** Register or update a capability created by THINKTHANKS so chat can route to it. */
export function registerLocalCapability(input: {
  capability: string;
  display_name: string;
  description?: string;
  preferred_agent?: string;
  keyword_patterns?: string[];
  preferred_provider?: string;
  preferred_model?: string;
}): CapabilityConfig {
  const cap: CapabilityConfig = {
    capability: input.capability.slice(0, 48),
    display_name: input.display_name.slice(0, 64),
    description: (input.description || '').slice(0, 280),
    preferred_provider: input.preferred_provider || 'google',
    preferred_model: input.preferred_model || 'gemini-3.5-flash',
    fallback_provider: 'ollama',
    fallback_model: 'gemma3:4b',
    preferred_agent: input.preferred_agent || '',
    fallback_agent: '',
    execution_mode: 'read',
    cost_priority: 50,
    speed_priority: 60,
    quality_priority: 85,
    privacy_required: false,
    stream_required: true,
    keyword_patterns: (input.keyword_patterns || []).slice(0, 16),
    enabled: true,
  };
  try {
    const list = loadLocalCapabilities().filter(c => c.capability !== cap.capability);
    list.unshift(cap);
    localStorage.setItem(LOCAL_CAP_KEY, JSON.stringify(list.slice(0, 60)));
    invalidateCapabilityCache();
    try { window.dispatchEvent(new CustomEvent('axe-capabilities-changed', { detail: cap })); } catch { /* */ }
  } catch (e) {
    console.warn('[capabilityService] registerLocalCapability failed', e);
  }
  return cap;
}

function readCustomAgentPrompt(agentName: string): string | null {
  try {
    // ThinkThanks custom agents list
    const raw = localStorage.getItem(CUSTOM_AGENTS_KEY);
    if (raw) {
      const list = JSON.parse(raw) as Array<{ id?: string; name?: string; display_name?: string; system_prompt?: string; status?: string }>;
      if (Array.isArray(list)) {
        const hit = list.find(a =>
          a.id === agentName || a.name === agentName || a.display_name === agentName
        );
        if (hit?.system_prompt) return hit.system_prompt;
      }
    }
    // Agent Center overrides map
    const ov = localStorage.getItem(OVERRIDES_KEY);
    if (ov) {
      const map = JSON.parse(ov) as Record<string, { system_prompt?: string; name?: string; display_name?: string }>;
      if (map[agentName]?.system_prompt) return map[agentName].system_prompt!;
      for (const v of Object.values(map)) {
        if ((v.name === agentName || v.display_name === agentName) && v.system_prompt) return v.system_prompt;
      }
    }
  } catch { /* */ }
  return null;
}

function inferModeFromCapability(cap: CapabilityConfig | null | undefined, capability: string): ExecutionMode {
  if (cap?.execution_mode) return cap.execution_mode;
  switch (capability) {
    case 'code':
      return 'patch';
    case 'trading':
      return 'execute';
    case 'fast':
    case 'analysis':
    case 'reasoning':
    case 'privacy':
    case 'creative':
    case 'research':
    default:
      return 'read';
  }
}

let _cache: CapabilityConfig[] | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load all capabilities from Supabase. Falls back to hardcoded defaults.
 * Result is cached for 5 minutes to avoid repeated DB calls during routing.
 */
export async function loadCapabilities(): Promise<CapabilityConfig[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL_MS) return _cache;

  const local = loadLocalCapabilities();
  const mergeLocal = (base: CapabilityConfig[]): CapabilityConfig[] => {
    if (!local.length) return base;
    const seen = new Set(local.map(c => c.capability));
    return [...local, ...base.filter(c => !seen.has(c.capability))];
  };

  try {
    const sb = getSupabase();
    if (!sb) {
      _cache = mergeLocal(FALLBACK_CAPABILITIES);
      _cacheTime = now;
      return _cache;
    }

    const { data, error } = await sb
      .from('core_capabilities')
      .select('*')
      .eq('enabled', true)
      .order('capability');

    if (error || !data?.length) {
      _cache = mergeLocal(FALLBACK_CAPABILITIES);
      _cacheTime = now;
      return _cache;
    }

    const remote = data.map(row => ({
      ...row,
      keyword_patterns: Array.isArray(row.keyword_patterns) ? row.keyword_patterns : [],
    }));
    _cache = mergeLocal(remote);
    _cacheTime = now;
    return _cache;
  } catch {
    _cache = mergeLocal(FALLBACK_CAPABILITIES);
    _cacheTime = now;
    return _cache;
  }
}

/**
 * Get a single capability config by name.
 */
export async function getCapability(cap: string): Promise<CapabilityConfig | null> {
  const all = await loadCapabilities();
  return all.find(c => c.capability === cap) ?? null;
}

/**
 * Classify query text → capability name.
 * Uses keyword_patterns from Supabase if available, falls back to hardcoded.
 */
export async function classifyQueryDynamic(text: string): Promise<string> {
  const caps = await loadCapabilities();
  const t = text.toLowerCase();
  const wordCount = t.trim().split(/\s+/).length;

  // Privacy always wins
  const privacyCap = caps.find(c => c.privacy_required && c.enabled);
  if (privacyCap?.keyword_patterns.some(p => new RegExp(p).test(t))) {
    return 'privacy';
  }

  // Test each capability's patterns in priority order
  const ordered = [...caps].sort((a, b) => b.quality_priority - a.quality_priority);
  for (const cap of ordered) {
    if (cap.capability === 'fast' || cap.capability === 'privacy') continue;
    if (cap.keyword_patterns.some(p => { try { return new RegExp(p).test(t); } catch { return false; } })) {
      return cap.capability;
    }
  }

  // Long queries → analysis
  if (wordCount > 60) return 'analysis';

  return 'fast';
}

/**
 * Determine how a capability should be executed.
 * Use explicit DB config first; otherwise infer from capability semantics.
 */
export function getCapabilityExecutionMode(capability: string, cap?: CapabilityConfig | null): ExecutionMode {
  return inferModeFromCapability(cap ?? null, capability);
}

/** Invalidate the cache (call after updating capabilities in Supabase) */
export function invalidateCapabilityCache(): void {
  _cache = null;
  _cacheTime = 0;
}

// ---- Agent system-prompt cache ----
const _agentPromptCache = new Map<string, string>();

/**
 * Fetch the system_prompt for a given agent name from core_agents.
 * Returns null if not found or Supabase unavailable.
 * Cached in-memory for the session lifetime.
 */
export async function getAgentSystemPrompt(agentName: string): Promise<string | null> {
  if (_agentPromptCache.has(agentName)) return _agentPromptCache.get(agentName) ?? null;

  // THINKTHANKS / Agent Center local agents first — so integrated agents actually answer in chat
  const localPrompt = readCustomAgentPrompt(agentName);
  if (localPrompt) {
    _agentPromptCache.set(agentName, localPrompt);
    return localPrompt;
  }

  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb
      .from('core_agents')
      .select('system_prompt')
      .eq('name', agentName)
      .eq('status', 'active')
      .single();
    const prompt = data?.system_prompt ?? null;
    if (prompt) _agentPromptCache.set(agentName, prompt);
    return prompt;
  } catch {
    return null;
  }
}

export { FALLBACK_CAPABILITIES };
