/**
 * infrastructure/llm/providerGateway.ts
 *
 * The single HTTP gateway to every LLM provider. Owns the four wire formats
 * (OpenAI-compatible, Anthropic, Google, VPS agent bridge) plus the
 * production Edge-Function proxy path. Callers never touch fetch() or
 * provider URLs directly — they pass a resolved KeySlot and chat messages.
 *
 * This code previously lived inside the voice store (a UI-state module),
 * which forced backend-ish services to import from the UI layer. It is now a
 * standalone infrastructure adapter that depends only on core/llm config and
 * the VPS API client.
 */

import type { ChatMessage, KeySlot } from '@/core/llm/types';
import { PROVIDERS, VPS_BRIDGE_PROVIDER_IDS } from '@/core/llm/providers';
import {
  crewRun,
  apiExecuteOpenHands, apiExecuteOpenJarvis, apiExecuteOpenClaw,
  apiExecuteKiloCode, apiExecuteHermes,
} from '@/services/axeCoreApiService';

/** Rewrite direct provider URLs to Vite dev-proxy paths in development. */
export function toProxied(url: string): string {
  if (import.meta.env.PROD) return url;
  return url.replace('https://api.anthropic.com', '/proxy/anthropic').replace('https://api.openai.com', '/proxy/openai')
    .replace('https://generativelanguage.googleapis.com', '/proxy/google').replace('https://api.x.ai', '/proxy/xai')
    .replace('https://api.groq.com/openai/v1', '/proxy/groq').replace('https://openrouter.ai', '/proxy/openrouter')
    .replace('https://api.krater.ai', '/proxy/krater').replace('https://ollama.axecompanion.com', '/proxy/ollama');
}

export async function callProvider(slot: KeySlot, messages: ChatMessage[]): Promise<string> {
  const cfg = PROVIDERS.find(p => p.id === slot.provider);
  if (!cfg) throw new Error(`Unknown provider: ${slot.provider}`);
  const base = toProxied(slot.baseUrl || cfg.baseUrl), model = slot.model || cfg.defaultModel;
  const isOllama = slot.provider === 'ollama';
  const signal = AbortSignal.timeout(isOllama ? 90_000 : 15_000);

  if (VPS_BRIDGE_PROVIDER_IDS.has(slot.provider)) {
    // Actually execute the task on the VPS agent — not just a health check.
    const userMsg = messages.filter(m => m.role === 'user').pop()?.content ?? '';
    const sysMsg = messages.find(m => m.role === 'system')?.content ?? '';
    const payload = { task: userMsg, context: sysMsg, conversation: messages };
    type AgentRes = { result?: string; response?: string; output?: string; text?: string; error?: string };
    let res: AgentRes = {};
    if (slot.provider === 'openhands')       res = await apiExecuteOpenHands(payload) as AgentRes;
    else if (slot.provider === 'openjarvis') res = await apiExecuteOpenJarvis(payload) as AgentRes;
    else if (slot.provider === 'openclaw')   res = await apiExecuteOpenClaw(payload) as AgentRes;
    else if (slot.provider === 'kilocode')   res = await apiExecuteKiloCode(payload) as AgentRes;
    else if (slot.provider === 'hermes')     res = await apiExecuteHermes(payload) as AgentRes;
    else if (slot.provider === 'crewai') { const cr = await crewRun({ task: userMsg, context: sysMsg, conversation: messages }); res = cr as AgentRes; }
    const text = res.result ?? res.response ?? res.output ?? res.text ?? '';
    if (!text) throw new Error(`${slot.provider} agent returned no content${res.error ? `: ${res.error}` : ''}`);
    return text;
  }

  // ── Production: Vercel Edge Function (CORS-safe proxy) ──────────────
  if (import.meta.env.PROD) {
    const pr = await fetch(`/api/proxy/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: slot.provider, key: slot.key, model, format: cfg.format, baseUrl: slot.baseUrl ?? cfg.baseUrl, messages }), signal: AbortSignal.timeout(isOllama ? 90_000 : 25_000) });
    if (!pr.ok) { const e = await pr.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? `Proxy HTTP ${pr.status}`); }
    const d = await pr.json() as { text?: string }; return d.text ?? '';
  }

  if (cfg.format === 'anthropic') {
    const sys = messages.find(m => m.role === 'system')?.content ?? '';
    const r = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'x-api-key': slot.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 600, system: sys, messages: messages.filter(m => m.role !== 'system') }), signal });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${r.status}`); }
    const d = await r.json(); return d.content?.[0]?.text ?? '';
  }

  if (cfg.format === 'google') {
    const sys = messages.find(m => m.role === 'system')?.content ?? '';
    const r = await fetch(`${base}/v1beta/models/${model}:generateContent?key=${slot.key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify({ contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })), ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}), generationConfig: { maxOutputTokens: 600 } }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${r.status}`); }
    const d = await r.json(); return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  const chatPath = slot.provider === 'groq' ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const r = await fetch(chatPath, { method: 'POST', headers: { ...(slot.key ? { Authorization: `Bearer ${slot.key}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages, max_tokens: 600, temperature: 0.7 }), signal });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${r.status}`); }
  const d = await r.json(); return d.choices?.[0]?.message?.content ?? '';
}
