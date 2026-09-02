/**
 * Native tool calling — the structured path, next to llmGateway's text path.
 *
 * ## Why this exists
 *
 * AXE's tools are driven by markers: the model is asked to write
 * `[SEARCH: "..."]` into its prose and `voiceStore` regexes it back out. That
 * works until it doesn't, and it fails in the worst possible way — silently.
 * Four ways, all of which look like "AXE gave a weird answer":
 *
 *   1. The model writes the marker slightly differently — a stray space, a
 *      smart quote, a line break inside the brackets — and nothing matches.
 *      No error is raised. The reply just carries on as if the tool had run.
 *   2. The model MENTIONS a marker while explaining what it can do, and it
 *      fires by accident.
 *   3. Arguments are regex captures, so there is no validation and no types.
 *      A path or query containing `]` breaks the match.
 *   4. Twenty-five marker formats plus ~3,900 tokens of documentation ride in
 *      the system prompt every single turn, spending attention on protocol
 *      rather than on the question.
 *
 * Every major API solved this years ago: send tools as definitions, get back a
 * structured call with validated JSON. The models are explicitly trained on
 * it. This module is that path.
 *
 * ## Why not an SDK
 *
 * AXE is multi-provider by design — Anthropic, OpenAI, Gemini, Groq,
 * OpenRouter, Ollama, and whatever gets added in Settings. Binding to one
 * vendor's agent SDK would throw that away and re-introduce exactly the
 * single-provider dependency that llmGateway's fallback chain exists to
 * prevent. So: one small translation layer, three wire formats, one shared
 * result type.
 *
 * ## What this does NOT do
 *
 * It does not run the loop. Deciding whether a call is allowed, asking Luka,
 * and executing it stays where it already is — in the tool registry, with the
 * risk tiers. This only replaces "how does the model ask for a tool".
 */
import { PROVIDERS, type KeySlot, type ProviderCfg } from '@/domain/providers';
import { findCustomProvider } from '@/domain/customProviders';
import { toProxied, anthropicBase } from '@/infrastructure/gateways/llmGateway';
import { sanitizeLlmText } from '@/infrastructure/gateways/sanitizeLlmText';

/** A tool as the model is told about it. Plain JSON Schema. */
// ToolDef moved to domain/tools/toolSchemas — see the note there. Imported
// for use in this file and re-exported so existing importers keep working.
import type { ToolDef } from '@/domain/tools/toolSchemas';
export type { ToolDef };

/** What the model asked for. Arguments are already parsed and validated JSON. */
export interface ToolCall {
  /** Provider-assigned id. Must be echoed back with the result. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** One assistant turn: prose, tool calls, or both. */
export interface LlmTurn {
  text: string;
  toolCalls: ToolCall[];
  /** Whether the model stopped because it wants tools run. */
  wantsTools: boolean;
}

/**
 * A message in a tool-using conversation.
 *
 * Wider than llmGateway's `{role, content: string}` because a tool round trip
 * needs two shapes that a string cannot carry: the assistant turn that made
 * the calls, and the results going back.
 */
export type ToolMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

function resolveCfg(slot: KeySlot): { cfg: ProviderCfg; base: string; model: string } {
  const builtin = PROVIDERS.find(p => p.id === slot.provider);
  const custom = builtin ? undefined : findCustomProvider(slot.provider);
  const cfg = builtin ?? (custom
    ? { id: custom.id as ProviderCfg['id'], name: custom.name, baseUrl: custom.baseUrl,
        defaultModel: custom.defaultModel, format: custom.format, needsKey: custom.needsKey }
    : undefined);
  if (!cfg) throw new Error(`Unknown provider: ${slot.provider}`);
  return {
    cfg,
    base: toProxied(slot.baseUrl || cfg.baseUrl),
    model: slot.model || cfg.defaultModel,
  };
}

/** Does this provider support native tool calling at all? */
export function supportsNativeTools(slot: KeySlot): boolean {
  const builtin = PROVIDERS.find(p => p.id === slot.provider);
  const fmt = builtin?.format ?? findCustomProvider(slot.provider)?.format;
  // The VPS bridge agents (openhands, crewai, …) take a task string, not a
  // tool list — they ARE the agent. Ollama's support varies per model, so it
  // is opt-in rather than assumed.
  if (!fmt) return false;
  return fmt === 'anthropic' || fmt === 'google' || fmt === 'openai';
}

/* ── Anthropic ─────────────────────────────────────────────────────────── */

function toAnthropic(messages: ToolMessage[]) {
  const out: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      // Anthropic carries results as a user turn of tool_result blocks.
      // Consecutive results are merged so a parallel round trip stays one
      // message — splitting them teaches the model not to call in parallel.
      const last = out[out.length - 1] as { role?: string; content?: unknown[] } | undefined;
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      if (last?.role === 'user' && Array.isArray(last.content)
          && (last.content[0] as { type?: string })?.type === 'tool_result') {
        last.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }
    if (m.role === 'assistant' && 'toolCalls' in m && m.toolCalls.length) {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls) {
        content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
      }
      out.push({ role: 'assistant', content });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function fromAnthropic(d: Record<string, unknown>): LlmTurn {
  // The whole array, not content[0]. llmGateway reads only the first block,
  // which is fine for prose and drops every tool_use on the floor.
  const blocks = (d.content ?? []) as Array<Record<string, unknown>>;
  const text = blocks.filter(b => b.type === 'text').map(b => String(b.text ?? '')).join('');
  const toolCalls = blocks
    .filter(b => b.type === 'tool_use')
    .map(b => ({
      id: String(b.id ?? ''),
      name: String(b.name ?? ''),
      input: (b.input ?? {}) as Record<string, unknown>,
    }));
  return { text: sanitizeLlmText(text), toolCalls, wantsTools: d.stop_reason === 'tool_use' };
}

/* ── OpenAI-compatible (OpenAI, Groq, OpenRouter, Cerebras, …) ─────────── */

function toOpenAI(messages: ToolMessage[]) {
  return messages.map(m => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, name: m.name, content: m.content };
    }
    if (m.role === 'assistant' && 'toolCalls' in m && m.toolCalls.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map(c => ({
          id: c.id, type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

function fromOpenAI(d: Record<string, unknown>): LlmTurn {
  const choice = (d.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const msg = (choice?.message ?? {}) as Record<string, unknown>;
  const raw = (msg.tool_calls ?? []) as Array<Record<string, unknown>>;
  const toolCalls = raw.map(c => {
    const fn = (c.function ?? {}) as Record<string, unknown>;
    let input: Record<string, unknown> = {};
    try {
      // Always parse. Never string-match the serialized arguments: escaping
      // differs between providers and between models.
      input = JSON.parse(String(fn.arguments ?? '{}')) as Record<string, unknown>;
    } catch {
      input = { _malformed: String(fn.arguments ?? '') };
    }
    return { id: String(c.id ?? ''), name: String(fn.name ?? ''), input };
  });
  return {
    text: sanitizeLlmText(String(msg.content ?? '')),
    toolCalls,
    wantsTools: choice?.finish_reason === 'tool_calls' || toolCalls.length > 0,
  };
}

/* ── Google ────────────────────────────────────────────────────────────── */

function toGoogle(messages: ToolMessage[]) {
  const contents: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name, response: { result: m.content } } }],
      });
      continue;
    }
    if (m.role === 'assistant' && 'toolCalls' in m && m.toolCalls.length) {
      contents.push({
        role: 'model',
        parts: m.toolCalls.map(c => ({ functionCall: { name: c.name, args: c.input } })),
      });
      continue;
    }
    contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] });
  }
  return contents;
}

function fromGoogle(d: Record<string, unknown>): LlmTurn {
  const cand = (d.candidates as Array<Record<string, unknown>> | undefined)?.[0];
  const parts = ((cand?.content as Record<string, unknown>)?.parts ?? []) as Array<Record<string, unknown>>;
  const text = parts.filter((p: Record<string, unknown>) => p.text)
    .map((p: Record<string, unknown>) => String(p.text)).join('');
  const toolCalls = parts
    .filter((p: Record<string, unknown>) => p.functionCall)
    .map((p: Record<string, unknown>, i: number) => {
      const fc = p.functionCall as Record<string, unknown>;
      return {
        // Google does not issue call ids. One is synthesised so the rest of
        // the system can treat every provider the same.
        id: `g_${Date.now()}_${i}`,
        name: String(fc.name ?? ''),
        input: (fc.args ?? {}) as Record<string, unknown>,
      };
    });
  return { text: sanitizeLlmText(text), toolCalls, wantsTools: toolCalls.length > 0 };
}

/* ── the one entry point ───────────────────────────────────────────────── */

/**
 * One turn, with tools the model can actually call.
 *
 * Returns prose, tool calls, or both. Running them is the caller's job — the
 * risk tiers and the approval card live in the tool registry and stay there.
 */
export async function callProviderWithTools(
  slot: KeySlot,
  messages: ToolMessage[],
  tools: ToolDef[],
  opts: { maxTokens?: number; signal?: AbortSignal } = {},
): Promise<LlmTurn> {
  const { cfg, base, model } = resolveCfg(slot);
  const maxTokens = opts.maxTokens ?? 4096;
  const signal = opts.signal ?? AbortSignal.timeout(60_000);
  const system = messages.find(m => m.role === 'system')?.content ?? '';

  if (cfg.format === 'anthropic') {
    const r = await fetch(`${anthropicBase(base)}/v1/messages`, {
      method: 'POST', signal,
      headers: { 'x-api-key': slot.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: maxTokens, ...(system ? { system } : {}),
        messages: toAnthropic(messages),
        tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error?.message || `HTTP ${r.status}`);
    return fromAnthropic(await r.json());
  }

  if (cfg.format === 'google') {
    const r = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': slot.key },
      body: JSON.stringify({
        contents: toGoogle(messages),
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        tools: [{ functionDeclarations: tools.map(t => ({
          name: t.name, description: t.description, parameters: t.parameters,
        })) }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error?.message || `HTTP ${r.status}`);
    return fromGoogle(await r.json());
  }

  const chatPath = slot.provider === 'groq' ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const r = await fetch(chatPath, {
    method: 'POST', signal,
    headers: { ...(slot.key ? { Authorization: `Bearer ${slot.key}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.7,
      messages: toOpenAI(messages),
      tools: tools.map(t => ({ type: 'function', function: {
        name: t.name, description: t.description, parameters: t.parameters,
      } })),
    }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error?.message || `HTTP ${r.status}`);
  return fromOpenAI(await r.json());
}
