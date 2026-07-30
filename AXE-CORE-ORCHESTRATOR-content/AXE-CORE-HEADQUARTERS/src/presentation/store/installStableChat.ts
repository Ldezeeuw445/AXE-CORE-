/**
 * installStableChat.ts
 *
 * Boot patch for AXE identity:
 * 1. Force Fish Audio as default TTS provider (chat was falling to browser).
 * 2. Wrap sendMessage so normal chat uses a short sequential cascade
 *    (★ Primair / Gemini → fb1 → fb2 → one ollama) WITHOUT racing every key
 *    through LangGraph. Specialist/code/privacy still use the original path.
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

  stopTTS();
  stopFishAudio();

  try {
    if (isFishAudioConfigured()) localStorage.setItem(TTS_PROVIDER_KEY, 'fish');
  } catch { /* ignore */ }

  if (isFishAudioConfigured() && getFishVoiceId()) {
    void speakWithFishAudio(
      text,
      onDone,
      (err) => {
        console.warn('[AXE TTS] Fish failed, browser fallback:', err);
        speakWithBrowser(text, onDone);
      },
    );
    return;
  }
  speakWithBrowser(text, onDone);
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
    `\n\n## Huidige datum\n${new Date().toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — Amsterdam.`;

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

      const cap = classifyQuery(text);
      if (isSimpleChatCapability(cap)) {
        // Add user once; on success we never call original
        useVoiceStore.setState(s => ({
          conversation: [...s.conversation, { role: 'user' as const, text, timestamp: Date.now() }],
          voiceStatus: 'processing',
          error: null,
        }));

        const ok = await stableSimpleSend(text);
        if (ok) return;

        // Cascade failed — remove our user row so original can add it cleanly
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
