/**
 * visionGateway.ts — multimodal (image + text) completion for AXE vision.
 *
 * Prefer Google Gemini (primary identity). Falls through OpenAI → Anthropic
 * when configured. Uses the same KeySlot model as chat routing.
 */
import type { KeySlot } from '@/domain/providers';
import { PROVIDERS } from '@/domain/providers';
import { toProxied } from '@/infrastructure/gateways/llmGateway';
import { sanitizeLlmText } from '@/infrastructure/gateways/sanitizeLlmText';
import { aiProxyUrl } from '@/infrastructure/config/apiUrl';

export interface VisionRequest {
  /** User question, e.g. "Wat zie je?" */
  prompt: string;
  /** raw base64 (no data: prefix) */
  imageBase64: string;
  mimeType?: string;
  systemPrompt?: string;
}

const DEFAULT_SYSTEM =
  'You are AXE, Luka\'s personal AI co-founder. Describe and answer based on the attached image. Be concise, practical, and honest. If text is visible, read it accurately. Respond in the same language as the user question.';

/**
 * Call the first usable vision-capable slot with image + text.
 * Order: prefer google → openai → anthropic from the provided slots list.
 */
export async function callVision(
  slots: KeySlot[],
  req: VisionRequest,
): Promise<{ text: string; slot: KeySlot }> {
  const mime = req.mimeType ?? 'image/jpeg';
  const ordered = prioritizeVisionSlots(slots);
  if (ordered.length === 0) {
    throw new Error('No vision-capable provider configured (need Google, OpenAI, or Anthropic).');
  }

  let lastErr = '';
  for (const slot of ordered) {
    try {
      const text = await callVisionProvider(slot, req, mime);
      const trimmed = sanitizeLlmText(text).trim();
      if (trimmed) return { text: trimmed, slot };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr || 'All vision providers failed.');
}

function prioritizeVisionSlots(slots: KeySlot[]): KeySlot[] {
  const rank = (p: string) =>
    p === 'google' ? 0 : p === 'openai' ? 1 : p === 'anthropic' ? 2 : p === 'openrouter' ? 3 : 9;
  return [...slots]
    .filter((s) => ['google', 'openai', 'anthropic', 'openrouter'].includes(s.provider))
    .sort((a, b) => rank(a.provider) - rank(b.provider));
}

async function callVisionProvider(
  slot: KeySlot,
  req: VisionRequest,
  mime: string,
): Promise<string> {
  const cfg = PROVIDERS.find((p) => p.id === slot.provider);
  if (!cfg) throw new Error(`Unknown provider ${slot.provider}`);
  const model = slot.model || cfg.defaultModel;
  const system = req.systemPrompt ?? DEFAULT_SYSTEM;
  const signal = AbortSignal.timeout(45_000);

  // Production proxy (Vercel Edge / VPS) — extend body with vision fields.
  // Until the edge function is updated, we still try direct Google/OpenAI in dev.
  if (import.meta.env.PROD && slot.provider !== 'google') {
    const pr = await fetch(aiProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: slot.provider,
        key: slot.key,
        model,
        format: cfg.format,
        baseUrl: slot.baseUrl ?? cfg.baseUrl,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: req.prompt },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${req.imageBase64}` } },
            ],
          },
        ],
        vision: true,
      }),
      signal,
    });
    if (!pr.ok) {
      const e = (await pr.json().catch(() => ({}))) as { error?: string };
      throw new Error(e.error ?? `Proxy HTTP ${pr.status}`);
    }
    const raw = await pr.text();
    try {
      const d = JSON.parse(raw) as { text?: string };
      return d.text ?? raw;
    } catch {
      return raw;
    }
  }

  if (slot.provider === 'google' || cfg.format === 'google') {
    return callGeminiVision(slot, model, system, req.prompt, req.imageBase64, mime, signal);
  }

  if (slot.provider === 'anthropic' || cfg.format === 'anthropic') {
    return callAnthropicVision(slot, model, system, req.prompt, req.imageBase64, mime, signal);
  }

  // OpenAI-compatible (openai, openrouter, …)
  return callOpenAIVision(slot, model, system, req.prompt, req.imageBase64, mime, signal);
}

async function callGeminiVision(
  slot: KeySlot,
  model: string,
  system: string,
  prompt: string,
  imageBase64: string,
  mime: string,
  signal: AbortSignal,
): Promise<string> {
  const base = toProxied(slot.baseUrl || PROVIDERS.find((p) => p.id === 'google')!.baseUrl);
  const r = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': slot.key,
    },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 2048 },
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { error?: { message?: string } }).error?.message || `HTTP ${r.status}`);
  }
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callOpenAIVision(
  slot: KeySlot,
  model: string,
  system: string,
  prompt: string,
  imageBase64: string,
  mime: string,
  signal: AbortSignal,
): Promise<string> {
  const cfg = PROVIDERS.find((p) => p.id === slot.provider)!;
  const base = toProxied(slot.baseUrl || cfg.baseUrl);
  const chatPath =
    slot.provider === 'groq' ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const r = await fetch(chatPath, {
    method: 'POST',
    headers: {
      ...(slot.key ? { Authorization: `Bearer ${slot.key}` } : {}),
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mime};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { error?: { message?: string } }).error?.message || `HTTP ${r.status}`);
  }
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? '';
}

async function callAnthropicVision(
  slot: KeySlot,
  model: string,
  system: string,
  prompt: string,
  imageBase64: string,
  mime: string,
  signal: AbortSignal,
): Promise<string> {
  const base = toProxied(slot.baseUrl || PROVIDERS.find((p) => p.id === 'anthropic')!.baseUrl);
  const r = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': slot.key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mime, data: imageBase64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { error?: { message?: string } }).error?.message || `HTTP ${r.status}`);
  }
  const d = await r.json();
  return d.content?.[0]?.text ?? '';
}
