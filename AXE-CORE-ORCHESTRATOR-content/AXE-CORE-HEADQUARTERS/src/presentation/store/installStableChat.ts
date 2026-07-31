/**
 * installStableChat.ts
 *
 * Boot patch for AXE identity:
 * 1. Force Fish Audio as default TTS provider (chat was falling to browser).
 * 2. Wrap sendMessage so normal chat uses a short sequential cascade
 *    (★ Primair / Gemini → fb1 → fb2 → one ollama) WITHOUT racing every key
 *    through LangGraph. Specialist/code/privacy still use the original path.
 * 3. Action-style asks ("check X", "change Y", "fix Z") route through the
 *    agentic tool loop so AXE keeps working instead of one polite reply.
 */
import { useVoiceStore, type ConversationMessage, type RoutingEvent } from '@/presentation/store/voiceStore';
import {
  buildStableChatCascade,
  classifyQuery,
  isSimpleChatCapability,
  type KeySlot,
} from '@/domain/providers';
import { AXE_SYSTEM_PROMPT } from '@/domain/prompts';
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import { replyLanguageInstruction } from '@/domain/replyLanguage';
import {
  speakWithFishAudio,
  isFishAudioConfigured,
  stopFishAudio,
  LEWIS_VOICE_ID,
  setFishVoiceId,
  getFishVoiceId,
} from '@/infrastructure/gateways/fishAudioService';
import { speakWithBrowser, stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import { sanitizeForSpeech } from '@/infrastructure/gateways/globalTts';
import { runAgent } from '@/application/agents/agenticEngine';

let installed = false;

const TTS_PROVIDER_KEY = 'axe_tts_provider';
const FISH_VOICE_KEY = 'axe_fish_voice_id';

function forceFishTtsDefaults(): void {
  try {
    const voice = (localStorage.getItem(FISH_VOICE_KEY) ?? '').trim();
    if (!voice) localStorage.setItem(FISH_VOICE_KEY, LEWIS_VOICE_ID);
    const prov = localStorage.getItem(TTS_PROVIDER_KEY);
    if (!prov || prov === 'fish') {
      localStorage.setItem(TTS_PROVIDER_KEY, 'fish');
    }
  } catch { /* ignore */ }
}

function speakFishFirst(text: string, onDone?: () => void): void {
  try {
    if (localStorage.getItem('axe_response_mode') === 'type') {
      onDone?.();
      return;
    }
  } catch { /* ignore */ }

  const clean = sanitizeForSpeech(text);
  if (!clean) {
    onDone?.();
    return;
  }

  stopTTS();
  stopFishAudio();

  try {
    if (isFishAudioConfigured()) localStorage.setItem(TTS_PROVIDER_KEY, 'fish');
  } catch { /* ignore */ }

  if (isFishAudioConfigured() && getFishVoiceId()) {
    void speakWithFishAudio(
      clean,
      onDone,
      (err) => {
        console.warn('[AXE TTS] Fish failed, browser fallback:', err);
        speakWithBrowser(clean, onDone);
      },
    );
    return;
  }
  speakWithBrowser(clean, onDone);
}

/** User wants AXE to actually do work — not just chat. */
function wantsAgenticWork(text: string): boolean {
  const t = text.toLowerCase();
  // Explicit capability / change questions
  if (/\b(can you|could you|able to|wil je|kun je|kan je)\b/.test(t)
    && /\b(change|fix|edit|build|check|deploy|push|open|run|modify|update|create|delete|onderzoek|wijzig|check|bouw|maak)\b/.test(t)) {
    return true;
  }
  // Imperative / task verbs
  return /\b(check|inspect|debug|fix|change|update|edit|build|deploy|push|pull|open|run|execute|create|delete|search|fetch|read|write|onderzoek|controleer|wijzig|pas aan|bouw|maak|draai|zoek)\b/.test(t)
    && t.trim().split(/\s+/).length >= 3;
}

function collectAllSlots(): KeySlot[] {
  const st = useVoiceStore.getState();
  const slots: KeySlot[] = [];
  const push = (s: KeySlot | null | undefined) => {
    if (s?.provider && !slots.some(x => x.provider === s.provider)) slots.push(s);
  };
  push(st.primarySlot);
  push(st.fallback1Slot);
  push(st.fallback2Slot);
  push(st.fallback3Slot);

  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<
      string,
      { key?: string; model?: string; baseUrl?: string } | undefined
    >;
    for (const [id, c] of Object.entries(conns)) {
      if (!c?.key || c.key.length < 4) continue;
      if (slots.some(s => s.provider === id)) continue;
      slots.push({
        provider: id as KeySlot['provider'],
        key: c.key,
        model: c.model,
        baseUrl: c.baseUrl,
      });
    }
  } catch { /* ignore */ }

  return slots;
}

function pushRoute(evt: RoutingEvent): void {
  useVoiceStore.setState(s => {
    const updated = [evt, ...s.routingLog].slice(0, 50);
    try {
      localStorage.setItem('axe_routing_log', JSON.stringify(updated));
    } catch { /* ignore */ }
    return { routingLog: updated };
  });
}

function pickPrimarySlot(): KeySlot | null {
  const all = collectAllSlots();
  if (all.length === 0) return null;
  const st = useVoiceStore.getState();
  const cascade = buildStableChatCascade(all, {
    primary: st.primarySlot,
    fallback1: st.fallback1Slot,
    fallback2: st.fallback2Slot,
  });
  return cascade[0] ?? all[0] ?? null;
}

/** Multi-step tool loop for "actually do the thing" requests. */
async function stableAgenticSend(text: string): Promise<boolean> {
  const slot = pickPrimarySlot();
  if (!slot) return false;

  const conversationId = `agentic_${Date.now()}`;
  useVoiceStore.setState({ voiceStatus: 'processing', activeProvider: slot.provider });

  try {
    const result = await runAgent(text, conversationId, slot, {
      userId: 'luka',
      agentName: 'axe-core-agent',
    });

    const answer = (result.finalAnswer || '').trim()
      || (result.error ? `Dat lukte niet: ${result.error}` : 'Klaar — zie AI Core logs voor details.');

    const axeMsg: ConversationMessage = {
      role: 'axe',
      text: answer,
      timestamp: Date.now(),
      provider: slot.provider,
      model: slot.model,
    };

    useVoiceStore.setState(s => ({
      conversation: [...s.conversation, axeMsg],
      response: answer,
      voiceStatus: 'speaking',
      activeProvider: slot.provider,
      error: result.success ? null : (result.error ?? null),
    }));

    speakFishFirst(answer, () => {
      useVoiceStore.setState({ voiceStatus: 'idle' });
    });

    pushRoute({
      id: `re_${Date.now()}`,
      ts: Date.now(),
      query: text.slice(0, 60),
      capability: 'code',
      specialist: 'axe_core',
      slotOrder: [slot.provider],
      attempts: [{ provider: slot.provider, model: slot.model, outcome: result.success ? 'ok' : 'fail' }],
      winner: slot.provider,
      winnerModel: slot.model,
      via: 'agentic',
    } as RoutingEvent);

    console.info(`[AXE agentic] ${result.success ? '✓' : '✗'} ${slot.provider} ${result.latencyMs}ms`);
    return true;
  } catch (e: unknown) {
    console.warn('[AXE agentic] failed, falling back:', e);
    return false;
  }
}

/** Fast sequential path — no LangGraph import, max 3 slots. Assumes user msg already in conversation. */
async function stableSimpleSend(text: string): Promise<boolean> {
  const cap = classifyQuery(text);
  if (!isSimpleChatCapability(cap)) return false;

  const all = collectAllSlots();
  if (all.length === 0) return false;

  const st = useVoiceStore.getState();
  const cascade = buildStableChatCascade(all, {
    primary: st.primarySlot,
    fallback1: st.fallback1Slot,
    fallback2: st.fallback2Slot,
  });
  if (cascade.length === 0) return false;

  const history = st.conversation
    .slice(-10)
    .map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }));

  const system =
    AXE_SYSTEM_PROMPT +
    replyLanguageInstruction() +
    `\n\n## Spoken style\nNever mention model names, provider names, or routing. Just talk to Luka.\nIf he asks you to check or change something and you cannot execute tools in this turn, say clearly what you will do next — do not only restate capability.\n\n## Huidige datum\n${new Date().toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — Amsterdam.`;

  const messages = [
    { role: 'system' as const, content: system },
    ...history.slice(0, -1),
    { role: 'user' as const, content: text },
  ];

  const routeEvt: RoutingEvent = {
    id: `re_${Date.now()}`,
    ts: Date.now(),
    query: text.slice(0, 60),
    capability: cap,
    specialist: 'axe_core',
    slotOrder: cascade.map(s => s.provider),
    attempts: [],
    via: 'fallback',
  };

  let lastError = '';
  for (const slot of cascade) {
    try {
      const raw = await callProvider(slot, messages);
      const trimmed = raw.trim();
      if (!trimmed) continue;

      routeEvt.winner = slot.provider;
      routeEvt.winnerModel = slot.model;
      routeEvt.attempts.push({ provider: slot.provider, model: slot.model, outcome: 'ok' });
      pushRoute(routeEvt);

      const axeMsg: ConversationMessage = {
        role: 'axe',
        text: trimmed,
        timestamp: Date.now(),
        provider: slot.provider,
        model: slot.model,
      };

      useVoiceStore.setState(s => ({
        conversation: [...s.conversation, axeMsg],
        response: trimmed,
        voiceStatus: 'speaking',
        activeProvider: slot.provider,
        error: null,
      }));

      speakFishFirst(trimmed, () => {
        useVoiceStore.setState({ voiceStatus: 'idle' });
      });

      console.info(
        `[AXE stable] ✓ ${slot.provider}/${slot.model} cascade=${cascade.map(c => c.provider).join('→')}`,
      );
      return true;
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
      routeEvt.attempts.push({
        provider: slot.provider,
        model: slot.model,
        outcome: 'fail',
        err: lastError.slice(0, 40),
      });
      console.warn(`[AXE stable] ✗ ${slot.provider}:`, lastError);
    }
  }

  routeEvt.via = 'none';
  pushRoute(routeEvt);
  console.warn('[AXE stable] cascade exhausted, original path:', lastError);
  return false;
}

export function installStableChat(): void {
  if (installed) return;
  installed = true;

  forceFishTtsDefaults();
  try {
    if (!getFishVoiceId()) setFishVoiceId(LEWIS_VOICE_ID);
  } catch { /* ignore */ }

  const original = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      if (!text?.trim()) return;

      // Action intents → agentic tool loop first (keeps working until done)
      if (wantsAgenticWork(text)) {
        useVoiceStore.setState(s => ({
          conversation: [...s.conversation, { role: 'user' as const, text, timestamp: Date.now() }],
          voiceStatus: 'processing',
          error: null,
        }));
        const ok = await stableAgenticSend(text);
        if (ok) return;

        const conv = useVoiceStore.getState().conversation;
        if (
          conv.length > 0 &&
          conv[conv.length - 1]?.role === 'user' &&
          conv[conv.length - 1]?.text === text
        ) {
          useVoiceStore.setState({ conversation: conv.slice(0, -1) });
        }
      }

      const cap = classifyQuery(text);
      if (isSimpleChatCapability(cap)) {
        useVoiceStore.setState(s => ({
          conversation: [...s.conversation, { role: 'user' as const, text, timestamp: Date.now() }],
          voiceStatus: 'processing',
          error: null,
        }));

        const ok = await stableSimpleSend(text);
        if (ok) return;

        const conv = useVoiceStore.getState().conversation;
        if (
          conv.length > 0 &&
          conv[conv.length - 1]?.role === 'user' &&
          conv[conv.length - 1]?.text === text
        ) {
          useVoiceStore.setState({ conversation: conv.slice(0, -1) });
        }
      }

      await original(text);
    },
  });
}
