/**
 * installStableChat.ts
 *
 * Boot patch for AXE identity:
 * 1. Force Fish Audio as default TTS provider.
 * 2. Simple chat → short Gemini cascade (no LangGraph race).
 * 3. Action asks → agentic tool loop.
 * 4. "ja" / "doe maar" after a pending code-edit plan → applyPendingCodeEdit.
 * 5. Inject Architecture-assigned skills into system prompt.
 * 6. Living Display owned by installSpherePresent (no double project).
 */
import { useVoiceStore, type ConversationMessage, type RoutingEvent, writeConversationMemory } from '@/presentation/store/voiceStore';
import { extractMemoryFromMessage, buildRagContext } from '@/infrastructure/persistence/ragMemoryService';
import {
  buildStableChatCascade,
  classifyQuery,
  isSimpleChatCapability,
  preferLocalOllamaFirst,
  type KeySlot,
} from '@/domain/providers';
import { AXE_SYSTEM_PROMPT } from '@/domain/prompts';
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import { askOnDeviceModel, onDeviceModelAvailable } from '@/infrastructure/gateways/onDeviceModel';
import { isLocalOllamaUp } from '@/infrastructure/gateways/localOllama';
import { replyLanguageInstruction } from '@/domain/replyLanguage';
import { classifyChatIntent, intentBadgeLabel } from '@/domain/chatIntent';
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
import {
  applyPendingCodeEdit,
  loadPendingEdit,
} from '@/application/agents/codeEditorAgent';
import { getSkillsPromptForAgent } from '@/infrastructure/persistence/skillRegistryService';
import {
  presentAssistantReplyOnSphere,
} from '@/application/sphere/presentOnSphere';
import { toast } from 'sonner';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';
import {
  createDurableTask,
  getDurableTask,
  type DurableTaskSnapshot,
} from '@/infrastructure/gateways/axeCoreApiService';

let installed = false;
const ACTIVE_TASKS_KEY = 'axe_active_durable_tasks';
const taskMonitors = new Set<string>();

const TTS_PROVIDER_KEY = 'axe_tts_provider';
const FISH_VOICE_KEY = 'axe_fish_voice_id';

function forceFishTtsDefaults(): void {
  try {
    const voice = (localStorage.getItem(FISH_VOICE_KEY) ?? '').trim();
    if (!voice) localStorage.setItem(FISH_VOICE_KEY, LEWIS_VOICE_ID);
    const prov = localStorage.getItem(TTS_PROVIDER_KEY);
    if (!prov || prov === 'fish') localStorage.setItem(TTS_PROVIDER_KEY, 'fish');
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

function recordChatTurn(q: string, a: string, provider: string, capability: string): void {
  void writeConversationMemory(q, a, provider, capability);
  void extractMemoryFromMessage('user', q);
  void extractMemoryFromMessage('axe', a);
}

function isConfirmYes(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(ja|yes|yep|yeah|ok|okay|doe maar|ga door|go ahead|confirm|bevestig|do it|sure)[.!\s]*$/i.test(t);
}

function wantsAgenticWork(text: string): boolean {
  if (classifyChatIntent(text) === 'act') return true;
  const t = text.toLowerCase();
  if (/\b(can you|could you|able to|wil je|kun je|kan je)\b/.test(t)
    && /\b(change|fix|edit|build|check|deploy|push|open|run|modify|update|create|delete|onderzoek|wijzig|bouw|maak)\b/.test(t)) {
    return true;
  }
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

/**
 * The ordered list of providers to try, best first.
 *
 * This used to be `pickPrimarySlot()`, which built the full cascade and then
 * returned `cascade[0]` — so ★ Primary meant "Google, and if Google is down,
 * nothing". Found 2026-08-19 with the Google key dead (401
 * ACCOUNT_STATE_INVALID): the home chat simply stopped answering while the
 * trading chat, which does walk its cascade, kept working on the same config.
 *
 * Ordered, not raced. Trying every provider in parallel is what made LangGraph
 * hammer the VPS on every message; this walks the list and stops at the first
 * one that answers.
 */
function chatCascade(): KeySlot[] {
  const all = collectAllSlots();
  if (all.length === 0) return [];
  const st = useVoiceStore.getState();
  const cascade = buildStableChatCascade(all, {
    primary: st.primarySlot,
    fallback1: st.fallback1Slot,
    fallback2: st.fallback2Slot,
  });
  return cascade.length ? cascade : all.slice(0, 1);
}

/** First choice only — for callers that need a slot to label a reply with,
 *  not to make the call. */
function pickPrimarySlot(): KeySlot | null {
  return chatCascade()[0] ?? null;
}

/**
 * Runs `attempt` against each provider in turn until one succeeds.
 *
 * The slot that actually answered is handed back with the result, because the
 * reply is labelled with its provider — showing "google" on an answer Ollama
 * produced would be a small lie of exactly the kind this codebase keeps
 * getting caught by.
 */
async function withCascade<T>(
  attempt: (slot: KeySlot) => Promise<T>,
): Promise<{ value: T; slot: KeySlot }> {
  const cascade = chatCascade();
  if (!cascade.length) throw new Error('No provider configured — set one in Settings first.');

  let lastErr: unknown;
  for (const slot of cascade) {
    try {
      useVoiceStore.setState({ activeProvider: slot.provider });
      return { value: await attempt(slot), slot };
    } catch (e) {
      lastErr = e;
      console.warn(`[AXE chat] ${slot.provider}/${slot.model} failed, trying next:`, e);
    }
  }
  throw lastErr instanceof Error
    ? new Error(`All ${cascade.length} providers failed. Last: ${lastErr.message}`)
    : new Error('All providers failed');
}

function publishAxeReply(answer: string, slot: KeySlot, ok: boolean, err?: string | null, lastUserText?: string) {
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
    error: ok ? null : (err ?? null),
  }));
  {
    const phase = useSphereProjectionStore.getState().phase;
    if (phase === 'idle' || phase === 'closing') {
      void presentAssistantReplyOnSphere(answer, lastUserText).catch(() => {});
    }
  }
  speakFishFirst(answer, () => {
    useVoiceStore.setState({ voiceStatus: 'idle' });
  });
}

async function stableConfirmPendingEdit(confirmText: string): Promise<boolean> {
  const pending = loadPendingEdit();
  if (!pending) return false;
  if (!chatCascade().length) return false;

  useVoiceStore.setState({ voiceStatus: 'processing' });
  try {
    const { value: result, slot } = await withCascade(s => applyPendingCodeEdit(s));
    let answer: string;
    if (result.success) {
      answer =
        `Gedaan. ${result.repo} · ${result.filePath}` +
        (result.branch ? ` · branch ${result.branch}` : '') +
        (result.prUrl ? `\nPR: ${result.prUrl}` : '') +
        (result.commitMessage ? `\n${result.commitMessage}` : '');
    } else {
      answer = result.error || 'Wijziging mislukt.';
    }
    publishAxeReply(answer, slot, result.success, result.error);
    recordChatTurn(confirmText, answer, slot.provider, 'code_edit_confirm');
    return true;
  } catch (e) {
    console.warn('[AXE confirm edit]', e);
    return false;
  }
}

async function stableAgenticSend(text: string): Promise<boolean> {
  const slot = pickPrimarySlot();
  if (!slot) return false;

  useVoiceStore.setState({ voiceStatus: 'processing', activeProvider: slot.provider });

  try {
    const idempotencyKey = `chat-${Date.now()}-${crypto.randomUUID()}`;
    const { task } = await createDurableTask({
      title: text.slice(0, 120),
      goal: text,
      requested_by: 'luka',
      capability: 'agentic',
      execution_mode: 'execute',
      idempotency_key: idempotencyKey,
      payload: { request: text, reply_language: replyLanguageInstruction() },
      metadata: { conversation_source: 'home_chat' },
    });
    rememberActiveTask(task.id);
    const answer = `Ik heb dit als duurzame taak gestart. Ik blijf onder de motorkap doorgaan, ook als de app sluit. Taak: ${task.id.slice(0, 8)}.`;
    publishAxeReply(answer, slot, true, null, text);
    void monitorDurableTask(task.id, slot, text);

    pushRoute({
      id: `re_${Date.now()}`,
      ts: Date.now(),
      query: text.slice(0, 60),
      capability: 'code',
      specialist: 'axe_core',
      slotOrder: [slot.provider],
      attempts: [{ provider: slot.provider, model: slot.model, outcome: 'ok' }],
      winner: slot.provider,
      winnerModel: slot.model,
      via: 'fallback',
    } as RoutingEvent);

    return true;
  } catch (e: unknown) {
    console.warn('[AXE agentic] failed, falling back:', e);
    return false;
  }
}

function activeTaskIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_TASKS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function rememberActiveTask(taskId: string): void {
  try {
    localStorage.setItem(ACTIVE_TASKS_KEY, JSON.stringify([...new Set([...activeTaskIds(), taskId])]));
  } catch { /* ignore */ }
}

function forgetActiveTask(taskId: string): void {
  try {
    localStorage.setItem(ACTIVE_TASKS_KEY, JSON.stringify(activeTaskIds().filter(id => id !== taskId)));
  } catch { /* ignore */ }
}

function taskResultText(snapshot: DurableTaskSnapshot): string {
  const summary = snapshot.task.result?.summary;
  if (typeof summary === 'string' && summary.trim()) return summary.trim();
  const lastMessage = [...snapshot.events].reverse().find(event => event.message)?.message;
  return lastMessage || 'De taak is afgerond en geverifieerd.';
}

async function monitorDurableTask(taskId: string, slot: KeySlot, originalText = ''): Promise<void> {
  if (taskMonitors.has(taskId)) return;
  taskMonitors.add(taskId);
  try {
    while (true) {
      const snapshot = await getDurableTask(taskId);
      const { status } = snapshot.task;
      if (status === 'completed' || status === 'done') {
        const answer = taskResultText(snapshot);
        publishAxeReply(answer, slot, true, null, originalText);
        recordChatTurn(originalText || `durable task ${taskId}`, answer, slot.provider, 'agentic_durable');
        forgetActiveTask(taskId);
        return;
      }
      if (['failed', 'cancelled', 'rejected'].includes(status)) {
        const message = typeof snapshot.task.error?.message === 'string'
          ? snapshot.task.error.message
          : `De taak stopte met status ${status}.`;
        publishAxeReply(`Dit lukte niet: ${message}`, slot, false, message, originalText);
        forgetActiveTask(taskId);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 4_000));
    }
  } catch (error) {
    console.warn('[AXE durable task monitor]', error);
    // Keep the task id: installStableChat resumes it after the next app start.
  } finally {
    taskMonitors.delete(taskId);
  }
}

async function stableSimpleSend(text: string): Promise<boolean> {
  const cap = classifyQuery(text);
  if (!isSimpleChatCapability(cap)) return false;

  const all = collectAllSlots();
  if (all.length === 0) return false;

  const st = useVoiceStore.getState();
  let cascade = buildStableChatCascade(all, {
    primary: st.primarySlot,
    fallback1: st.fallback1Slot,
    fallback2: st.fallback2Slot,
  });
  // "Local model first when home": when the Mac Mini's own Ollama is reachable
  // and the toggle is on, put the local model at the front for simple chat.
  // The gateway then serves it locally (fast, private, no key) and falls back
  // to VPS/cloud — which is exactly what the rest of this cascade provides.
  cascade = preferLocalOllamaFirst(cascade, await isLocalOllamaUp());
  if (cascade.length === 0) return false;

  const history = st.conversation
    .slice(-10)
    .map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }));

  let skillsBlock = '';
  try {
    skillsBlock = await getSkillsPromptForAgent('axe core');
  } catch { /* ignore */ }

  // The "one memory" AXE is supposed to reason from — buildRagContext()
  // already existed (globalBrainService, RAG search over rag_memories)
  // but had no caller anywhere in the codebase: this path only ever wrote
  // memory (extractMemoryFromMessage below), never read it back, so every
  // fast reply answered from the last 10 turns of this session and nothing
  // else. A silent 1.5s budget — a slow/failed memory read degrades to "no
  // extra context" rather than delaying or breaking the reply.
  let memoryBlock = '';
  try {
    memoryBlock = await Promise.race([
      buildRagContext(text, 600),
      new Promise<string>(resolve => setTimeout(() => resolve(''), 1500)),
    ]);
  } catch { /* ignore */ }

  const system =
    AXE_SYSTEM_PROMPT +
    (skillsBlock ? `\n\n${skillsBlock}` : '') +
    (memoryBlock ? `\n\n${memoryBlock}` : '') +
    replyLanguageInstruction() +
    `\n\n## Spoken style\nNever mention model names, provider names, or routing. Just talk to Luka.\nWhen proposing a code change, always state repo, branch, and file path clearly.\n\n## Huidige datum\n${new Date().toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — Amsterdam.`;

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
      publishAxeReply(trimmed, slot, true, null, text);
      recordChatTurn(text, trimmed, slot.provider, cap);
      return true;
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
      routeEvt.attempts.push({
        provider: slot.provider,
        model: slot.model,
        outcome: 'fail',
        err: lastError.slice(0, 40),
      });
    }
  }

  // Every provider failed. On the phone there is one thing left: the model on
  // the device itself. This is the whole point of it — no signal, no VPS, no
  // key that works, and AXE still answers instead of showing an error.
  //
  // Last resort by design, never a shortcut: it is a 1B model that cannot use a
  // tool or see live data, so it must never take a request a real provider
  // could have handled. And the reply says where it came from, because an
  // offline answer is a different kind of thing and passing it off as AXE
  // proper would be the same dishonesty this codebase keeps getting caught by.
  if (onDeviceModelAvailable()) {
    try {
      const userText = messages.filter(m => m.role === 'user').pop()?.content ?? text;
      const local = await askOnDeviceModel(userText);
      const localSlot: KeySlot = { provider: 'ollama', key: '', model: 'on-device · Gemma 3 1B' };
      routeEvt.winner = 'on-device';
      routeEvt.winnerModel = 'gemma3-1b';
      routeEvt.attempts.push({ provider: 'ollama', model: 'on-device', outcome: 'ok' });
      routeEvt.via = 'fallback';
      pushRoute(routeEvt);
      publishAxeReply(
        `${local}\n\n_(answered on this phone — offline, no live data)_`,
        localSlot, true, null, text,
      );
      recordChatTurn(text, local, 'ollama', cap);
      return true;
    } catch (e) {
      console.warn('[AXE chat] on-device model failed too:', e);
    }
  }

  routeEvt.via = 'none';
  pushRoute(routeEvt);
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
  const resumeSlot = pickPrimarySlot();
  if (resumeSlot) {
    for (const taskId of activeTaskIds()) void monitorDurableTask(taskId, resumeSlot);
  }

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      if (!text?.trim()) return;

      const intent = classifyChatIntent(text);
      try { sessionStorage.setItem('axe_chat_intent', intent); } catch { /* ignore */ }
      if (intent === 'act') {
        try { console.info('[AXE]', intentBadgeLabel(intent), text.slice(0, 80)); } catch { /* ignore */ }
      }

      // Living Display: owned by installSpherePresent (outer wrapper) — do not project here

      if (isConfirmYes(text) && loadPendingEdit()) {
        useVoiceStore.setState(s => ({
          conversation: [...s.conversation, { role: 'user' as const, text, timestamp: Date.now() }],
          voiceStatus: 'processing',
          error: null,
        }));
        const ok = await stableConfirmPendingEdit(text);
        if (ok) return;
      }

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
