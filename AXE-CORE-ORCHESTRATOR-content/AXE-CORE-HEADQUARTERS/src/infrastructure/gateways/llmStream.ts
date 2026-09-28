/**
 * Streaming LLM-aanroep voor de AXE-chat.
 *
 * callProvider wacht op de hele body. Dat is prima voor agents en tools;
 * voor de baas-chat ernaast de composer is het de stilte tot first token.
 *
 * stream:true naar /proxy/ai. Oude VPS'en negeren het veld en geven JSON
 * terug — dan vuurt onToken één keer met de hele tekst (geen regressie).
 * Nieuwe VPS'en sturen text/event-stream; dan komt elke delta meteen.
 */
import { PROVIDERS, VPS_BRIDGE_PROVIDER_IDS, type KeySlot, type ProviderCfg } from '@/domain/providers';
import { findCustomProvider } from '@/domain/customProviders';
import { ABONNEMENT_PROVIDER } from '@/domain/abonnementChat';
import { aiProxyUrl, vpsAuthHeaders } from '@/infrastructure/config/apiUrl';
import { sanitizeLlmText } from '@/infrastructure/gateways/sanitizeLlmText';
import { proxyErrorMessage } from '@/domain/proxyError';
import { proxyProviderNaam } from '@/domain/proxyProvider';
import { herstelModelNaam } from '@/domain/modelHerstel';
import { isLocalOllamaUp, LOCAL_OLLAMA_URL, LOCAL_KEEP_ALIVE } from '@/infrastructure/gateways/localOllama';
import { ollamaHeaders } from '@/infrastructure/config/ollamaSleutel';
import { callProvider } from '@/infrastructure/gateways/llmGateway';

export type StreamTokenFn = (delta: string, full: string) => void;

/** Eén SSE-blok (`data: ...`) → tekstdelta, of leeg. */
export function deltaUitSseBlok(blok: string): string {
  const regels = blok.split(/\r?\n/);
  let uit = '';
  for (const regel of regels) {
    const t = regel.trim();
    if (!t.startsWith('data:')) continue;
    const raw = t.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    uit += deltaUitJson(raw);
  }
  return uit;
}

export function deltaUitJson(raw: string): string {
  try {
    const d = JSON.parse(raw) as {
      delta?: string;
      text?: string;
      message?: { content?: string };
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (typeof d.delta === 'string') return d.delta;
    if (typeof d.text === 'string' && !d.choices) return d.text;
    const choice = d.choices?.[0];
    if (typeof choice?.delta?.content === 'string') return choice.delta.content;
    if (typeof choice?.message?.content === 'string') return choice.message.content;
    const part = d.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof part === 'string') return part;
    if (typeof d.message?.content === 'string') return d.message.content;
    return '';
  } catch {
    return '';
  }
}

export function isEventStream(contentType: string | null): boolean {
  return (contentType ?? '').toLowerCase().includes('text/event-stream');
}

export async function leesTokenStream(
  body: ReadableStream<Uint8Array>,
  onToken: StreamTokenFn,
): Promise<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const stukken = buf.split(/\r?\n\r?\n/);
    buf = stukken.pop() ?? '';
    for (const stuk of stukken) {
      const delta = deltaUitSseBlok(stuk) || deltaUitNdjsonRegel(stuk);
      if (!delta) continue;
      full += delta;
      onToken(delta, sanitizeLlmText(full) || full);
    }
  }
  if (buf.trim()) {
    const delta = deltaUitSseBlok(buf) || deltaUitNdjsonRegel(buf) || deltaUitJson(buf);
    if (delta) {
      full += delta;
      onToken(delta, sanitizeLlmText(full) || full);
    }
  }
  return sanitizeLlmText(full) || full;
}

function deltaUitNdjsonRegel(stuk: string): string {
  const regel = stuk.trim();
  if (!regel.startsWith('{')) return '';
  return deltaUitJson(regel);
}

function slotCfg(slot: KeySlot): ProviderCfg {
  const builtin = PROVIDERS.find(p => p.id === slot.provider);
  const custom = builtin ? undefined : findCustomProvider(slot.provider);
  const cfg = builtin ?? (custom
    ? {
        id: custom.id as ProviderCfg['id'],
        name: custom.name,
        baseUrl: custom.baseUrl,
        defaultModel: custom.defaultModel,
        format: custom.format,
        needsKey: custom.needsKey,
      }
    : undefined);
  if (!cfg) throw new Error(`Unknown provider: ${slot.provider}`);
  return cfg;
}

async function streamNativeOllama(
  slot: KeySlot,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  onToken: StreamTokenFn,
  target: string,
): Promise<string> {
  const cfg = slotCfg(slot);
  const model = herstelModelNaam(slot.provider, slot.model) || cfg.defaultModel;
  const root = target.replace(/\/+$/, '');
  const r = await fetch(`${root}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ollamaHeaders(root) },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      think: false,
      keep_alive: LOCAL_KEEP_ALIVE,
      options: { num_predict: 2048, temperature: 0.7 },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok || !r.body) throw new Error(`Ollama ${model} HTTP ${r.status}`);
  return leesTokenStream(r.body, onToken);
}

async function streamViaAiProxy(
  slot: KeySlot,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  onToken: StreamTokenFn,
): Promise<string> {
  const cfg = slotCfg(slot);
  const model = herstelModelNaam(slot.provider, slot.model) || cfg.defaultModel;
  const url = aiProxyUrl();
  const isOllama = slot.provider === 'ollama' || slot.provider === 'hermes';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...vpsAuthHeaders(url) },
    body: JSON.stringify({
      provider: proxyProviderNaam(slot.provider),
      key: slot.key,
      model,
      format: cfg.format,
      baseUrl: slot.baseUrl ?? cfg.baseUrl,
      messages,
      stream: true,
    }),
    signal: AbortSignal.timeout(isOllama ? 120_000 : 25_000),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(proxyErrorMessage(body, r.status));
  }
  if (r.body && isEventStream(r.headers.get('content-type'))) {
    return leesTokenStream(r.body, onToken);
  }
  const raw = await r.text();
  try {
    const d = JSON.parse(raw) as { text?: string };
    const text = sanitizeLlmText(d.text ?? raw);
    if (text) onToken(text, text);
    return text;
  } catch {
    const text = sanitizeLlmText(raw);
    if (text) onToken(text, text);
    return text;
  }
}

/**
 * Stream tokens naar `onToken` zodra ze er zijn. Faalt de stream, dan dezelfde
 * gebufferde callProvider als de rest van de app — de UI krijgt dan één update.
 */
export async function streamProvider(
  slot: KeySlot,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  onToken?: StreamTokenFn,
): Promise<string> {
  const meld: StreamTokenFn = (delta, full) => { onToken?.(delta, full); };

  if (slot.provider === ABONNEMENT_PROVIDER || VPS_BRIDGE_PROVIDER_IDS.has(slot.provider)) {
    const text = await callProvider(slot, messages);
    if (text.trim()) meld(text, text);
    return text;
  }

  const isOllama = slot.provider === 'ollama' || slot.provider === 'hermes';
  if (isOllama && await isLocalOllamaUp()) {
    try {
      return await streamNativeOllama(slot, messages, meld, LOCAL_OLLAMA_URL);
    } catch {
      /* zelfde val als callProvider: verder naar de proxy */
    }
  }

  if (import.meta.env.PROD) {
    try {
      return await streamViaAiProxy(slot, messages, meld);
    } catch {
      /* gebufferd, zodat een kapotte stream de chat niet stillegt */
    }
  }

  const text = await callProvider(slot, messages);
  if (text.trim()) meld(text, text);
  return text;
}
