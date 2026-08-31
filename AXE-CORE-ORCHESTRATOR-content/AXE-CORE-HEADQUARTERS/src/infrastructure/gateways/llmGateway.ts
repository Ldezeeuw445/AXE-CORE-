/**
 * LLM gateway — the single place where chat completions are dispatched to a
 * provider: direct APIs in dev (via Vite proxy), the Vercel Edge Function in
 * production, and the VPS agent bridge for self-hosted agents.
 * Provider selection policy lives in @/domain/providers; this module only
 * knows how to talk to the wire.
 */
import { PROVIDERS, VPS_BRIDGE_PROVIDER_IDS, type KeySlot, type ProviderCfg } from '@/domain/providers';
import {
  crewRun,
  apiExecuteOpenHands, apiExecuteOpenJarvis, apiExecuteOpenClaw,
  apiExecuteKiloCode, apiExecuteHermes,
} from '@/infrastructure/gateways/axeCoreApiService';
import { findCustomProvider } from '@/domain/customProviders';
import { aiProxyUrl } from '@/infrastructure/config/apiUrl';
import { sanitizeLlmText } from '@/infrastructure/gateways/sanitizeLlmText';
import { isLocalOllamaUp, LOCAL_OLLAMA_URL, LOCAL_KEEP_ALIVE } from '@/infrastructure/gateways/localOllama';

/** Map direct provider URLs to the Vite dev proxy so local dev avoids CORS. */
/** Anthropic's endpoint is BASE + /v1/messages, so a base that already ends in
 *  /v1 produces /v1/v1/messages and a 404 — seen live 2026-08-20, and it reads
 *  exactly like a bad API key. Accept either form instead of demanding one. */
export function anthropicBase(base: string): string {
  const b = (base || 'https://api.anthropic.com').replace(/\/+$/, '');
  return b.endsWith('/v1') ? b.slice(0, -3).replace(/\/+$/, '') : b;
}

export function toProxied(url:string):string{
  if(import.meta.env.PROD) return url;
  return url.replace('https://api.anthropic.com','/proxy/anthropic').replace('https://api.openai.com','/proxy/openai')
    .replace('https://generativelanguage.googleapis.com','/proxy/google').replace('https://api.x.ai','/proxy/xai')
    .replace('https://api.groq.com/openai/v1','/proxy/groq').replace('https://openrouter.ai','/proxy/openrouter')
    .replace('https://api.cerebras.ai','/proxy/cerebras').replace('https://ollama.axecompanion.com','/proxy/ollama');
}

export async function callProvider(slot:KeySlot,messages:Array<{role:'user'|'assistant'|'system';content:string}>):Promise<string>{
  // Built-ins first; fall back to a user-added "Add Provider" entry — those
  // were only ever stored/displayed, never actually dispatchable, since this
  // lookup used to stop at the fixed PROVIDERS array.
  const builtin=PROVIDERS.find(p=>p.id===slot.provider);
  const custom=builtin?undefined:findCustomProvider(slot.provider);
  const cfg:ProviderCfg|undefined=builtin??(custom?{id:custom.id as ProviderCfg['id'],name:custom.name,baseUrl:custom.baseUrl,defaultModel:custom.defaultModel,format:custom.format,needsKey:custom.needsKey}:undefined);
  if(!cfg) throw new Error(`Unknown provider: ${slot.provider}`);
  const base=toProxied(slot.baseUrl||cfg.baseUrl), model=slot.model||cfg.defaultModel;
  const isOllama=slot.provider==='ollama';
  const signal=AbortSignal.timeout(isOllama?90_000:15_000);

  if(VPS_BRIDGE_PROVIDER_IDS.has(slot.provider)){
    // Actually execute the task on the VPS agent — not just a health check.
    const userMsg=messages.filter(m=>m.role==='user').pop()?.content??'';
    const sysMsg=messages.find(m=>m.role==='system')?.content??'';
    const payload={task:userMsg,context:sysMsg,conversation:messages};
    type AgentRes={result?:string;response?:string;output?:string;text?:string;error?:string};
    let res:AgentRes={};
    if(slot.provider==='openhands')       res=await apiExecuteOpenHands(payload) as AgentRes;
    else if(slot.provider==='openjarvis') res=await apiExecuteOpenJarvis(payload) as AgentRes;
    else if(slot.provider==='openclaw')   res=await apiExecuteOpenClaw(payload) as AgentRes;
    else if(slot.provider==='kilocode')   res=await apiExecuteKiloCode(payload) as AgentRes;
    else if(slot.provider==='hermes')     res=await apiExecuteHermes(payload) as AgentRes;
    else if(slot.provider==='crewai'){const cr=await crewRun({task:userMsg,context:sysMsg,conversation:messages});res=cr as AgentRes;}
    const text=res.result??res.response??res.output??res.text??'';
    if(!text)throw new Error(`${slot.provider} agent returned no content${res.error?`: ${res.error}`:''}`);
    return sanitizeLlmText(text);
  }

  // ── Ollama: try the machine's own local server first ────────────────────
  // The VPS-proxy path below sends `baseUrl` to the VPS and has the VPS do
  // the fetch — which can never reach `localhost:11434` on Luka's own Mac,
  // only on the VPS itself. Local Ollama can only ever be reached by a fetch
  // that originates from this machine, so it happens here, client-side,
  // before any proxy branch.
  //
  // Two-step so local actually gets used (the old single 1.2s attempt was
  // only ever long enough for a health check — a real completion always
  // timed out and fell through to the VPS, so local was never used):
  //   1) cheap cached probe of /api/tags — fails fast off the home network
  //   2) only if up, a real completion with a proper timeout + keep_alive
  // Any failure falls through to the unchanged VPS/cloud path below, so it
  // still "just works" when away from home or with Ollama stopped.
  if(isOllama && await isLocalOllamaUp()){
    try{
      // Ollama's NATIVE /api/chat (not the OpenAI /v1 shim) with think:false.
      // qwen3.5 is a reasoning model: via the OpenAI endpoint the hidden
      // "thinking" eats the token budget and message.content comes back empty.
      // Native chat + think:false returns a clean, fast answer (the point of
      // a *local fast* model). keep_alive pins it in memory between turns.
      const r=await fetch(`${LOCAL_OLLAMA_URL}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages,stream:false,think:false,keep_alive:LOCAL_KEEP_ALIVE,options:{num_predict:2048,temperature:0.7}}),signal:AbortSignal.timeout(120_000)});
      if(r.ok){const d=await r.json();const text=d.message?.content;if(text)return sanitizeLlmText(text);}
    }catch{
      // Model still cold-loading past the timeout, or a transient local error
      // — fall through to the VPS path rather than failing the whole turn.
    }
  }

  // ── Production: CORS-safe proxy (Vercel Edge Fn on the web, the VPS
  // backend directly inside a packaged Tauri app — see aiProxyUrl()) ──────
  if(import.meta.env.PROD){
    const pr=await fetch(aiProxyUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:slot.provider,key:slot.key,model,format:cfg.format,baseUrl:slot.baseUrl??cfg.baseUrl,messages}),signal:AbortSignal.timeout(isOllama?90_000:25_000)});
    if(!pr.ok){const e=await pr.json().catch(()=>({})) as{error?:string};throw new Error(e.error??`Proxy HTTP ${pr.status}`);}
    // Ollama replies as a plain-text stream on Vercel (25s cold-start cap);
    // the VPS proxy always returns a single {text} JSON body since it isn't
    // under that constraint. Try JSON first, fall back to raw text.
    const raw=await pr.text();
    try{const d=JSON.parse(raw) as{text?:string};return sanitizeLlmText(d.text??raw);}catch{return sanitizeLlmText(raw);}
  }

  if(cfg.format==='anthropic'){
    const sys=messages.find(m=>m.role==='system')?.content??'';
    const r=await fetch(`${anthropicBase(base)}/v1/messages`,{method:'POST',headers:{'x-api-key':slot.key,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model,max_tokens:4096,system:sys,messages:messages.filter(m=>m.role!=='system')}),signal});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${r.status}`);}
    const d=await r.json();return sanitizeLlmText(d.content?.[0]?.text??'');
  }

  if(cfg.format==='google'){
    const sys=messages.find(m=>m.role==='system')?.content??'';
    // Google's July 2026 API-key migration (AIza "Standard" -> AQ. "Auth" keys) moved
    // auth off the "?key=" query param onto this header — it works for both key
    // formats, so this isn't conditional on which one the user has.
    const r=await fetch(`${base}/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':slot.key},signal,body:JSON.stringify({contents:messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='user'?'user':'model',parts:[{text:m.content}]})),...(sys?{systemInstruction:{parts:[{text:sys}]}}:{}),generationConfig:{maxOutputTokens:8192}})});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${r.status}`);}
    const d=await r.json();return sanitizeLlmText(d.candidates?.[0]?.content?.parts?.[0]?.text??'');
  }

  const chatPath=slot.provider==='groq'?`${base}/chat/completions`:`${base}/v1/chat/completions`;
  const r=await fetch(chatPath,{method:'POST',headers:{...(slot.key?{Authorization:`Bearer ${slot.key}`}:{}),'Content-Type':'application/json'},body:JSON.stringify({model,messages,max_tokens:4096,temperature:0.7}),signal});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${r.status}`);}
  const d=await r.json();return sanitizeLlmText(d.choices?.[0]?.message?.content??'');
}

/**
 * Call an LLM with a fallback chain instead of a single provider.
 *
 * Why this exists: on 2026-08-19 a Google key died (401, service account
 * deleted) and took features down with it that had nothing to do with Google —
 * because a dozen call sites did `await callProvider(slot, messages)` against
 * one slot and had nowhere else to go. Luka's requirement, and he is right:
 * "gemini moet nooit meer als king of the jungle gezien worden... het moet
 * alleen nooit meer zo zijn dat als gemini faalt iets niet werkt terwijl we zat
 * modellen hebben."
 *
 * Ordered, never raced. Racing every provider on every message is what used to
 * flatten the VPS under LangGraph; this walks a short list and stops at the
 * first one that answers.
 *
 * Callers that need to know WHICH provider answered — to label a reply with it,
 * or to record it — should use {@link callWithFallbackDetailed}.
 */
export async function callWithFallback(
  slots: KeySlot[],
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
): Promise<string> {
  return (await callWithFallbackDetailed(slots, messages)).text;
}

export async function callWithFallbackDetailed(
  slots: KeySlot[],
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
): Promise<{ text: string; slot: KeySlot; attempts: number }> {
  const usable = slots.filter(s => s?.provider);
  if (!usable.length) {
    throw new Error('No provider configured — add one in Settings first.');
  }

  const failures: string[] = [];
  for (let i = 0; i < usable.length; i++) {
    const slot = usable[i];
    try {
      const text = await callProvider(slot, messages);
      // An empty string is a failure dressed as success: the caller would show
      // a blank reply and never learn the provider had nothing to say.
      if (text?.trim()) return { text, slot, attempts: i + 1 };
      failures.push(`${slot.provider}: empty response`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${slot.provider}: ${msg.slice(0, 120)}`);
      console.warn(`[llmGateway] ${slot.provider}/${slot.model ?? '?'} failed, trying next:`, msg);
    }
  }

  // Name every provider that was tried and why each one failed. The old
  // single-slot version surfaced one raw provider error, which sent people
  // debugging the wrong thing.
  throw new Error(
    `All ${usable.length} provider(s) failed — ${failures.join(' | ')}`,
  );
}
