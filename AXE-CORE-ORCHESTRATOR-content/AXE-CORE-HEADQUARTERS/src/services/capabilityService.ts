/**
 * capabilityService.ts
 * Loads capability → model/agent routing from Supabase core_capabilities table.
 * Falls back to hardcoded config if Supabase is unavailable.
 * Used by voiceStore Smart Router to make routing data-driven instead of hardcoded.
 */

import { getSupabase } from '@/lib/supabaseClient';

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
  cost_priority: number;
  speed_priority: number;
  quality_priority: number;
  privacy_required: boolean;
  stream_required: boolean;
  keyword_patterns: string[];
  enabled: boolean;
}

// Fallback: hardcoded defaults if Supabase is down
const FALLBACK_CAPABILITIES: CapabilityConfig[] = [
  { capability: 'fast',      display_name: 'Fast',      description: '', preferred_provider: 'google',      preferred_model: 'gemini-2.0-flash',               fallback_provider: 'ollama',     fallback_model: 'llama3.2',                       preferred_agent: '', fallback_agent: '', cost_priority: 80, speed_priority: 90, quality_priority: 40,  privacy_required: false, stream_required: true, keyword_patterns: [], enabled: true },
  { capability: 'code',      display_name: 'Code',      description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'openrouter', fallback_model: 'deepseek/deepseek-coder',         preferred_agent: 'axe_developer', fallback_agent: '', cost_priority: 30, speed_priority: 40, quality_priority: 100, privacy_required: false, stream_required: true, keyword_patterns: ['\\bcode\\b','debug','function','typescript','javascript','python','react','bug'], enabled: true },
  { capability: 'analysis',  display_name: 'Analysis',  description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'google',     fallback_model: 'gemini-2.0-flash',               preferred_agent: 'axe_intel',     fallback_agent: '', cost_priority: 30, speed_priority: 30, quality_priority: 100, privacy_required: false, stream_required: true, keyword_patterns: ['analys','research','strateg','compare','architect','roadmap'], enabled: true },
  { capability: 'reasoning', display_name: 'Reasoning', description: '', preferred_provider: 'openrouter',  preferred_model: 'openai/gpt-4o',                  fallback_provider: 'anthropic',  fallback_model: 'claude-3-5-sonnet-20241022',     preferred_agent: 'axe_intel',     fallback_agent: '', cost_priority: 30, speed_priority: 40, quality_priority: 100, privacy_required: false, stream_required: true, keyword_patterns: ['calculate','bereken','redeneer','what if','why does'], enabled: true },
  { capability: 'privacy',   display_name: 'Privacy',   description: '', preferred_provider: 'ollama',      preferred_model: 'llama3.2',                       fallback_provider: 'ollama',     fallback_model: 'llama3.2',                       preferred_agent: 'axe_ollama',    fallback_agent: '', cost_priority: 50, speed_priority: 50, quality_priority: 60,  privacy_required: true,  stream_required: true, keyword_patterns: ['password','wachtwoord','private','secret','geheim','bsn','pincode'], enabled: true },
  { capability: 'creative',  display_name: 'Creative',  description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'google',     fallback_model: 'gemini-2.0-flash',               preferred_agent: '', fallback_agent: '', cost_priority: 40, speed_priority: 50, quality_priority: 90,  privacy_required: false, stream_required: true, keyword_patterns: ['schrijf','write','brainstorm','creative','campaign'], enabled: true },
  { capability: 'trading',   display_name: 'Trading',   description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'openrouter', fallback_model: 'meta-llama/llama-3.1-8b-instruct:free', preferred_agent: 'axe_trader', fallback_agent: '', cost_priority: 50, speed_priority: 60, quality_priority: 90, privacy_required: false, stream_required: true, keyword_patterns: ['trade','market','signal','forex','crypto','stock','risk','leverage'], enabled: true },
  { capability: 'research',  display_name: 'Research',  description: '', preferred_provider: 'openrouter',  preferred_model: 'anthropic/claude-3.5-sonnet',    fallback_provider: 'google',     fallback_model: 'gemini-2.0-flash',               preferred_agent: 'axe_intel',     fallback_agent: '', cost_priority: 30, speed_priority: 30, quality_priority: 100, privacy_required: false, stream_required: true, keyword_patterns: ['research','zoek op','find out','what is','who is'], enabled: true },
];

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

  try {
    const sb = getSupabase();
    if (!sb) return FALLBACK_CAPABILITIES;

    const { data, error } = await sb
      .from('core_capabilities')
      .select('*')
      .eq('enabled', true)
      .order('capability');

    if (error || !data?.length) return FALLBACK_CAPABILITIES;

    _cache = data.map(row => ({
      ...row,
      keyword_patterns: Array.isArray(row.keyword_patterns) ? row.keyword_patterns : [],
    }));
    _cacheTime = now;
    return _cache;
  } catch {
    return FALLBACK_CAPABILITIES;
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
