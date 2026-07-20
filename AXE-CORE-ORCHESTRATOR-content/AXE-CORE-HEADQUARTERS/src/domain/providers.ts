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
  { id:'openai', name:'OpenAI', baseUrl:'https://api.openai.com', defaultModel:'gpt-4o', format:'openai', needsKey:true },
  { id:'google', name:'Google', baseUrl:'https://generativelanguage.googleapis.com', defaultModel:'gemini-flash-lite-latest', format:'google', needsKey:true },
  { id:'xai', name:'Grok', baseUrl:'https://api.x.ai', defaultModel:'grok-4.3', format:'openai', needsKey:true },
  { id:'groq', name:'Groq', baseUrl:GROQ_BASE_URL, defaultModel:'qwen/qwen3-32b', format:'openai', needsKey:true },
  { id:'openrouter', name:'OpenRouter', baseUrl:'https://openrouter.ai/api', defaultModel:'google/gemma-3-4b-it:free', format:'openai', needsKey:true },
  { id:'krater', name:'Krater', baseUrl:'https://api.krater.ai', defaultModel:'openai/gpt-4o-mini', format:'openai', needsKey:true },
  { id:'ollama', name:'Ollama', baseUrl:OLLAMA_BASE_URL, defaultModel:'llama3.1:8b', format:'openai', needsKey:false },
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
    case 'code': case 'analysis': case 'reasoning': return[...bp(['openrouter']),...bp(['anthropic']),...bp(['xai']),...bp(['google']),...rest(['openrouter','anthropic','xai','google'])];
    case 'creative': return[...bp(['openrouter','anthropic']),...bp(['xai']),...rest(['openrouter','anthropic','xai'])];
    case 'fast': default: return[...bp(['google']),...bp(['ollama']),...bp(['xai']),...rest(['google','ollama','xai'])];
  }
}

export function prioritizeOllamaSlots(capability:QueryCapability, slots:KeySlot[]):KeySlot[] {
  const ollama = slots.filter(s=>s.provider==='ollama');
  if (ollama.length===0) return slots;
  const ordered = sortOllamaModelsForCapability(ollama.map(s=>s.model??''),capability);
  const mapped = ordered.map(name=>ollama.find(s=>s.model===name)).filter((s):s is KeySlot=>!!s);
  return [...mapped,...slots.filter(s=>s.provider!=='ollama')];
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
    'gemini-1.5-flash':       'gemini-flash-lite-latest',
    'gemini-1.5-pro':         'gemini-flash-lite-latest',
    'gemini-1.0-pro':         'gemini-flash-lite-latest',
    'gemini-2.0-flash-lite':  'gemini-flash-lite-latest',
  },
  anthropic: {
    'claude-3-5-sonnet-20241022': 'claude-sonnet-5',
    'claude-3-5-haiku-20241022':  'claude-sonnet-5',
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
  return _MODEL_MIGRATIONS[providerId]?.[model] ?? model;
}
