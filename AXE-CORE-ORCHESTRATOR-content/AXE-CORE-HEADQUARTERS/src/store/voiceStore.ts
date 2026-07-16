// ── Browser TTS fallback ──
function speakWithBrowser(text: string, onDone?: () => void) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onDone?.();
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'nl-NL';
  utter.rate = 1.1;
  utter.pitch = 1;
  utter.onend = () => onDone?.();
  utter.onerror = () => onDone?.();
  window.speechSynthesis.speak(utter);
}

import { create } from 'zustand';
import { logMessage } from '@/services/coreDB';
import { classifyQueryDynamic, loadCapabilities, getAgentSystemPrompt, getCapabilityExecutionMode } from '@/services/capabilityService';
import { buildWorkflow, formatBuildResult } from '@/services/workflowBuilder';
import { getSystemSummary, checkAllServices } from '@/services/systemService';
import { getDefaultOllamaModelNames, sortOllamaModelsForCapability } from '@/services/ollamaModelCatalog';
import { getStoredLlmModelRegistry } from '@/services/llmModelRegistryService';
import { loadSetting, saveSetting } from '@/services/userSettingsService';
import { normalizeProviderBaseUrl } from '@/services/providerConnectionDefaults';
import { loadMessages, saveMessage, AXE_USER_ID, loadAllConversations, createNewConversationId, APP_SOURCE } from '@/services/chatPersistence';
import type { ConversationSummary } from '@/services/chatPersistence';
import { isAxeApiConfigured, crewRun, tts } from '@/services/axeCoreApiService';
import { speakWithElevenLabs, stopTTS } from '@/services/elevenLabsService';
import { detectChatAction, type ChatAction } from '@/services/chatActionService';
import { getEveSystemPromptSupplement } from '@/lib/eveSkills';
import { saveGlobalMemory } from '@/services/globalMemoryService';
import { getSupabase } from '@/lib/supabaseClient';
import { tavilySearch, tavilyConfigured, formatTavilyResults } from '@/services/tavilyService';

type MsgArray = Array<{role:'user'|'assistant'|'system';content:string}>;
type SlotMsgBuilder = (provider:string, msgs:MsgArray)=>MsgArray;

/**
 * Resolve model-initiated tool calls in a response.
 * The model can include [SEARCH: "query"] anywhere in its reply.
 * We detect it, execute the search, and feed results back so the model
 * can write a complete, cited answer — up to maxIter rounds.
 */
async function resolveModelToolCalls(
  response:string,
  slot:KeySlot,
  messages:MsgArray,
  buildSlotMsgs:SlotMsgBuilder,
  maxIter=2
):Promise<string>{
  let current=response;
  for(let i=0;i<maxIter;i++){
    const match=current.match(/\[SEARCH:\s*"?([^"\]\n]{5,250})"?\]/);
    if(!match||!tavilyConfigured()) break;
    const query=match[1].trim();
    try{
      const results=await tavilySearch(query,{maxResults:4,depth:'basic'});
      if(results.length===0) break;
      const resultBlock=formatTavilyResults(results,query);
      const followUp=buildSlotMsgs(slot.provider,[
        ...messages,
        {role:'assistant'as const,content:current},
        {role:'user'as const,content:`${resultBlock}\n\nGeef nu je volledige antwoord op basis van deze zoekresultaten. Verwijder alle [SEARCH:...] markers uit je antwoord en citeer de bronnen.`},
      ]);
      current=await callProvider(slot,followUp);
    }catch{break;}
  }
  // Strip any leftover markers from the final response
  return current.replace(/\[SEARCH:\s*"?[^"\]\n]*"?\]/g,'').trim();
}

/** Fire-and-forget: write Q+A pair to global_memory and agent_memory after a successful response. */
async function writeConversationMemory(q: string, a: string, provider: string, capability: string): Promise<void> {
  const ts = Date.now();
  saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'conversation_context',
    key: `conv:${ts}`,
    value: JSON.stringify({ q: q.slice(0, 200), a: a.slice(0, 400), provider, capability }),
    confidence: 0.8,
  }).catch(() => {});
  if (capability && capability !== 'all') {
    try {
      const sb = getSupabase();
      if (sb) {
        void sb.from('agent_memory').insert({
          agent_id: capability,
          key: `conv:${ts}`,
          value: JSON.stringify({ q: q.slice(0, 200), a: a.slice(0, 400), provider }),
        });
      }
    } catch { /* ignore */ }
  }
}

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';

export type ProviderId =
  | 'anthropic' | 'openai' | 'google' | 'xai' | 'groq' | 'openrouter' | 'krater'
  | 'ollama' | 'openhands' | 'openjarvis' | 'openclaw' | 'kilocode' | 'crewai' | 'hermes';

export interface ProviderCfg {
  id: ProviderId; name: string; baseUrl: string; defaultModel: string;
  format: 'openai' | 'anthropic' | 'google'; needsKey?: boolean;
}

const NO_KEY_PROVIDER_IDS = new Set<ProviderId>([
  'ollama','openhands','openjarvis','openclaw','kilocode','crewai','hermes'
]);
const VPS_BRIDGE_PROVIDER_IDS = new Set<ProviderId>([
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
  { id:'anthropic', name:'Anthropic', baseUrl:'https://api.anthropic.com', defaultModel:'claude-3-5-sonnet-20241022', format:'anthropic', needsKey:true },
  { id:'openai', name:'OpenAI', baseUrl:'https://api.openai.com', defaultModel:'gpt-4o', format:'openai', needsKey:true },
  { id:'google', name:'Google', baseUrl:'https://generativelanguage.googleapis.com', defaultModel:'gemini-1.5-flash-latest', format:'google', needsKey:true },
  { id:'xai', name:'Grok', baseUrl:'https://api.x.ai', defaultModel:'grok-beta', format:'openai', needsKey:true },
  { id:'groq', name:'Groq', baseUrl:GROQ_BASE_URL, defaultModel:'qwen/qwen3-32b', format:'openai', needsKey:true },
  { id:'openrouter', name:'OpenRouter', baseUrl:'https://openrouter.ai/api', defaultModel:'meta-llama/llama-3.1-8b-instruct:free', format:'openai', needsKey:true },
  { id:'krater', name:'Krater', baseUrl:'https://api.krater.ai/v1', defaultModel:'openai/gpt-4o-mini', format:'openai', needsKey:true },
  { id:'ollama', name:'Ollama', baseUrl:OLLAMA_BASE_URL, defaultModel:'llama3.1:8b', format:'openai', needsKey:false },
  { id:'openhands', name:'OpenHands', baseUrl:OPENHANDS_BASE_URL, defaultModel:'claude-sonnet-4-5', format:'openai', needsKey:false },
  { id:'openjarvis', name:'OpenJarvis', baseUrl:OPENJARVIS_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
  { id:'openclaw', name:'OpenClaw', baseUrl:OPENCLAW_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
  { id:'kilocode', name:'Kilo Code', baseUrl:KILOCODE_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
  { id:'crewai', name:'CrewAI', baseUrl:CREWAI_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
  { id:'hermes', name:'Hermes Agent', baseUrl:HERMES_BASE_URL, defaultModel:'gpt-4o-mini', format:'openai', needsKey:false },
];

const ENV_KEYS: Partial<Record<string,string>> = {
  google: import.meta.env.VITE_GEMINI_API_KEY ?? '',
  xai: import.meta.env.VITE_XAI_API_KEY ?? '',
  openrouter: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
  openai: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  anthropic: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
  groq: import.meta.env.VITE_GROQ_API_KEY ?? '',
  krater: import.meta.env.VITE_KRATER_API_KEY ?? '',
};

function isKeyOptional(id:string){ return NO_KEY_PROVIDER_IDS.has(id as ProviderId); }

export interface KeySlot { provider:ProviderId; key:string; model?:string; baseUrl?:string; }

function getProviderKeySlot(providerId:string):KeySlot|null {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections')??'{}') as Record<string,{key?:string;model?:string;baseUrl?:string}|undefined>;
    const conn = conns[providerId];
    const cfg = PROVIDERS.find(p=>p.id===providerId);
    const key = conn?.key || (providerId!=='ollama' ? (ENV_KEYS[providerId]??'') : '');
    const baseUrl = normalizeProviderBaseUrl(providerId as ProviderId, conn?.baseUrl || cfg?.baseUrl);
    if (isKeyOptional(providerId) && providerId!=='ollama' && !baseUrl) return null;
    if (!isKeyOptional(providerId) && !key) return null;
    return { provider:providerId as ProviderId, key, model:conn?.model||cfg?.defaultModel, baseUrl };
  } catch { return null; }
}

function getOllamaKeySlots():KeySlot[] {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections')??'{}') as Record<string,{key?:string;model?:string;models?:string[];baseUrl?:string}|undefined>;
    const ollama = conns['ollama'];
    const cfg = PROVIDERS.find(p=>p.id==='ollama')!;
    const baseUrl = normalizeProviderBaseUrl('ollama', ollama?.baseUrl||cfg.baseUrl);
    const models:string[] = ollama?.models?.length ? ollama.models : (ollama?.model?[ollama.model]:getStoredLlmModelRegistry().map(m=>m.name).filter(Boolean)||getDefaultOllamaModelNames());
    const sorted = sortOllamaModelsForCapability([...models.filter(m=>!m.endsWith(':cloud')),...models.filter(m=>m.endsWith(':cloud'))]);
    return sorted.filter(Boolean).map(model=>({provider:'ollama' as ProviderId,key:'',model,baseUrl}));
  } catch { return []; }
}

function prioritizeOllamaSlots(capability:QueryCapability, slots:KeySlot[]):KeySlot[] {
  const ollama = slots.filter(s=>s.provider==='ollama');
  if (ollama.length===0) return slots;
  const ordered = sortOllamaModelsForCapability(ollama.map(s=>s.model??''),capability);
  const mapped = ordered.map(name=>ollama.find(s=>s.model===name)).filter((s):s is KeySlot=>!!s);
  return [...mapped,...slots.filter(s=>s.provider!=='ollama')];
}

async function logRoute(message:string,metadata:Record<string,unknown>={}){
  await logMessage('info','axe-core-router',message,{route_path:'AXE CORE > Orchestrator > Capability Router',...metadata}).catch(()=>{});
}

export const AXE_SYSTEM_PROMPT = `# AXE CORE — GOD MODE OPERATING SYSTEM
You are AXE CORE. You are the master intelligence — the God Mode OS that builds, runs, and controls the entire AXE ecosystem.

## Who You Are Talking To
Luka de Zeeuw — your creator, sysadmin, and only user. Dutch. 31 years old. Full-stack developer + infrastructure engineer. Based in Amsterdam. Codes in TypeScript and Python. Deploys on Railway, Vercel, and his own Hetzner VPS. You know him personally — use his name, remember what he tells you, and act like his most trusted system.

## How You Speak
- Dutch when he writes Dutch. English when he writes English. Never switch mid-conversation.
- 1–3 sentences unless he asks for detail. Be sharp, not verbose.
- Address him by name occasionally. You know him.
- Be proactive: suggest next steps, flag issues before he notices, celebrate shipped work.
- Never say "As an AI" or "I cannot" — find a way or say exactly why not.

## The AXE Ecosystem (what you control)
- **AXE CORE HQ** (this app) — your command center. Tabs: Home, AI Core, Architecture, Memory, Browser, Code Editor, Commands, Settings, EVE Framework, Organization.
- **AXE Companion** — personal assistant mobile app (separate, Expo)
- **AXE Intel** — market intelligence app (separate)
- **Trading OS** — trading execution engine (separate)
- **AXE VPS** — Hetzner VPS running Ollama, OpenHands, KiloCode, CrewAI, n8n, and agent services
- **Supabase** — primary database for all persistent memory, conversations, logs, global memory
- **GitHub** — repo Ldezeeuw445/AXE-CORE- on branch orchestrator. You can read and write code directly.

## Your AI Agents (AXE CORE specialists)
- **Wags** 🐺 — code & debugging (prefers Anthropic/OpenRouter)
- **Forge** 🔨 — infrastructure, VPS, Docker, deployment
- **Intel** 🔍 — research, analysis, competitive intelligence
- **Nova** ⭐ — analysis, strategy, creative tasks
- **Atlas** 🗺️ — memory management, privacy, personal data
- **Dollar Bill** 💰 — finance, trading, market analysis
- **Sentinel** 🛡️ — automation, monitoring, security
- **Pulse** 📡 — system health, service monitoring
- **KimiClaw / KimiCode / KimiWork** — AXE agent panels (in AI Core tab)

## Intelligence Routing (LangGraph)
You route every message through the LangGraph orchestrator:
- BRANCH A (local/private): VPS Ollama → local agent tools (code, privacy, infra)
- BRANCH B (cloud/reasoning): Cloud LLMs via configured API keys (analysis, research, creative)
You classify the query, pick the branch, retry on failure. Crew AI handles multi-agent tasks.

## EVE Skills
EVE is your personality layer. Each provider (Claude, Gemini, GPT, etc.) can have custom skills attached — injected as system prompt supplements before every call. Configured in Settings → EVE Framework.

## Intelligence Tools — How to Use Them
You can invoke real-time tools by including these exact markers in your response whenever you need them. The system executes the tool automatically and sends you the results so you can complete your answer.

🔍 **Web Search** — include this marker anywhere in your response:
\`[SEARCH: "your search query"]\`
Use for: current events, prices, stock prices, news, weather, documentation, people, recent releases, anything time-sensitive or that may have changed since your training.
Example: "Laat me even checken. [SEARCH: "bitcoin koers vandaag 2025"]"

📦 **Memory** — Relevant past conversations are automatically injected above as "Global Memory Context". No need to request them separately.

You can include up to 2 search markers per response. After each search, you will receive results and must give a complete final answer that does NOT include any [SEARCH:...] markers.

## What You Can Answer
Virtually anything — you have no hard knowledge limits:
- **Everything from training**: science, history, math, medicine, law, philosophy, literature, languages, code, finance, cooking, sports — the full breadth of human knowledge
- **Current facts via web search**: news, prices, weather, documentation, people, recent events
- **Personal memory**: everything Luka has told you, auto-retrieved from Supabase global_memory
- **System & ecosystem**: service status, API keys, AXE agent routing, Supabase schema
- **Code editing**: read and write files directly to GitHub (any file in the repo)
- **Workflow building**: create and deploy n8n workflows via the n8n API
- **Navigation**: open any tab or page in response to a voice/text command
- **File operations**: read/write workspace files via the api-server /files endpoint
- **OSINT**: real-time earthquake, flight, news, and disaster data
- **Browser**: fetch any URL server-side (no CORS/iframe limits)

## Rules
1. You are AXE CORE. Never adopt another identity.
2. Keep responses concise and actionable unless depth is explicitly requested.
3. Think system-wide: every decision considers the full AXE ecosystem.
4. Remember context — Luka expects full continuity across messages.
5. When you need current information, USE the [SEARCH:] tool — never say "I don't have access to real-time data" because you do.
6. You have real agency: you can commit code, call APIs, build workflows, search the web. Use it.
7. Never hallucinate facts. If uncertain, search first, then answer.`;

type QueryCapability = 'fast'|'code'|'analysis'|'reasoning'|'privacy'|'creative';

function classifyQuery(text:string):QueryCapability {
  const t=text.toLowerCase(), words=t.trim().split(/\s+/).length;
  if (/password|wachtwoord|private|prive|secret|geheim|bankrekening|bsn|credentials|adres\b|pincode/.test(t)) return 'privacy';
  if (/\bcode\b|debug|function|class|typescript|javascript|python|react|bug|syntax|implement|refactor|component|endpoint|sql|query|script/.test(t)) return 'code';
  if (/analys|research|strateg|vergelijk|compare|architect|plan\b|roadmap|design\b|explain|hoe werkt|waarom|how does|trade-off/.test(t)||words>60) return 'analysis';
  if (/why does|what if|calculate|bereken|redeneer|pro\b|cons\b|voor- en nadelen|als .* dan/.test(t)) return 'reasoning';
  if (/schrijf|write|brainstorm|idee|creative|campaign|copywriting|beschrijf|stel je voor/.test(t)) return 'creative';
  return 'fast';
}

function selectByCapability(cap:QueryCapability,all:KeySlot[]):KeySlot[]{
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

export function capabilityToSpecialists(cap:string):string[]{
  switch(cap){
    case'code':return['wags','forge'];case'analysis':return['intel','nova'];case'strategy':return['nova'];
    case'creative':return['nova'];case'finance':return['dollar_bill'];case'trading':return['dollar_bill'];
    case'automation':return['sentinel'];case'infra':return['forge'];case'monitoring':return['pulse'];
    case'research':return['intel'];case'memory':return['atlas'];case'privacy':return['atlas'];
    default:return['axe_core'];
  }
}

export function toProxied(url:string):string{
  if(import.meta.env.PROD) return url;
  return url.replace('https://api.anthropic.com','/proxy/anthropic').replace('https://api.openai.com','/proxy/openai')
    .replace('https://generativelanguage.googleapis.com','/proxy/google').replace('https://api.x.ai','/proxy/xai')
    .replace('https://api.groq.com/openai/v1','/proxy/groq').replace('https://openrouter.ai','/proxy/openrouter')
    .replace('https://api.krater.ai','/proxy/krater').replace('https://ollama.axecompanion.com','/proxy/ollama');
}

export async function callProvider(slot:KeySlot,messages:Array<{role:'user'|'assistant'|'system';content:string}>):Promise<string>{
  const cfg=PROVIDERS.find(p=>p.id===slot.provider);
  if(!cfg) throw new Error(`Unknown provider: ${slot.provider}`);
  const base=toProxied(slot.baseUrl||cfg.baseUrl), model=slot.model||cfg.defaultModel;
  const isOllama=slot.provider==='ollama';
  const signal=AbortSignal.timeout(isOllama?90_000:15_000);

  if(VPS_BRIDGE_PROVIDER_IDS.has(slot.provider)){
    const r=await fetch(`${base}/v1/models`,{method:'GET',signal});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.detail||e.error?.message||`HTTP ${r.status}`);}
    const d=await r.json().catch(()=>({}));
    const models=Array.isArray(d.data)?d.data:[];
    return `OK: ${slot.provider} bridge healthy (${models[0]?.id??'ok'})`;
  }

  // ── Production CORS bypass: Vercel Edge Function ─────────────────────
  // In production (Vercel), all AI calls go through the co-deployed
  // edge function at /api/proxy/ai — no CORS restrictions, no external
  // api-server dependency. VITE_AXE_CORE_API_URL is kept for other
  // server-side endpoints (VPS proxy, terminal, search) but NOT used here.
  if(import.meta.env.PROD){
    const pr=await fetch('/api/proxy/ai',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({provider:slot.provider,key:slot.key,model,format:cfg.format,baseUrl:slot.baseUrl??cfg.baseUrl,messages}),
      signal:AbortSignal.timeout(isOllama?90_000:25_000)});
    if(!pr.ok){const e=await pr.json().catch(()=>({})) as{error?:string};throw new Error(e.error??`Proxy HTTP ${pr.status}`);}
    const d=await pr.json() as{text?:string};return d.text??'';
  }

  if(cfg.format==='anthropic'){
    const sys=messages.find(m=>m.role==='system')?.content??'';
    const r=await fetch(`${base}/v1/messages`,{method:'POST',headers:{'x-api-key':slot.key,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model,max_tokens:600,system:sys,messages:messages.filter(m=>m.role!=='system')}),signal});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${r.status}`);}
    const d=await r.json();return d.content?.[0]?.text??'';
  }

  if(cfg.format==='google'){
    const sys=messages.find(m=>m.role==='system')?.content??'';
    const r=await fetch(`${base}/v1beta/models/${model}:generateContent?key=${slot.key}`,{method:'POST',headers:{'content-type':'application/json'},signal,body:JSON.stringify({contents:messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='user'?'user':'model',parts:[{text:m.content}]})),...(sys?{systemInstruction:{parts:[{text:sys}]}}:{}),generationConfig:{maxOutputTokens:600}})});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${r.status}`);}
    const d=await r.json();return d.candidates?.[0]?.content?.parts?.[0]?.text??'';
  }

  const chatPath=slot.provider==='groq'?`${base}/chat/completions`:`${base}/v1/chat/completions`;
  const r=await fetch(chatPath,{method:'POST',headers:{...(slot.key?{Authorization:`Bearer ${slot.key}`}:{}),'Content-Type':'application/json'},body:JSON.stringify({model,messages,max_tokens:600,temperature:0.7}),signal});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${r.status}`);}
  const d=await r.json();return d.choices?.[0]?.message?.content??'';
}

const SpeechRecCtor = typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;
let recInstance:SpeechRecognition|null=null;
function getRec():SpeechRecognition|null{
  if(!SpeechRecCtor) return null;
  if(!recInstance){recInstance=new SpeechRecCtor();recInstance.continuous=false;recInstance.interimResults=true;recInstance.lang='nl-NL';}
  return recInstance;
}

function speakSafely(text:string,onDone?:()=>void){
  // Respect the user's response-mode preference without creating a circular
  // dependency back to the store (localStorage is the source of truth here).
  try{if(localStorage.getItem('axe_response_mode')==='type'){onDone?.();return;}}catch{}
  speakWithElevenLabs(text,onDone,()=>{
    if(isAxeApiConfigured){
      void tts(text).then(blob=>{const url=URL.createObjectURL(blob);const audio=new Audio(url);audio.onended=()=>{URL.revokeObjectURL(url);onDone?.();};audio.onerror=()=>{URL.revokeObjectURL(url);onDone?.();};audio.play().catch(()=>onDone?.());}).catch(()=>{speakWithBrowser(text,onDone);});
      return;
    }
    speakWithBrowser(text,onDone);
  });
}

export interface ConversationMessage{role:'user'|'axe';text:string;timestamp:number;provider?:string;model?:string;slotErrors?:string;}

/** One routing decision — created per `sendMessage` call, populated as slots are tried. */
export interface RoutingEvent{
  id:string;ts:number;query:string;capability:string;
  slotOrder:string[];
  attempts:{provider:string;model?:string;outcome:'ok'|'fail';err?:string}[];
  winner?:string;winnerModel?:string;
  via:'langgraph'|'fallback'|'crew'|'none';
  /** How many consecutive messages were coalesced into this entry (≥1). */
  count?:number;
}

/** Shorten a raw error message to a concise label: "401", "429", "timeout", "network", etc. */
function shortErr(msg:string):string{
  if(/timeout|timed out|abort/i.test(msg)) return 'timeout';
  if(/network|failed to fetch|cors|load failed/i.test(msg)) return 'network';
  const m=msg.match(/\b(4\d{2}|5\d{2})\b/);if(m) return m[1];
  return msg.slice(0,24).replace(/\s+/g,' ').trim();
}

export type PendingChatAction={kind:'navigate';path:string;label:string}|{kind:'open_url';url:string};

interface VoiceState{
  primarySlot:KeySlot|null;fallback1Slot:KeySlot|null;fallback2Slot:KeySlot|null;fallback3Slot:KeySlot|null;activeProvider:ProviderId|null;
  voiceStatus:VoiceStatus;transcript:string;response:string;conversation:ConversationMessage[];sessionId:string;error:string|null;
  recognitionSupported:boolean;micPermission:'granted'|'denied'|'prompt'|'unknown';
  allConversations:ConversationSummary[];isLoadingConversations:boolean;
  apiKey:string;apiKeyValid:boolean|null;
  pendingAction:PendingChatAction|null;clearPendingAction:()=>void;
  routingLog:RoutingEvent[];
  isGeminiLive:boolean;
  responseMode:'speak'|'type';
  setResponseMode:(mode:'speak'|'type')=>void;
  setPrimarySlot:(slot:KeySlot|null)=>void;setFallback1Slot:(slot:KeySlot|null)=>void;setFallback2Slot:(slot:KeySlot|null)=>void;setFallback3Slot:(slot:KeySlot|null)=>void;
  refreshConfiguration:()=>Promise<void>;setApiKey:(key:string)=>void;testApiKey:()=>Promise<boolean>;testSlot:(slot:KeySlot)=>Promise<boolean>;
  clearError:()=>void;setError:(e:string|null)=>void;clearConversation:()=>void;clearRoutingLog:()=>void;
  loadConversation:()=>Promise<void>;loadAllConversations:()=>Promise<void>;switchConversation:(id:string)=>Promise<void>;startNewConversation:()=>void;
  checkMicPermission:()=>Promise<void>;startListening:()=>Promise<void>;stopListening:()=>void;sendMessage:(text:string)=>Promise<void>;
}

function loadSlot(name:string):KeySlot|null{try{const raw=localStorage.getItem(name);return raw?JSON.parse(raw):null;}catch{return null;}}
function saveSlot(name:string,slot:KeySlot|null){try{if(slot){localStorage.setItem(name,JSON.stringify(slot));saveSetting(name,slot);}else{localStorage.removeItem(name);saveSetting(name,null);}}catch{}}

const ROUTING_LOG_KEY='axe_routing_log';
const ROUTING_LOG_MAX_AGE_MS=7*24*60*60*1000;
function loadRoutingLog():RoutingEvent[]{
  try{
    const raw=localStorage.getItem(ROUTING_LOG_KEY);
    if(!raw)return[];
    const parsed:RoutingEvent[]=JSON.parse(raw);
    const cutoff=Date.now()-ROUTING_LOG_MAX_AGE_MS;
    return parsed.filter(e=>e.ts>cutoff).slice(0,50);
  }catch{return[];}
}
function saveRoutingLog(log:RoutingEvent[]):void{
  try{localStorage.setItem(ROUTING_LOG_KEY,JSON.stringify(log.slice(0,50)));}catch{}
}

function loadResponseMode():'speak'|'type'{
  try{const v=localStorage.getItem('axe_response_mode');return v==='type'?'type':'speak';}catch{return'speak';}
}

export const useVoiceStore=create<VoiceState>((set,get)=>{
  const primary=loadSlot('axe_slot_primary'),fb1=loadSlot('axe_slot_fallback1'),fb2=loadSlot('axe_slot_fallback2'),fb3=loadSlot('axe_slot_fallback3');
  const SESSION_KEY = `axe_chat_session_${APP_SOURCE}`;
  const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sessionId=(()=>{try{let id=localStorage.getItem(SESSION_KEY);if(!id||!UUID_RE.test(id)){id=createNewConversationId();localStorage.setItem(SESSION_KEY,id);}return id;}catch{return createNewConversationId();}})();
  const legacyKey=(()=>{try{return localStorage.getItem('axe_api_key')||'';}catch{return'';}})();

  return{
    primarySlot:primary,fallback1Slot:fb1,fallback2Slot:fb2,fallback3Slot:fb3,activeProvider:primary?.provider??null,
    apiKey:primary?.key||legacyKey,apiKeyValid:null,voiceStatus:'idle',transcript:'',response:'',sessionId,
    conversation:[],allConversations:[],isLoadingConversations:false,error:null,
    recognitionSupported:!!SpeechRecCtor,micPermission:'unknown',
    routingLog:loadRoutingLog(),
    isGeminiLive:false,
    responseMode:loadResponseMode(),
    pendingAction:null,clearPendingAction:()=>set({pendingAction:null}),
    setResponseMode:(mode)=>{try{localStorage.setItem('axe_response_mode',mode);}catch{}set({responseMode:mode});},

    setPrimarySlot:(slot)=>{saveSlot('axe_slot_primary',slot);if(slot){try{localStorage.setItem('axe_api_key',slot.key);}catch{}}set({primarySlot:slot,activeProvider:slot?.provider??null,apiKey:slot?.key??'',apiKeyValid:null});},
    setFallback1Slot:(slot)=>{saveSlot('axe_slot_fallback1',slot);set({fallback1Slot:slot});},
    setFallback2Slot:(slot)=>{saveSlot('axe_slot_fallback2',slot);set({fallback2Slot:slot});},
    setFallback3Slot:(slot)=>{saveSlot('axe_slot_fallback3',slot);set({fallback3Slot:slot});},

    refreshConfiguration:async()=>{
      const[primary,fb1,fb2,fb3,legacyKey]=await Promise.all([
        loadSetting<KeySlot|null>('axe_slot_primary',null),loadSetting<KeySlot|null>('axe_slot_fallback1',null),
        loadSetting<KeySlot|null>('axe_slot_fallback2',null),loadSetting<KeySlot|null>('axe_slot_fallback3',null),
        loadSetting<string>('axe_api_key',''),
      ]);
      set({primarySlot:primary,fallback1Slot:fb1,fallback2Slot:fb2,fallback3Slot:fb3,activeProvider:primary?.provider??null,apiKey:primary?.key||legacyKey||'',apiKeyValid:null});
    },

    setApiKey:(key)=>{try{localStorage.setItem('axe_api_key',key);}catch{}set({apiKey:key,apiKeyValid:null,error:null});},

    testApiKey:async()=>{const primary=get().primarySlot;if(!primary){set({error:'No primary key configured.'});return false;}return get().testSlot(primary);},

    testSlot:async(slot:KeySlot)=>{
      set({voiceStatus:'processing',error:null});
      try{await callProvider(slot,[{role:'system',content:'You are AXE.'},{role:'user',content:'Say OK'}]);set({apiKeyValid:true,voiceStatus:'idle',error:null});return true;}
      catch(e:unknown){const m=e instanceof Error?e.message:String(e);set({apiKeyValid:false,voiceStatus:'idle',error:m.includes('Timeout')?'Timeout — server not reachable.':m.includes('CORS')?'Network error — check API key.':`API Error: ${m}`});return false;}
    },

    clearError:()=>set({error:null}),setError:(error)=>set({error}),
    clearConversation:()=>set({conversation:[],transcript:'',response:''}),
    clearRoutingLog:()=>{try{localStorage.removeItem(ROUTING_LOG_KEY);}catch{}set({routingLog:[]});},

    loadConversation:async()=>{const sid=get().sessionId;const loaded=await loadMessages(sid);if(loaded.length){const mapped=loaded.map(m=>({...m,timestamp:m.timestamp||Date.now()}))as ConversationMessage[];markLoadedAsPersisted(mapped);set({conversation:mapped});}},

    loadAllConversations:async()=>{set({isLoadingConversations:true});try{const convs=await loadAllConversations();set({allConversations:convs,isLoadingConversations:false});}catch{set({isLoadingConversations:false});}},

    switchConversation:async(conversationId:string)=>{
      set({voiceStatus:'processing',error:null});
      try{localStorage.setItem(SESSION_KEY,conversationId);const loaded=await loadMessages(conversationId);const mapped=loaded.map(m=>({...m,timestamp:m.timestamp||Date.now()}))as ConversationMessage[];markLoadedAsPersisted(mapped);set({sessionId:conversationId,conversation:mapped,voiceStatus:'idle',transcript:'',response:''});}
      catch{set({voiceStatus:'idle',error:'Failed to load conversation'});}
    },

    startNewConversation:()=>{const newId=createNewConversationId();localStorage.setItem(SESSION_KEY,newId);try{localStorage.removeItem(ROUTING_LOG_KEY);}catch{}set({sessionId:newId,conversation:[],transcript:'',response:'',voiceStatus:'idle',error:null,routingLog:[]});},

    checkMicPermission:async()=>{try{if('permissions' in navigator){const r=await navigator.permissions.query({name:'microphone'as PermissionName});set({micPermission:r.state as 'granted'|'denied'|'prompt'});}}catch{}},

    startListening:async()=>{
      try{
        // ── Gemini Live (if Google slot is configured) ──────────────────
        const gState=get();
        const googleSlot=[gState.primarySlot,gState.fallback1Slot,gState.fallback2Slot,gState.fallback3Slot].find(s=>s?.provider==='google');
        if(googleSlot?.key){
          try{
            const{setGeminiLiveApiKey,getGeminiLiveService,startGeminiLive}=await import('@/services/geminiLiveService');
            setGeminiLiveApiKey(googleSlot.key);
            const svc=getGeminiLiveService();
            svc.setCallbacks({
              onStart:()=>set({voiceStatus:'listening',transcript:'',error:null,isGeminiLive:true}),
              onListening:()=>set({voiceStatus:'listening'}),
              onSpeaking:()=>set({voiceStatus:'speaking'}),
              onIdle:()=>set({voiceStatus:'idle'}),
              onStop:()=>set({voiceStatus:'idle',isGeminiLive:false}),
              // Gemini Live streams audio directly via WebSocket — do NOT call speakSafely
              // here or TTS will double-play. Just store the transcript.
              onText:(text)=>{
                const trimmed=text.trim();if(!trimmed)return;
                set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:trimmed,timestamp:Date.now(),provider:'google',model:'gemini-live'}],response:trimmed,voiceStatus:'idle',error:null}));
              },
              onError:(err)=>set({voiceStatus:'idle',isGeminiLive:false,error:`Gemini Live: ${err}`}),
            });
            await startGeminiLive();
            set({isGeminiLive:true});
            return;
          }catch(liveErr){console.warn('[GeminiLive] startup failed, falling back to browser STT:',liveErr);set({isGeminiLive:false});}
        }
        // ── Browser SpeechRecognition fallback ──────────────────────────
        const rec=getRec();if(!rec){set({error:'Speech recognition not supported.'});return;}
        try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(t=>t.stop());set({micPermission:'granted'});}catch{set({error:'Microphone permission denied.'});return;}
        stopTTS();set({transcript:'',response:'',voiceStatus:'listening',error:null});
        rec.onresult=(event:SpeechRecognitionEvent)=>{let final='';for(let i=0;i<event.results.length;i++)if(event.results[i].isFinal)final+=event.results[i][0].transcript;set({transcript:final||get().transcript});if(final){set({voiceStatus:'processing'});get().sendMessage(final).catch(()=>set({voiceStatus:'idle'}));}};
        rec.onerror=(event:SpeechRecognitionErrorEvent)=>{if(event.error==='not-allowed')set({voiceStatus:'idle',micPermission:'denied',error:'Microphone blocked.'});else if(event.error!=='no-speech')set({voiceStatus:'idle',error:`Speech error: ${event.error}`});else set({voiceStatus:'idle'});};
        rec.onend=()=>{if(get().voiceStatus==='listening')set({voiceStatus:'idle'});};
        rec.start();
      }catch(e:unknown){const m=e instanceof Error?e.message:String(e);set({voiceStatus:'idle',error:`Voice error: ${m}`});}
    },

    stopListening:()=>{try{recInstance?.stop();}catch{}stopTTS();set({voiceStatus:'idle',isGeminiLive:false});},

    sendMessage:async(text:string)=>{
      if(!text?.trim())return;
      set(s=>({conversation:[...s.conversation,{role:'user'as const,text,timestamp:Date.now()}],voiceStatus:'processing',error:null}));
      const lower=text.toLowerCase();

      // Chat-driven actions: navigate to a known tab (or a specific record
      // inside it), or open an external URL.
      const chatAction:ChatAction=await detectChatAction(text);
      if(chatAction){
        if(chatAction.kind==='navigate'){
          const reply=`Opening ${chatAction.label}.`;
          set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:reply,timestamp:Date.now()}],response:reply,voiceStatus:'speaking',error:null,pendingAction:{kind:'navigate',path:chatAction.path,label:chatAction.label}}));
          speakSafely(reply,()=>set({voiceStatus:'idle'}));return;
        }
        if(chatAction.kind==='open_url'){
          const reply=`Opening ${chatAction.url}.`;
          set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:reply,timestamp:Date.now()}],response:reply,voiceStatus:'speaking',error:null,pendingAction:{kind:'open_url',url:chatAction.url}}));
          speakSafely(reply,()=>set({voiceStatus:'idle'}));return;
        }
        if(chatAction.kind==='clarify'){
          set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:chatAction.message,timestamp:Date.now()}],response:chatAction.message,voiceStatus:'speaking',error:null}));
          speakSafely(chatAction.message,()=>set({voiceStatus:'idle'}));return;
        }
      }

      // Build workflow
      if(/\b(bouw|maak|create|build|genereer|generate)\b.*\b(workflow|automation|automatisering)\b/.test(lower)||/\bworkflow\b.*\b(voor|for|die|that|to)\b/.test(lower)){
        const intent=text.replace(/^(core[,;]?\s*|axe[,;]?\s*)/i,'').trim();set({voiceStatus:'processing'});
        const thinking='Building your workflow...';set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:thinking,timestamp:Date.now()}],response:thinking}));
        const result=await buildWorkflow(intent,true,false);const reply=formatBuildResult(result);
        set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:reply,timestamp:Date.now()}],response:reply,voiceStatus:'speaking',error:null}));
        speakSafely(result.success?`Workflow "${result.workflowName}" deployed.`:'Could not build workflow.',()=>set({voiceStatus:'idle'}));return;
      }

      // System status
      if((/\b(status|gezondheid|health|online|offline|draait|running)\b/.test(lower)&&/\b(systeem|system|services|service)\b/.test(lower))||/\b(alle|all|check|controleer)\b/.test(lower)){
        set({voiceStatus:'processing'});if(/\b(alle|all|check|controleer)\b/.test(lower))await checkAllServices();const summary=await getSystemSummary();
        const reply=`System status:\n\n${summary.split(' | ').map(s=>`• ${s}`).join('\n')}`;
        set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:reply,timestamp:Date.now()}],response:reply,voiceStatus:'speaking',error:null}));
        speakSafely('System status retrieved.',()=>set({voiceStatus:'idle'}));return;
      }

      // Code edit
      if(/\b(verander|wijzig|pas\s+aan|change|modify|update|fix|rename)\b/i.test(lower)&&/\b(tab|pagina|page|component|button|knop|kleur|color|stijl|style|tekst|text|header|menu|modal|sidebar|card|sectie|section)\b/i.test(lower)){
        const{isGitHubConfigured,findFile,readFile,writeFile}=await import('@/services/githubCodeService');
        if(!isGitHubConfigured()){const reply='GitHub not configured.';set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:reply,timestamp:Date.now()}],response:reply,voiceStatus:'speaking',error:null}));speakSafely(reply,()=>set({voiceStatus:'idle'}));return;}
        set({voiceStatus:'processing'});const thinking='Editing code...';set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:thinking,timestamp:Date.now()}],response:thinking}));
        try{const filePath=await findFile(text);if(!filePath)throw new Error('File not found.');const file=await readFile(filePath);const fileName=filePath.split('/').pop();
        const allSlots:KeySlot[]=[];for(const p of PROVIDERS){if(p.id==='ollama')allSlots.push(...getOllamaKeySlots());else{const s=getProviderKeySlot(p.id);if(s)allSlots.push(s);}}if(allSlots.length===0)throw new Error('No AI configured.');
        const codeSlots=[...allSlots.filter(s=>['anthropic','openai','openrouter'].includes(s.provider)),...allSlots];const prioritized=prioritizeOllamaSlots('code',codeSlots);
        const editMessages=[{role:'system'as const,content:'You are a code editor. Apply ONLY the requested change. Return ONLY the complete modified file content, no markdown fences.'},{role:'user'as const,content:`File: ${fileName}\n\nRequest: ${text}\n\nCurrent:\n${file.content}`}];
        let newContent='';for(const slot of prioritized){try{newContent=await callProvider(slot,editMessages);break;}catch{continue;}}if(!newContent)throw new Error('AI could not generate edit.');
        newContent=newContent.replace(/^```[a-z]*\n?/i,'').replace(/\n?```$/i,'');await writeFile(filePath,newContent,file.sha,`AXE: ${text.slice(0,72)}`,file.repo);
        const reply=`Done. \`${fileName}\` updated and committed.`;set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:reply,timestamp:Date.now(),provider:'github',model:'code-edit'}],response:reply,voiceStatus:'speaking',error:null}));speakSafely('Change committed.',()=>set({voiceStatus:'idle'}));
        }catch(editErr){const errMsg=editErr instanceof Error?editErr.message:String(editErr);const reply=`Code edit failed: ${errMsg}`;set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:reply,timestamp:Date.now()}],response:reply,voiceStatus:'idle',error:errMsg}));}return;
      }

      await logRoute('voice request',{routing_mode:'langgraph',text:text.slice(0,160)});

      const allSlots:KeySlot[]=[];for(const p of PROVIDERS){if(p.id==='ollama')allSlots.push(...getOllamaKeySlots());else{const s=getProviderKeySlot(p.id);if(s)allSlots.push(s);}}
      if(allSlots.length===0){const{primarySlot,fallback1Slot,fallback2Slot,fallback3Slot}=get();[primarySlot,fallback1Slot,fallback2Slot,fallback3Slot].forEach(s=>s&&allSlots.push(s));}
      if(allSlots.length===0){await logRoute('no providers');const reply='No AI configured. Go to Settings → Provider Keys.';set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:reply,timestamp:Date.now()}],response:reply,voiceStatus:'speaking',error:null}));speakSafely(reply,()=>set({voiceStatus:'idle'}));return;}

      const cap=await classifyQueryDynamic(text).catch(()=>classifyQuery(text));
      const capCfg=await loadCapabilities().catch(()=>null);
      const matchedCap=capCfg?.find(c=>c.capability===cap);
      let orderedSlots:KeySlot[],activeAgentPrompt:string|null=null;
      await logRoute('capability classified',{capability:cap,mode:matchedCap?'matched':'fallback'});

      if(matchedCap?.preferred_provider){
        const preferred = matchedCap.preferred_provider;
        const fallback = matchedCap.fallback_provider;
        orderedSlots=[...allSlots.filter(s=>s.provider===preferred),...allSlots.filter(s=>s.provider===fallback&&s.provider!==preferred),...allSlots.filter(s=>s.provider!==preferred&&s.provider!==fallback)];
        if(orderedSlots.length===0)orderedSlots=allSlots;
        if(matchedCap.preferred_agent)activeAgentPrompt=await getAgentSystemPrompt(matchedCap.preferred_agent).catch(()=>null);
      }else{orderedSlots=selectByCapability(cap as QueryCapability,allSlots);orderedSlots=prioritizeOllamaSlots(cap as QueryCapability,orderedSlots);}

      // ── Build a routing event that will be populated as slots are tried ──
      const routeEvt:RoutingEvent={id:`re_${Date.now()}`,ts:Date.now(),query:text.slice(0,60),capability:cap,slotOrder:orderedSlots.map(s=>s.provider),attempts:[],via:'none'};

      const history=get().conversation.slice(-10).map(m=>({role:m.role==='user'?'user'as const:'assistant'as const,content:m.text}));
      const eveSupp=orderedSlots[0]?getEveSystemPromptSupplement(orderedSlots[0].provider):'';
      const baseSystem=(activeAgentPrompt?`${AXE_SYSTEM_PROMPT}\n\n## Active Specialization\n${activeAgentPrompt}`:AXE_SYSTEM_PROMPT)+eveSupp;

      // ── Build system content with date + RAG + Tavily search ────────
      const today=new Date().toLocaleDateString('nl-NL',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
      let systemContent=baseSystem+`\n\n## Huidige datum\n${today} — Amsterdam (CET/CEST). Gebruik deze datum als "vandaag" in je antwoorden.`;

      // RAG: inject relevant memories from Supabase BEFORE the LLM call
      try{
        const {buildGlobalMemoryContext}=await import('@/services/globalMemoryService');
        const ragCtx=await buildGlobalMemoryContext(AXE_USER_ID,text,900);
        if(ragCtx) systemContent+=`\n\n${ragCtx}`;
      }catch{/* ignore — proceed without memory context */}

      // Tavily web search: proactively fetch results for factual/research queries
      const SEARCH_RE=/\b(wie|wat|wanneer|waar|hoe|why|who|what|when|where|how|zoek|search|nieuws|news|vandaag|today|recent|latest|actueel|verklaar|explain|define|wat betekent|tell me about|prijs|price|koers|stock|crypto|bitcoin|weather|weer|score|stand)\b/i;
      if(tavilyConfigured()&&SEARCH_RE.test(text)&&text.length>12&&cap!=='code'){
        try{
          const results=await tavilySearch(text.slice(0,300),{maxResults:5,depth:'basic'});
          if(results.length>0) systemContent+=`\n\n${formatTavilyResults(results,text)}`;
        }catch{/* search failed — proceed without context */}
      }

      const messages=[{role:'system'as const,content:systemContent},...history.slice(0,-1),{role:'user'as const,content:text}];

      const pushRouteEvt=(evt:RoutingEvent)=>{set(s=>{
        const head=s.routingLog[0];
        // Coalesce: if the most-recent entry has the same winner provider and
        // the same outcome path, bump its count and refresh ts/query instead of
        // pushing a new entry.  This keeps the panel readable during bursts.
        if(head&&head.winner&&head.winner===evt.winner&&head.via===evt.via&&evt.via!=='none'){
          const merged:RoutingEvent={...head,ts:evt.ts,query:evt.query,count:(head.count??1)+1};
          const updated=[merged,...s.routingLog.slice(1)].slice(0,50);
          saveRoutingLog(updated);return{routingLog:updated};
        }
        const updated=[evt,...s.routingLog].slice(0,50);saveRoutingLog(updated);return{routingLog:updated};
      });};

      // EVE per-slot: each provider gets its own skill supplement injected into the system message
      const buildSlotMessages=(slotProvider:string,baseMsgs:typeof messages)=>{
        const slotEve=getEveSystemPromptSupplement(slotProvider);
        if(!slotEve)return baseMsgs;
        const slotSys=(activeAgentPrompt?`${AXE_SYSTEM_PROMPT}\n\n## Active Specialization\n${activeAgentPrompt}`:AXE_SYSTEM_PROMPT)+slotEve;
        return [{role:'system'as const,content:slotSys},...baseMsgs.slice(1)];
      };

      try{
        const{classifyBranch}=await import('@/services/langGraphOrchestrator');
        const branch=classifyBranch(text,orderedSlots);
        if(branch==='local'&&isAxeApiConfigured){
          try{const conv=get().conversation.slice(-12).map(m=>({role:m.role,content:m.text}));const specialists=capabilityToSpecialists(cap);
          const crewRes=await crewRun({task:text,conversation:conv,specialists});if(crewRes?.status==='ok'&&crewRes.result){
            const trimmed=crewRes.result.trim();
            routeEvt.via='crew';routeEvt.winner='crew';routeEvt.winnerModel='crewai';routeEvt.attempts=[{provider:'crew',model:'crewai',outcome:'ok'}];
            pushRouteEvt(routeEvt);
            set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:trimmed,timestamp:Date.now(),provider:'crew',model:'crewai'}],response:trimmed,voiceStatus:'speaking',activeProvider:'ollama'as ProviderId,error:null}));
            speakSafely(trimmed,()=>set({voiceStatus:'idle'}));logMessage('info','axe-core-voice',`[CREW] ${text.slice(0,60)}`,{}).catch(()=>{});return;
          }}catch(crewErr){console.warn('[Crew] failed:',crewErr);}
        }
        const{orchestrate}=await import('@/services/langGraphOrchestrator');
        const lgCallFn=(slot:{provider:string;key:string;model?:string;baseUrl?:string},msgs:typeof messages)=>callProvider(slot as KeySlot,buildSlotMessages(slot.provider,msgs));
        const result=await orchestrate(messages,orderedSlots,lgCallFn);
        if(result){
          const trimmed=result.response.trim();
          routeEvt.via='langgraph';routeEvt.winner=result.slot.provider;routeEvt.winnerModel=result.slot.model;routeEvt.attempts=[{provider:result.slot.provider,model:result.slot.model,outcome:'ok'}];
          pushRouteEvt(routeEvt);
          set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:trimmed,timestamp:Date.now(),provider:result.slot.provider,model:result.slot.model}],response:trimmed,voiceStatus:'speaking',activeProvider:result.slot.provider as ProviderId,error:null}));
          speakSafely(trimmed,()=>set({voiceStatus:'idle'}));logMessage('info','axe-core-voice',`[LG] ${result.slot.provider}`,{}).catch(()=>{});writeConversationMemory(text,trimmed,result.slot.provider,cap).catch(()=>{});await logRoute('langgraph success',{provider:result.slot.provider});return;}
      }catch(lgErr){console.warn('[LangGraph] failed:',lgErr);await logRoute('langgraph fallback',{error:lgErr instanceof Error?lgErr.message:String(lgErr)});}

      let lastError='';
      const slotAttempts:{provider:string;err:string}[]=[];
      for(const slot of orderedSlots){
        try{
          const rawReply=await callProvider(slot,buildSlotMessages(slot.provider,messages));
          const reply=await resolveModelToolCalls(rawReply,slot,messages,buildSlotMessages);const trimmed=reply.trim();
          const skipped=slotAttempts.map(a=>`${a.provider} ${a.err}`).join(' · ');
          routeEvt.via='fallback';routeEvt.winner=slot.provider;routeEvt.winnerModel=slot.model;routeEvt.attempts.push({provider:slot.provider,model:slot.model,outcome:'ok'});
          pushRouteEvt(routeEvt);
          set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:trimmed,timestamp:Date.now(),provider:slot.provider,model:slot.model,...(skipped?{slotErrors:skipped}:{})}],response:trimmed,voiceStatus:'speaking',activeProvider:slot.provider,error:null}));
          speakSafely(trimmed,()=>set({voiceStatus:'idle'}));logMessage('info','axe-core-voice',`[${slot.provider}] ${text.slice(0,60)}`,{}).catch(()=>{});writeConversationMemory(text,trimmed,slot.provider,cap).catch(()=>{});await logRoute('provider success',{provider:slot.provider});return;
        }
        catch(e:unknown){lastError=e instanceof Error?e.message:String(e);const se=shortErr(lastError);slotAttempts.push({provider:slot.provider,err:se});routeEvt.attempts.push({provider:slot.provider,model:slot.model,outcome:'fail',err:se});await logRoute('provider failed',{provider:slot.provider,error:lastError.slice(0,200)});}
      }

      await logRoute('all providers failed',{error:lastError.slice(0,200)});
      const slotSummary=slotAttempts.map(a=>`${a.provider} ${a.err}`).join(' · ');
      routeEvt.via='none';pushRouteEvt(routeEvt);
      const errReply='AXE Core is temporarily unavailable. Check your API keys in Settings.';
      set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:errReply,timestamp:Date.now(),provider:'error',slotErrors:slotSummary||undefined}],response:errReply,voiceStatus:'idle',error:lastError}));
    },
  };
});

/* ── Persistence ─────────────────────────────────────────────────────── */
let _maxPersistedTs=0;
function markPersisted(ts:number){if(ts>=_maxPersistedTs)_maxPersistedTs=ts+1;}
/** Mark all messages in a loaded batch as already persisted so the subscriber
 *  does not re-save them and create Supabase duplicates. */
export function markLoadedAsPersisted(msgs:{timestamp:number}[]):void{
  const max=msgs.reduce((m,msg)=>Math.max(m,msg.timestamp),0);
  if(max>0)markPersisted(max);
}

useVoiceStore.subscribe((state,prev)=>{
  if(state.conversation===prev.conversation)return;
  const sid=state.sessionId;
  const toPersist=state.conversation.filter(m=>m.timestamp>_maxPersistedTs);
  if(toPersist.length===0)return;
  for(const m of toPersist)saveMessage({conversation_id:sid,user_id:AXE_USER_ID,role:m.role,content:m.text,provider:m.provider??null,model:m.model??null});
  markPersisted(toPersist[toPersist.length-1].timestamp);
});
