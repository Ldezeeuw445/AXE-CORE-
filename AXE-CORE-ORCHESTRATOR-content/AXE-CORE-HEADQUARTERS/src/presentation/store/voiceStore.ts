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
import {
  PROVIDERS, isKeyOptional, classifyQuery, selectByCapability, prioritizeOllamaSlots,
  capabilityToSpecialists, migrateModel,
  type ProviderId, type ProviderCfg, type KeySlot, type QueryCapability,
} from '@/domain/providers';
import { AXE_SYSTEM_PROMPT } from '@/domain/prompts';
import { toProxied, callProvider } from '@/infrastructure/gateways/llmGateway';

// Re-exported for backwards compatibility: consumers historically imported
// the provider registry and LLM dispatch from this store. New code should
// import from @/domain/providers and @/infrastructure/gateways/llmGateway.
export { PROVIDERS, capabilityToSpecialists, migrateModel, AXE_SYSTEM_PROMPT, toProxied, callProvider };
export type { ProviderId, ProviderCfg, KeySlot };
import { logMessage } from '@/infrastructure/persistence/coreDB';
import { classifyQueryDynamic, loadCapabilities, getAgentSystemPrompt, getCapabilityExecutionMode } from '@/infrastructure/persistence/capabilityService';
import { buildWorkflow, formatBuildResult } from '@/application/workflows/workflowBuilder';
import { getSystemSummary, checkAllServices } from '@/application/system/systemService';
import { getDefaultOllamaModelNames, sortOllamaModelsForCapability } from '@/domain/catalogs/ollamaModelCatalog';
import { getStoredLlmModelRegistry } from '@/infrastructure/persistence/llmModelRegistryService';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { normalizeProviderBaseUrl } from '@/infrastructure/config/providerConnectionDefaults';
import { loadMessages, saveMessage, AXE_USER_ID, loadAllConversations, createNewConversationId, APP_SOURCE, saveConversationLocal, loadConversationLocal } from '@/infrastructure/persistence/chatPersistence';
import type { ConversationSummary } from '@/infrastructure/persistence/chatPersistence';
import { isAxeApiConfigured, crewRun, tts, checkAxeApi, apiExecuteOpenHands, apiExecuteOpenJarvis, apiExecuteOpenClaw, apiExecuteKiloCode, apiExecuteHermes, execCommand, ghGetFile, ghUpdateFile, sbGetRows, sbRunSql, vercelListDeployments, vercelPromote } from '@/infrastructure/gateways/axeCoreApiService';
import { speakWithElevenLabs, stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import { detectChatAction, type ChatAction } from '@/application/chat/chatActionService';
import { getEveSystemPromptSupplement } from '@/domain/catalogs/eveSkills';
import { saveGlobalMemory, buildGlobalMemoryContext } from '@/infrastructure/persistence/globalMemoryService';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { tavilySearch, tavilyConfigured, formatTavilyResults } from '@/infrastructure/gateways/tavilyService';
import { browseFetch, formatBrowseResult } from '@/infrastructure/gateways/browserFetchService';

type MsgArray = Array<{role:'user'|'assistant'|'system';content:string}>;
type SlotMsgBuilder = (provider:string, msgs:MsgArray)=>MsgArray;

interface GitReadArgs{repo:string;path:string;branch?:string;[key:string]:unknown}
interface GitWriteArgs{repo:string;path:string;content:string;message:string;branch?:string;[key:string]:unknown}
interface DbReadArgs{table:string;limit?:number;[key:string]:unknown}
interface DbSqlArgs{query:string;[key:string]:unknown}
interface VercelPromoteArgs{deploymentId:string;[key:string]:unknown}

/** Parse a JSON tool-marker payload. Returns null on malformed JSON or
 *  missing required fields rather than throwing — a bad tool call should
 *  surface as "that didn't work", not crash the whole resolution loop. */
function parseJsonArgs<T extends Record<string,unknown>>(raw:string,required:(keyof T)[]):T|null{
  try{
    const parsed=JSON.parse(raw) as Partial<T>;
    if(required.every(k=>typeof parsed[k]==='string'&&(parsed[k] as string).length>0)) return parsed as T;
    return null;
  }catch{return null;}
}

/**
 * Resolve model-initiated tool calls in a response.
 * Handles [SEARCH: "query"], [FETCH: "url"], [EXEC: "shell command"],
 * [GIT_READ: {json}], [GIT_WRITE: {json}], [DB_READ: {json}], and
 * [DB_SQL: {json}] markers. Executes tools, feeds real results back,
 * repeats up to maxIter rounds.
 */
async function resolveModelToolCalls(
  response:string,
  slot:KeySlot,
  messages:MsgArray,
  buildSlotMsgs:SlotMsgBuilder,
  maxIter=3
):Promise<string>{
  let current=response;
  for(let i=0;i<maxIter;i++){
    // Detect the first tool call in the response
    const searchMatch=current.match(/\[SEARCH:\s*"?([^"\]\n]{5,250})"?\]/);
    const fetchMatch=current.match(/\[FETCH:\s*"?(https?:\/\/[^"\]\n]{5,500})"?\]/);
    const execMatch=current.match(/\[EXEC:\s*"?([^"\]\n]{1,2000})"?\]/);
    const gitReadMatch=current.match(/\[GIT_READ:\s*(\{[^\]]{1,1000}\})\s*\]/);
    const gitWriteMatch=current.match(/\[GIT_WRITE:\s*(\{[^\]]{1,20000}\})\s*\]/);
    const dbReadMatch=current.match(/\[DB_READ:\s*(\{[^\]]{1,500}\})\s*\]/);
    const dbSqlMatch=current.match(/\[DB_SQL:\s*(\{[^\]]{1,5000}\})\s*\]/);
    const vercelStatusMatch=current.match(/\[VERCEL_STATUS:?\s*\]/);
    const vercelPromoteMatch=current.match(/\[VERCEL_PROMOTE:\s*(\{[^\]]{1,300}\})\s*\]/);
    if(!searchMatch&&!fetchMatch&&!execMatch&&!gitReadMatch&&!gitWriteMatch&&!dbReadMatch&&!dbSqlMatch&&!vercelStatusMatch&&!vercelPromoteMatch) break;

    let resultBlock='';
    try{
      if(searchMatch&&tavilyConfigured()){
        const query=searchMatch[1].trim();
        const results=await tavilySearch(query,{maxResults:4,depth:'basic'});
        resultBlock=results.length>0?formatTavilyResults(results,query):`No search results found for "${query}".`;
      }else if(fetchMatch){
        const url=fetchMatch[1].trim();
        const result=await browseFetch(url);
        resultBlock=formatBrowseResult(result,url);
      }else if(execMatch&&isAxeApiConfigured){
        const command=execMatch[1].trim();
        const approved=await requestActionApproval('exec','AXE wants to run this on the VPS',command);
        if(!approved){
          resultBlock=`EXEC "${command}" was NOT approved by Luka. Do not run it. Tell him plainly that you need his go-ahead first — never retry it without asking again.`;
        }else{
          const r=await execCommand(command);
          resultBlock=`EXEC "${r.command}" -> exit ${r.exit_code}${r.timed_out?' (timed out)':''}\nstdout:\n${r.stdout||'(empty)'}\nstderr:\n${r.stderr||'(empty)'}`;
        }
      }else if(gitReadMatch&&isAxeApiConfigured){
        // Reading a file isn't destructive — no approval gate, same as SEARCH/FETCH.
        const args=parseJsonArgs<GitReadArgs>(gitReadMatch[1],['repo','path']);
        if(!args){resultBlock='GIT_READ failed: malformed arguments — need {"repo":"owner/name","path":"..."}.';}
        else{
          const file=await ghGetFile(args.repo,args.path,args.branch||'orchestrator');
          resultBlock=`GIT_READ ${args.repo}/${args.path}:\n${file.content}`;
        }
      }else if(gitWriteMatch&&isAxeApiConfigured){
        const args=parseJsonArgs<GitWriteArgs>(gitWriteMatch[1],['repo','path','content','message']);
        if(!args){resultBlock='GIT_WRITE failed: malformed arguments — need {"repo","path","content","message"}.';}
        else{
          const title=`AXE wants to commit to ${args.repo}`;
          const detail=`${args.path}  (${args.branch||'orchestrator'})\n"${args.message}"\n\n${args.content}`;
          const approved=await requestActionApproval('git_write',title,detail);
          if(!approved){
            resultBlock=`GIT_WRITE to "${args.path}" was NOT approved by Luka. Do not commit it. Tell him plainly that you need his go-ahead first — never retry it without asking again.`;
          }else{
            const r=await ghUpdateFile(args.repo,args.path,args.content,args.message,args.branch||'orchestrator');
            resultBlock=`GIT_WRITE committed -> ${args.repo}/${args.path} (${r.sha.slice(0,7)})`;
          }
        }
      }else if(dbReadMatch&&isAxeApiConfigured){
        // Structured read via the REST route — no arbitrary SQL, no approval
        // gate, same tier as GIT_READ/SEARCH/FETCH.
        const args=parseJsonArgs<DbReadArgs>(dbReadMatch[1],['table']);
        if(!args){resultBlock='DB_READ failed: malformed arguments — need {"table":"...","limit":50}.';}
        else{
          const rows=await sbGetRows(args.table,{limit:args.limit||50});
          resultBlock=`DB_READ ${args.table} (${rows.length} rows):\n${JSON.stringify(rows,null,2).slice(0,4000)}`;
        }
      }else if(dbSqlMatch&&isAxeApiConfigured){
        // Arbitrary SQL can mutate — always gated, no exceptions, even for
        // what looks like a plain SELECT. Same contract as EXEC/GIT_WRITE.
        const args=parseJsonArgs<DbSqlArgs>(dbSqlMatch[1],['query']);
        if(!args){resultBlock='DB_SQL failed: malformed arguments — need {"query":"select ..."}.';}
        else{
          const approved=await requestActionApproval('db_sql','AXE wants to run this SQL on Supabase',args.query);
          if(!approved){
            resultBlock=`DB_SQL was NOT approved by Luka. Do not run it. Tell him plainly that you need his go-ahead first — never retry it without asking again.`;
          }else{
            const rows=await sbRunSql(args.query);
            resultBlock=`DB_SQL result (${Array.isArray(rows)?rows.length:'?'} rows):\n${JSON.stringify(rows,null,2).slice(0,4000)}`;
          }
        }
      }else if(vercelStatusMatch&&isAxeApiConfigured){
        // Read-only, no gate — same tier as GIT_READ/DB_READ.
        const deployments=await vercelListDeployments(10);
        resultBlock=deployments.length===0
          ?'VERCEL_STATUS: no deployments returned (check VERCEL_TOKEN/VERCEL_PROJECT_ID are configured on the VPS).'
          :`VERCEL_STATUS (${deployments.length} most recent):\n${deployments.map(d=>`- ${d.state} · ${d.target||'preview'} · ${d.commitSha||'?'} · "${d.commitMessage||''}" · ${d.url}`).join('\n')}`;
      }else if(vercelPromoteMatch&&isAxeApiConfigured){
        // Re-points production traffic — gated exactly like EXEC/GIT_WRITE,
        // even though it doesn't trigger a new build.
        const args=parseJsonArgs<VercelPromoteArgs>(vercelPromoteMatch[1],['deploymentId']);
        if(!args){resultBlock='VERCEL_PROMOTE failed: malformed arguments — need {"deploymentId":"..."}.';}
        else{
          const title='AXE wants to promote this deployment to production';
          const approved=await requestActionApproval('vercel_promote',title,args.deploymentId);
          if(!approved){
            resultBlock=`VERCEL_PROMOTE was NOT approved by Luka. Do not promote it. Tell him plainly that you need his go-ahead first — never retry it without asking again.`;
          }else{
            const r=await vercelPromote(args.deploymentId);
            resultBlock=`VERCEL_PROMOTE ${r.promoted?'succeeded':'failed'} -> ${r.deployment_id} is now production.`;
          }
        }
      }else break;
    }catch(e:unknown){
      if(execMatch){resultBlock=`EXEC failed to reach the VPS: ${e instanceof Error?e.message:String(e)}`;}
      else if(gitReadMatch||gitWriteMatch){resultBlock=`GitHub call failed: ${e instanceof Error?e.message:String(e)}`;}
      else if(vercelStatusMatch||vercelPromoteMatch){resultBlock=`Vercel call failed: ${e instanceof Error?e.message:String(e)}`;}
      else if(dbReadMatch||dbSqlMatch){resultBlock=`Supabase call failed: ${e instanceof Error?e.message:String(e)}`;}
      else break;
    }

    if(!resultBlock) break;

    const followUp=buildSlotMsgs(slot.provider,[
      ...messages,
      {role:'assistant'as const,content:current},
      {role:'user'as const,content:`${resultBlock}\n\nGeef nu je volledige antwoord op basis van deze informatie (dit zijn de echte resultaten — nooit zelf verzinnen). Verwijder alle tool-markers ([SEARCH:...], [FETCH:...], [EXEC:...], [GIT_READ:...], [GIT_WRITE:...], [DB_READ:...], [DB_SQL:...], [VERCEL_STATUS], [VERCEL_PROMOTE:...]) uit je antwoord.`},
    ]);
    try{current=await callProvider(slot,followUp);}catch{break;}
  }
  // Strip any leftover markers from the final response
  return current
    .replace(/\[SEARCH:\s*"?[^"\]\n]*"?\]/g,'')
    .replace(/\[FETCH:\s*"?[^"\]\n]*"?\]/g,'')
    .replace(/\[EXEC:\s*"?[^"\]\n]*"?\]/g,'')
    .replace(/\[GIT_READ:\s*\{[^\]]*\}\s*\]/g,'')
    .replace(/\[GIT_WRITE:\s*\{[^\]]*\}\s*\]/g,'')
    .replace(/\[DB_READ:\s*\{[^\]]*\}\s*\]/g,'')
    .replace(/\[DB_SQL:\s*\{[^\]]*\}\s*\]/g,'')
    .replace(/\[VERCEL_STATUS:?\s*\]/g,'')
    .replace(/\[VERCEL_PROMOTE:\s*\{[^\]]*\}\s*\]/g,'')
    .trim();
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

const ENV_KEYS: Partial<Record<string,string>> = {
  google: import.meta.env.VITE_GEMINI_API_KEY ?? '',
  xai: import.meta.env.VITE_XAI_API_KEY ?? '',
  openrouter: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
  openai: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  anthropic: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
  groq: import.meta.env.VITE_GROQ_API_KEY ?? '',
  krater: import.meta.env.VITE_KRATER_API_KEY ?? '',
};


function getProviderKeySlot(providerId:string):KeySlot|null {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections')??'{}') as Record<string,{key?:string;model?:string;baseUrl?:string}|undefined>;
    const conn = conns[providerId];
    const cfg = PROVIDERS.find(p=>p.id===providerId);
    const key = conn?.key || (providerId!=='ollama' ? (ENV_KEYS[providerId]??'') : '');
    const baseUrl = normalizeProviderBaseUrl(providerId as ProviderId, conn?.baseUrl || cfg?.baseUrl);
    if (isKeyOptional(providerId) && providerId!=='ollama' && !baseUrl) return null;
    if (!isKeyOptional(providerId) && !key) return null;
    // migrateModel() maps stale/deprecated model names (saved in localStorage,
    // possibly months ago) to the current canonical one for this provider —
    // see providers.ts's _MODEL_MIGRATIONS. Applying it here, at the one spot
    // every non-Ollama provider slot gets read from, means a fix to that map
    // takes effect immediately without the user re-typing anything.
    const model = migrateModel(providerId, conn?.model) || cfg?.defaultModel;
    return { provider:providerId as ProviderId, key, model, baseUrl };
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


async function logRoute(message:string,metadata:Record<string,unknown>={}){
  await logMessage('info','axe-core-router',message,{route_path:'AXE CORE > Orchestrator > Capability Router',...metadata}).catch(()=>{});
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

/** A consequential action (VPS shell command, GitHub commit) AXE wants to
 *  take, waiting on Luka's explicit yes/no before the real backend ever
 *  sees it. No allowlist limits WHAT can be asked for — this is the gate on
 *  WHEN: nothing happens without a human clicking approve.
 *
 *  Contract (do not weaken either half):
 *   1. Approval is ALWAYS required — every one of these, no exceptions, no
 *      "trusted" list that skips the prompt.
 *   2. Once Luka clicks Approve, the action must be immediate and
 *      frictionless — no second confirmation, no extra gate, no artificial
 *      delay. The approval IS the permission; don't make it feel broken by
 *      adding more checks after the one that matters. See
 *      resolvePendingExec below and the EXEC/GIT_WRITE branches in
 *      resolveModelToolCalls — approved goes straight to the real call,
 *      nothing in between.
 *  `title` is the one-line label shown in the approval card; `detail` is
 *  the command / diff / content shown in the scrollable body below it. */
export interface PendingExec{id:string;kind:'exec'|'git_write'|'db_sql'|'vercel_promote';title:string;detail:string}

interface VoiceState{
  primarySlot:KeySlot|null;fallback1Slot:KeySlot|null;fallback2Slot:KeySlot|null;fallback3Slot:KeySlot|null;activeProvider:ProviderId|null;
  voiceStatus:VoiceStatus;transcript:string;response:string;conversation:ConversationMessage[];sessionId:string;error:string|null;
  recognitionSupported:boolean;micPermission:'granted'|'denied'|'prompt'|'unknown';
  allConversations:ConversationSummary[];isLoadingConversations:boolean;
  apiKey:string;apiKeyValid:boolean|null;
  pendingAction:PendingChatAction|null;clearPendingAction:()=>void;
  pendingExec:PendingExec|null;resolvePendingExec:(id:string,approved:boolean)=>void;
  routingLog:RoutingEvent[];
  isGeminiLive:boolean;
  responseMode:'speak'|'type';
  vpsOnline:boolean|null; // null=unknown, true=reachable, false=offline
  setResponseMode:(mode:'speak'|'type')=>void;
  checkVpsStatus:()=>Promise<void>;
  setPrimarySlot:(slot:KeySlot|null)=>void;setFallback1Slot:(slot:KeySlot|null)=>void;setFallback2Slot:(slot:KeySlot|null)=>void;setFallback3Slot:(slot:KeySlot|null)=>void;
  refreshConfiguration:()=>Promise<void>;setApiKey:(key:string)=>void;testApiKey:()=>Promise<boolean>;testSlot:(slot:KeySlot)=>Promise<boolean>;
  clearError:()=>void;setError:(e:string|null)=>void;clearConversation:()=>void;clearRoutingLog:()=>void;
  loadConversation:()=>Promise<void>;loadAllConversations:()=>Promise<void>;switchConversation:(id:string)=>Promise<void>;startNewConversation:()=>void;
  checkMicPermission:()=>Promise<void>;startListening:()=>Promise<void>;stopListening:()=>void;sendMessage:(text:string)=>Promise<void>;
}

// Resolvers live outside Zustand state (functions aren't serializable state);
// only the display info {id, kind, title, detail} goes into the store for the UI to render.
const execApprovalResolvers=new Map<string,(approved:boolean)=>void>();

/** Pause tool resolution and wait for Luka to click approve/deny on this exact
 *  action in the chat UI. Resolves true/false — never times out on its own,
 *  matching "ask permission, don't auto-run" rather than a soft confirmation
 *  that silently proceeds if ignored. Shared by EXEC and GIT_WRITE (and any
 *  future consequential action) — one approval contract, not one per tool. */
function requestActionApproval(kind:'exec'|'git_write'|'db_sql'|'vercel_promote',title:string,detail:string):Promise<boolean>{
  const id=`${kind}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  return new Promise<boolean>(resolve=>{
    execApprovalResolvers.set(id,resolve);
    useVoiceStore.setState({pendingExec:{id,kind,title,detail}});
  });
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
  // Tracks whether localStorage had no valid session pointer at boot — e.g.
  // iOS Safari purges site storage after ~7 days without a top-level visit.
  // Only THIS case should trigger auto-resuming the last real conversation
  // in loadConversation() below; an explicit "+ New" click also produces a
  // fresh empty sessionId and must never be silently overridden by it.
  let wasFreshBootstrap=false;
  const sessionId=(()=>{try{let id=localStorage.getItem(SESSION_KEY);if(!id||!UUID_RE.test(id)){id=createNewConversationId();localStorage.setItem(SESSION_KEY,id);wasFreshBootstrap=true;}return id;}catch{wasFreshBootstrap=true;return createNewConversationId();}})();
  const legacyKey=(()=>{try{return localStorage.getItem('axe_api_key')||'';}catch{return'';}})();

  return{
    primarySlot:primary,fallback1Slot:fb1,fallback2Slot:fb2,fallback3Slot:fb3,activeProvider:primary?.provider??null,
    apiKey:primary?.key||legacyKey,apiKeyValid:null,voiceStatus:'idle',transcript:'',response:'',sessionId,
    conversation:[],allConversations:[],isLoadingConversations:false,error:null,
    recognitionSupported:!!SpeechRecCtor,micPermission:'unknown',
    routingLog:loadRoutingLog(),
    isGeminiLive:false,
    responseMode:loadResponseMode(),
    vpsOnline:null,
    pendingAction:null,clearPendingAction:()=>set({pendingAction:null}),
    pendingExec:null,
    resolvePendingExec:(id,approved)=>{
      const resolver=execApprovalResolvers.get(id);
      const pe=get().pendingExec;
      set(s=>s.pendingExec?.id===id?{pendingExec:null}:{});
      if(resolver){execApprovalResolvers.delete(id);resolver(approved);return;}
      // No resolver found — the tab that asked this question was reloaded or
      // backgrounded-and-suspended before Luka clicked Approve/Deny (common
      // on iOS), so whatever was awaiting this Promise no longer exists.
      // Clicking the button would otherwise just silently clear the card
      // with zero effect. For EXEC specifically, `detail` IS the raw command
      // (see requestActionApproval call sites), so it can still actually be
      // run and reported here directly instead of doing nothing.
      if(pe?.id!==id||pe.kind!=='exec')return;
      if(!approved){
        const text=`EXEC "${pe.detail}" was NOT approved by Luka.`;
        set(s=>({conversation:[...s.conversation,{role:'axe'as const,text,timestamp:Date.now(),provider:'exec',model:'direct'}]}));
        return;
      }
      execCommand(pe.detail).then(r=>{
        const text=`EXEC "${r.command}" -> exit ${r.exit_code}${r.timed_out?' (timed out)':''}\nstdout:\n${r.stdout||'(empty)'}\nstderr:\n${r.stderr||'(empty)'}`;
        set(s=>({conversation:[...s.conversation,{role:'axe'as const,text,timestamp:Date.now(),provider:'exec',model:'direct'}]}));
      }).catch(e=>{
        const text=`EXEC failed to reach the VPS: ${e instanceof Error?e.message:String(e)}`;
        set(s=>({conversation:[...s.conversation,{role:'axe'as const,text,timestamp:Date.now(),provider:'exec',model:'direct'}]}));
      });
    },
    setResponseMode:(mode)=>{try{localStorage.setItem('axe_response_mode',mode);}catch{}set({responseMode:mode});},

    checkVpsStatus:async()=>{
      if(!isAxeApiConfigured){set({vpsOnline:false});return;}
      try{await checkAxeApi();set({vpsOnline:true});}
      catch{set({vpsOnline:false});}
    },

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

    loadConversation:async()=>{
      // Kick off VPS health check in background (non-blocking)
      get().checkVpsStatus().catch(()=>{});
      const sid=get().sessionId;
      // ① localStorage first — instant, always works
      const local=loadConversationLocal(sid);
      if(local.length){const mapped=local.map(m=>({...m,timestamp:m.timestamp||Date.now()}))as ConversationMessage[];markLoadedAsPersisted(mapped);set({conversation:mapped});}
      // ② Supabase in background — fills in if local is empty or merges newer
      let hasHistory=local.length>0;
      try{
        const remote=await loadMessages(sid);
        if(remote.length){
          hasHistory=true;
          const mapped=remote.map(m=>({...m,timestamp:m.timestamp||Date.now()}))as ConversationMessage[];
          // Use remote if it has more messages than local (remote is source of truth for cross-device)
          const cur=get().conversation;
          if(mapped.length>=cur.length){markLoadedAsPersisted(mapped);set({conversation:mapped});saveConversationLocal(sid,mapped);}
        }
      }catch{/* Supabase unavailable — local is good enough */}
      // ③ Freshly-minted session (storage wiped, e.g. iOS Safari's ~7-day
      // purge) with genuinely no history under this id — resume the user's
      // most recent real conversation instead of stranding them on a blank
      // chat while their actual history sits orphaned server-side. Never
      // runs after an explicit "+ New" click — that also produces a fresh
      // empty session, but wasFreshBootstrap is only true at initial boot.
      if(wasFreshBootstrap&&!hasHistory){
        wasFreshBootstrap=false;
        try{
          const all=await loadAllConversations();
          const mostRecent=all[0];
          if(mostRecent){
            const resumed=await loadMessages(mostRecent.id);
            if(resumed.length){
              const mapped=resumed.map(m=>({...m,timestamp:m.timestamp||Date.now()}))as ConversationMessage[];
              localStorage.setItem(SESSION_KEY,mostRecent.id);
              markLoadedAsPersisted(mapped);
              set({sessionId:mostRecent.id,conversation:mapped});
              saveConversationLocal(mostRecent.id,mapped);
            }
          }
        }catch{/* no recovery possible — stay on the fresh empty session */}
      }
    },

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
            const{setGeminiLiveApiKey,getGeminiLiveService,startGeminiLive}=await import('@/infrastructure/gateways/geminiLiveService');
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

      // System status — only intercept broad "how's everything doing" asks, never
      // a specific-service question (those must fall through to the real chat/EXEC pipeline).
      if(/\b(status|gezondheid|health|online|offline|draait|running)\b/.test(lower)&&/\b(systeem|system|services|service|alle|all)\b/.test(lower)){
        set({voiceStatus:'processing'});await checkAllServices();const summary=await getSystemSummary();
        const reply=`System status:\n\n${summary.split(' | ').map(s=>`• ${s}`).join('\n')}`;
        set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:reply,timestamp:Date.now()}],response:reply,voiceStatus:'speaking',error:null}));
        speakSafely('System status retrieved.',()=>set({voiceStatus:'idle'}));return;
      }

      // Code edit
      if(/\b(verander|wijzig|pas\s+aan|change|modify|update|fix|rename)\b/i.test(lower)&&/\b(tab|pagina|page|component|button|knop|kleur|color|stijl|style|tekst|text|header|menu|modal|sidebar|card|sectie|section)\b/i.test(lower)){
        const{isGitHubConfigured,findFile,readFile,writeFile}=await import('@/infrastructure/gateways/githubCodeService');
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
        // preferred_model used to be stored but never actually applied — the
        // slot's own model (whatever's saved in Settings for that provider)
        // silently won every time, so setting this in the capability router
        // had no real effect. Override it on the matching provider's slot(s)
        // when the capability config specifies one.
        if(matchedCap.preferred_model){
          orderedSlots=orderedSlots.map(s=>s.provider===preferred?{...s,model:matchedCap.preferred_model!}:s);
        }
        if(matchedCap.preferred_agent)activeAgentPrompt=await getAgentSystemPrompt(matchedCap.preferred_agent).catch(()=>null);
      }else{orderedSlots=selectByCapability(cap as QueryCapability,allSlots);orderedSlots=prioritizeOllamaSlots(cap as QueryCapability,orderedSlots);}

      // ── Build a routing event that will be populated as slots are tried ──
      const routeEvt:RoutingEvent={id:`re_${Date.now()}`,ts:Date.now(),query:text.slice(0,60),capability:cap,slotOrder:orderedSlots.map(s=>s.provider),attempts:[],via:'none'};

      const history=get().conversation.slice(-10).map(m=>({role:m.role==='user'?'user'as const:'assistant'as const,content:m.text}));
      const eveSupp=orderedSlots[0]?getEveSystemPromptSupplement(orderedSlots[0].provider):'';
      const baseSystem=(activeAgentPrompt?`${AXE_SYSTEM_PROMPT}\n\n## Active Specialization\n${activeAgentPrompt}`:AXE_SYSTEM_PROMPT)+eveSupp;

      // ── Build system content: date + RAG + Tavily — all in parallel ─
      const today=new Date().toLocaleDateString('nl-NL',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
      let systemContent=baseSystem+`\n\n## Huidige datum\n${today} — Amsterdam (CET/CEST).`;

      const SEARCH_RE=/\b(wie|wat|wanneer|waar|hoe|why|who|what|when|where|how|zoek|search|nieuws|news|vandaag|today|recent|latest|actueel|verklaar|explain|define|wat betekent|tell me about|prijs|price|koers|stock|crypto|bitcoin|weather|weer|score|stand)\b/i;
      const shouldSearch=tavilyConfigured()&&SEARCH_RE.test(text)&&text.length>12&&cap!=='code';

      const [ragCtx,tavilyResults]=await Promise.all([
        buildGlobalMemoryContext(AXE_USER_ID,text,900).catch(()=>''),
        shouldSearch?tavilySearch(text.slice(0,300),{maxResults:5,depth:'basic'}).catch(()=>[]):Promise.resolve([]),
      ]);
      if(ragCtx) systemContent+=`\n\n${ragCtx}`;
      if(tavilyResults.length>0) systemContent+=`\n\n${formatTavilyResults(tavilyResults,text)}`;

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
        const{classifyBranch}=await import('@/application/agents/langGraphOrchestrator');
        const branch=classifyBranch(text,orderedSlots);
        // Only try VPS/crew if VPS is confirmed online (or status unknown on first message)
        const vpsReachable=get().vpsOnline!==false;
        if(branch==='local'&&isAxeApiConfigured&&vpsReachable){
          try{const conv=get().conversation.slice(-12).map(m=>({role:m.role,content:m.text}));const specialists=capabilityToSpecialists(cap);
          const crewRes=await crewRun({task:text,conversation:conv,specialists});if(crewRes?.status==='ok'&&crewRes.result){
            const trimmed=crewRes.result.trim();
            routeEvt.via='crew';routeEvt.winner='crew';routeEvt.winnerModel='crewai';routeEvt.attempts=[{provider:'crew',model:'crewai',outcome:'ok'}];
            pushRouteEvt(routeEvt);
            set(s=>({conversation:[...s.conversation,{role:'axe'as const,text:trimmed,timestamp:Date.now(),provider:'crew',model:'crewai'}],response:trimmed,voiceStatus:'speaking',activeProvider:'ollama'as ProviderId,error:null}));
            speakSafely(trimmed,()=>set({voiceStatus:'idle'}));logMessage('info','axe-core-voice',`[CREW] ${text.slice(0,60)}`,{}).catch(()=>{});return;
          }}catch(crewErr){console.warn('[Crew] failed:',crewErr);}
        }
        const{orchestrate}=await import('@/application/agents/langGraphOrchestrator');
        const lgCallFn=(slot:{provider:string;key:string;model?:string;baseUrl?:string},msgs:typeof messages)=>callProvider(slot as KeySlot,buildSlotMessages(slot.provider,msgs));
        const result=await orchestrate(messages,orderedSlots,lgCallFn);
        if(result){
          // Apply tool calls (SEARCH/FETCH) to LangGraph response too
          const resolved=await resolveModelToolCalls(result.response,result.slot as KeySlot,messages,buildSlotMessages);
          const trimmed=resolved.trim();
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

  // ① Always save to localStorage immediately — this is the reliable primary store
  saveConversationLocal(sid, state.conversation);

  // ② Save new messages to Supabase in background (best-effort)
  const toPersist=state.conversation.filter(m=>m.timestamp>_maxPersistedTs);
  if(toPersist.length===0)return;
  for(const m of toPersist)saveMessage({conversation_id:sid,user_id:AXE_USER_ID,role:m.role,content:m.text,provider:m.provider??null,model:m.model??null});
  markPersisted(toPersist[toPersist.length-1].timestamp);
});
