/**
 * Provider domain model — the canonical registry of LLM/agent providers and
 * the pure routing policy that decides which provider handles which query.
 * No I/O here: HTTP dispatch lives in @/infrastructure/gateways/llmGateway,
 * UI state in @/presentation/store/voiceStore.
 */
import { sortOllamaModelsForCapability } from '@/domain/catalogs/ollamaModelCatalog';

export type ProviderId =
  | 'anthropic' | 'openai' | 'google' | 'xai' | 'groq' | 'openrouter' | 'krater'
  | 'ollama' | 'openhands' | 'openjarvis' | 'openclaw' | 'kilocode' | 'crewai' | 'hermes';

export interface ProviderCfg {
  id: ProviderId; name: string; baseUrl: string; defaultModel: string;
  format: 'openai' | 'anthropic' | 'google'; needsKey?: boolean;
}

export const NO_KEY_PROVIDER_IDS = new Set<ProviderId>([
  'ollama','openhands','openjarvis','openclaw','kilocode','crewai','hermes'
]);
export const VPS_BRIDGE_PROVIDER_IDS = new Set<ProviderId>([
  'openhands','openjarvis','openclaw','kilocode','crewai','hermes'
]);

const OPENHANDS_BASE_URL = import.meta.env.VITE_OPENHANDS_URL ?? '/proxy/openhands';
const OPENJARVIS_BASE_URL = import.meta.env.VITE_OPENJARVIS_URL ?? '/proxy/openjarvis';
const OPENCLAW_BASE_URL = import.meta.env.VITE_OPENCLAW_URL ?? '/proxy/openclaw';
const KILOCODE_BASE_URL = import.meta.env.VITE_KILOCODE_URL ?? '/proxy/kilocode';
const CREWAI_BASE_URL = import.meta.env.VITE_CREWAI_URL ?? '/proxy/crewai';
const HERMES_BASE_URL = import.meta.env.VITE_HERMES_URL ?? '/proxy/hermes';
const GROQ_BASE_URL = import.meta.env.VITE_GROQ_URL ?? 'https://api.groq.com/openai/v1';
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL
  ?? (import.meta.env.DEV ? '/proxy/ollama' : 'https://ollama.axecompanion.com');

export const PROVIDERS: ProviderCfg[] = [
  { id:'anthropic', name:'Anthropic', baseUrl:'https://api.anthropic.com', defaultModel:'claude-sonnet-5', format:'anthropic', needsKey:true },
  { id:'openai', name:'OpenAI', baseUrl:'https://api.openai.com', defaultModel:'gpt-4o-mini', format:'openai', needsKey:true },
  { id:'google', name:'Google', baseUrl:'https://generativelanguage.googleapis.com', defaultModel:'gemini-3.5-flash', format:'google', needsKey:true },
  { id:'xai', name:'Grok', baseUrl:'https://api.x.ai', defaultModel:'grok-4.5', format:'openai', needsKey:true },
  { id:'groq', name:'Groq', baseUrl:GROQ_BASE_URL, defaultModel:'qwen/qwen3-32b', format:'openai', needsKey:true },
  // OpenRouter's free-tier model roster rotates constantly (providers add/pull
  // free models every few weeks) — any specific ":free" slug goes stale in
  // months. "openrouter/free" is their own auto-router: it always resolves
  // to *a* currently-free model matching the request, so this default can't
  // go stale the way a hardcoded slug did.
  { id:'openrouter', name:'OpenRouter', baseUrl:'https://openrouter.ai/api', defaultModel:'openrouter/free', format:'openai', needsKey:true },
  { id:'krater', name:'Krater', baseUrl:'https://api.krater.ai', defaultModel:'openai/gpt-4o-mini', format:'openai', needsKey:true },
  { id:'ollama', name:'Ollama', baseUrl:OLLAMA_BASE_URL, defaultModel:'gemma3:4b', format:'openai', needsKey:false },
  { id:'openhands', name:'OpenHands', baseUrl:OPENHANDS_BASE_URL, defaultModel:'claude-sonnet-4-5', format:'openai', needsKey:false },
  { id:'openjarvis', name:'OpenJarvis', baseUrl:OPENJARVIS_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
  { id:'openclaw', name:'OpenClaw', baseUrl:OPENCLAW_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
  { id:'kilocode', name:'Kilo Code', baseUrl:KILOCODE_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
  { id:'crewai', name:'CrewAI', baseUrl:CREWAI_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
  { id:'hermes', name:'Hermes Agent', baseUrl:HERMES_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
];

export function isKeyOptional(id:string){ return NO_KEY_PROVIDER_IDS.has(id as ProviderId); }

export interface KeySlot { provider:ProviderId; key:string; model?:string; baseUrl?:string; }

export type QueryCapability = 'fast'|'code'|'analysis'|'reasoning'|'privacy'|'creative';

export function classifyQuery(text:string):QueryCapability {
  const t=text.toLowerCase(), words=t.trim().split(/\s+/).length;
  if (/password|wachtwoord|private|prive|secret|geheim|bankrekening|bsn|credentials|adres\b|pincode/.test(t)) return 'privacy';
  if (/\bcode\b|debug|function|class|typescript|javascript|python|react|bug|syntax|implement|refactor|component|endpoint|sql|query|script/.test(t)) return 'code';
  if (/analys|research|strateg|vergelijk|compare|architect|plan\b|roadmap|design\b|explain|hoe werkt|waarom|how does|trade-off/.test(t)||words>60) return 'analysis';
  if (/why does|what if|calculate|bereken|redeneer|pro\b|cons\b|voor- en nadelen|als .* dan/.test(t)) return 'reasoning';
  if (/schrijf|write|brainstorm|idee|creative|campaign|copywriting|beschrijf|stel je voor/.test(t)) return 'creative';
  return 'fast';
}

export function selectByCapability(cap:QueryCapability,all:KeySlot[]):KeySlot[]{
  if(all.length===0) return[];
  const bp=(ids:string[])=>all.filter(s=>ids.includes(s.provider));
  const rest=(ids:string[])=>all.filter(s=>!ids.includes(s.provider));
  switch(cap){
    case 'privacy': return[...bp(['ollama']),...rest(['ollama'])];
    // Prefer real configured models (google/anthropic/xai) over openrouter/free —
    // free auto-router was winning chat and made ★ Primair look broken.
    case 'code': case 'analysis': case 'reasoning': return[...bp(['google']),...bp(['anthropic']),...bp(['xai']),...bp(['openai']),...bp(['openrouter']),...rest(['google','anthropic','xai','openai','openrouter'])];
    case 'creative': return[...bp(['google']),...bp(['anthropic']),...bp(['xai']),...bp(['openrouter']),...rest(['google','anthropic','xai','openrouter'])];
    // fast: Primary will be forced to front later — order here is preference
    // among the short identity cascade, not a full zoo race.
    case 'fast': default: return[...bp(['google']),...bp(['krater']),...bp(['openai']),...bp(['xai']),...bp(['ollama']),...rest(['google','krater','openai','xai','ollama'])];
  }
}

/** Read Luka's ★ Primair choice from localStorage (same key as voiceStore.setPrimarySlot). */
function loadPrimarySlot(): KeySlot | null {
  try {
    const raw = localStorage.getItem('axe_slot_primary');
    if (!raw) return null;
    const p = JSON.parse(raw) as KeySlot;
    return p?.provider ? p : null;
  } catch {
    return null;
  }
}

/** Live model/key/baseUrl from the Settings card (axe_llm_connections). */
function loadConnectionOverrides(provider: string): Partial<KeySlot> {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<
      string,
      { key?: string; model?: string; baseUrl?: string } | undefined
    >;
    const c = conns[provider];
    if (!c) return {};
    return {
      ...(c.key ? { key: c.key } : {}),
      ...(c.model ? { model: c.model } : {}),
      ...(c.baseUrl ? { baseUrl: c.baseUrl } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Force ★ Primair to the front of the slot order with its exact model.
 * Capability routing and Ollama prioritization used to ignore / demote it,
 * so the Settings star looked like a no-op and openrouter/free answered instead.
 *
 * Model priority (most recent wins):
 *  1. Live Settings card (axe_llm_connections) — what Test OK just verified
 *  2. Slot already in the list (also from connections via getProviderKeySlot)
 *  3. Cached ★ Primair snapshot (axe_slot_primary) — can be stale after a
 *     model rename without re-clicking Primair
 */
export function applyPrimarySlot(slots: KeySlot[], primary?: KeySlot | null): KeySlot[] {
  const p = primary ?? (typeof localStorage !== 'undefined' ? loadPrimarySlot() : null);
  if (!p?.provider) return slots;
  const fromList = slots.find(s => s.provider === p.provider);
  const live = typeof localStorage !== 'undefined' ? loadConnectionOverrides(p.provider) : {};
  const forced: KeySlot = {
    provider: p.provider,
    key: live.key || fromList?.key || p.key || '',
    model: live.model || fromList?.model || p.model,
    baseUrl: live.baseUrl || fromList?.baseUrl || p.baseUrl,
  };
  // Need a usable key (or optional-key provider) or we'd just fail first every turn
  if (!forced.key && !isKeyOptional(forced.provider)) {
    if (!fromList) return slots;
  }
  const rest = slots.filter(s => s.provider !== forced.provider);
  return [forced, ...rest];
}

/**
 * After capability order + primary force: for normal conversation keep the
 * cascade short so AXE feels like one stable voice instead of racing 12 APIs.
 * Code/analysis/privacy keep the fuller list (specialist work).
 */
export function limitChatIdentityCascade(capability: QueryCapability, slots: KeySlot[]): KeySlot[] {
  if (capability !== 'fast' && capability !== 'creative') return slots;
  if (slots.length <= 3) return slots;
  // Primary (index 0 after applyPrimarySlot) + up to 2 backups only.
  return slots.slice(0, 3);
}

export function prioritizeOllamaSlots(capability:QueryCapability, slots:KeySlot[]):KeySlot[] {
  const ollama = slots.filter(s=>s.provider==='ollama');
  let result: KeySlot[];
  if (ollama.length===0) {
    result = slots;
  } else {
    const ordered = sortOllamaModelsForCapability(ollama.map(s=>s.model??''),capability);
    const mapped = ordered.map(name=>ollama.find(s=>s.model===name)).filter((s):s is KeySlot=>!!s);
    result = [...mapped,...slots.filter(s=>s.provider!=='ollama')];
  }
  // ★ Primair always wins over Ollama bump and capability order
  result = applyPrimarySlot(result);
  // Chat identity: don't race the whole zoo on every greeting
  return limitChatIdentityCascade(capability, result);
}

export function capabilityToSpecialists(cap:string):string[]{
  switch(cap){
    case'code':return['wags','forge'];case'analysis':return['intel','nova'];case'strategy':return['nova'];
    case'creative':return['nova'];case'finance':return['dollar_bill'];case'trading':return['dollar_bill'];
    case'automation':return['sentinel'];case'infra':return['forge'];case'monitoring':return['pulse'];
    case'research':return['intel'];case'memory':return['atlas'];case'privacy':return['atlas'];
    default:return['axe_core'];
  }
}

/** Migrate a stored model name to the current canonical name for a provider.
 *  Called by SettingsPage on startup to update stale localStorage values. */
const _MODEL_MIGRATIONS: Record<string, Record<string,string>> = {
  google: {
    'gemini-1.5-flash':        'gemini-3.5-flash',
    'gemini-1.5-flash-latest': 'gemini-3.5-flash',
    'gemini-1.5-pro':          'gemini-3.5-flash',
    'gemini-1.0-pro':          'gemini-3.5-flash',
    'gemini-2.0-flash':        'gemini-3.5-flash', // Gemini 2.0 Flash EOL'd June 1 2026
    'gemini-2.0-flash-lite':   'gemini-3.5-flash',
    'gemini-flash-lite-latest':'gemini-3.5-flash', // this repo's own former (invalid) default
    // gemini-2.5-flash: blocked for new API keys ("no longer available to new
    // users") as of July 2026, shuts down for everyone Oct 16 2026.
    'gemini-2.5-flash':        'gemini-3.5-flash',
    'gemini-2.5-flash-lite':   'gemini-3.5-flash',
    // Keep gemini-3.5-flash-lite / gemini-3.6-flash as-is — valid distinct SKUs.
  },
  anthropic: {
    'claude-3-5-sonnet-20241022': 'claude-sonnet-5',
    'claude-3-5-haiku-20241022':  'claude-sonnet-5',
  },
  openrouter: {
    // Any hardcoded ":free" slug is a ticking time bomb — OpenRouter's free
    // roster turns over every few weeks. Route everything through their own
    // auto-router instead of chasing the next dead slug.
    'google/gemma-3-4b-it:free':                 'openrouter/free',
    'meta-llama/llama-3.1-8b-instruct:free':     'openrouter/free',
    'meta-llama/llama-3.1-8b-instruct':          'openrouter/free',
  },
  xai: {
    'grok-4.3': 'grok-4.5', // grok-4.5 is current flagship as of July 2026; 4.3 still works but isn't the default anymore
  },
  openai: {
    'gpt-4o': 'gpt-4o-mini',
  },
};
export function migrateModel(providerId: string, model: string | undefined): string | undefined {
  if (!model) return model;
  return _MODEL_MIGRATIONS[providerId]?.[model] ?? model;
}
