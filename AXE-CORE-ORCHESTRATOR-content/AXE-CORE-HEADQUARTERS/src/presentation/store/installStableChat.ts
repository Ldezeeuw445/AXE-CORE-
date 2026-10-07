/**
 * installStableChat.ts
 *
 * Boot patch for AXE identity:
 * 1. Keep one canonical AXE speech identity through globalTts
 *    (domain/stemIdentiteit is the one place that names it).
 * 2. Simple chat → short cascade, streamed; RAG/TTS blokkeren first-token niet.
 * 3. Action asks → agentic tool loop.
 * 4. "ja" / "doe maar" after a pending code-edit plan → applyPendingCodeEdit.
 * 5. Inject Architecture-assigned skills into system prompt.
 * 6. Living Display owned by installSpherePresent (no double project).
 */
import { terugkomstContext } from '@/application/axe/terugkomst';
import { useVoiceStore, type ConversationMessage, type RoutingEvent, writeConversationMemory } from '@/presentation/store/voiceStore';
import { extractMemoryFromMessage, buildRagContext } from '@/infrastructure/persistence/ragMemoryService';
import {
  buildStableChatCascade,
  classifyQuery,
  isSimpleChatCapability,
  type KeySlot,
} from '@/domain/providers';
import { AXE_SYSTEM_PROMPT, CONVERSATION_FIRST_RULE } from '@/domain/prompts';
import { streamProvider } from '@/infrastructure/gateways/llmStream';
import { voorwerkVoorFirstToken } from '@/domain/chatLatency';
import { volgendeAxeBericht } from '@/application/chat/chatStreamBeurt';
import { noteRetrieval, noteOwnerOutcome } from '@/infrastructure/persistence/memoryFeedbackService';
import { askOnDeviceModel, onDeviceModelAvailable } from '@/infrastructure/gateways/onDeviceModel';
import { replyLanguageInstruction } from '@/domain/replyLanguage';
import { classifyChatIntent, intentBadgeLabel, isSocialChatTurn } from '@/domain/chatIntent';
import { zichtbareAxeAntwoord } from '@/domain/tools/toolLeak';
import { runNativeToolLoop } from '@/application/tools/nativeToolLoop';
import { supportsNativeTools } from '@/infrastructure/gateways/llmToolGateway';
import { nativeToolsEnabled, requestActionApproval } from '@/presentation/store/voiceStore';
import { TOOL_RUNTIMES } from '@/application/tools/toolRegistry';
import { speakGlobal, stopGlobalTts } from '@/infrastructure/gateways/globalTts';
import { startAxeSpraakStroom } from '@/application/tierRouter/stroomSpraak';
import { markBeurt } from '@/domain/beurtKlok';
import { pushBeurtLatentie, voerJobsUit } from '@/presentation/store/installTierRouter';
import { classifyAxeTier } from '@/domain/tierRouter/axeRoute';
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
import { collectAllSlots } from '@/presentation/store/chatSlots';
import { slotsVoorAgent } from '@/domain/agents/motorScope';

let installed = false;

function speakAxe(text: string, onDone?: () => void): void {
  try {
    if (localStorage.getItem('axe_response_mode') === 'type') { onDone?.(); return; }
  } catch { /* ignore */ }
  stopGlobalTts();
  speakGlobal(
    text,
    onDone,
    (reason) => useVoiceStore.setState({ error: reason }),
  );
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
  // AXE's voice is a fast chat model, never a coding subscription (claude/codex/
  // cursor) and never Ollama. Overlaying axe-core's subscription here is what
  // made Codex answer as AXE. De regel zelf staat in roster.ts
  // (dropdownScope: 'fast-smart') en wordt afgedwongen door motorScope.ts --
  // hier stond `zonderAbonnement()`, en die haalt alleen het abonnement weg.
  // Ollama bleef dus gewoon in de cascade staan terwijl het commentaar eronder
  // zei dat AXE die nooit krijgt: de lijst in Settings sloot hem uit, de
  // cascade niet.
  const cascade = slotsVoorAgent('axe', buildStableChatCascade(all, {
    primary: st.primarySlot,
    fallback1: st.fallback1Slot,
    fallback2: st.fallback2Slot,
  }));
  return cascade.length ? cascade : slotsVoorAgent('axe', all).slice(0, 1);
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
  const visible = zichtbareAxeAntwoord(answer) || answer;
  const axeMsg: ConversationMessage = {
    role: 'axe',
    text: visible,
    timestamp: Date.now(),
    provider: slot.provider,
    model: slot.model,
  };
  useVoiceStore.setState(s => ({
    conversation: [...s.conversation, axeMsg],
    response: visible,
    voiceStatus: 'speaking',
    activeProvider: slot.provider,
    error: ok ? null : (err ?? null),
  }));
  {
    const phase = useSphereProjectionStore.getState().phase;
    if (phase === 'idle' || phase === 'closing') {
      void presentAssistantReplyOnSphere(visible, lastUserText).catch(() => {});
    }
  }
  speakAxe(visible, () => {
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

/**
 * Do the work now, with real tools, instead of queueing it.
 *
 * This runs before the durable-task path and is the answer to the thing that
 * made AXE feel broken: `wantsAgenticWork` fires on any three-word message
 * containing a verb like "check", "zoek" or "open", so "search the web for the
 * bitcoin price" became a core_tasks row with capability 'agentic' — for which
 * no worker is running. AXE replied "I've started this as a durable task",
 * which was true, and nothing ever happened, which was invisible.
 *
 * A tool call that can be answered in four rounds should be answered, not
 * filed. The durable path stays for what it is actually for: work that should
 * survive the app being closed.
 *
 * Returns false when it cannot run, so the caller falls through unchanged.
 */
async function stableNativeToolSend(text: string): Promise<boolean> {
  if (!nativeToolsEnabled()) return false;

  const slot = pickPrimarySlot();
  if (!slot || !supportsNativeTools(slot)) return false;

  useVoiceStore.setState({ voiceStatus: 'processing', activeProvider: slot.provider });

  try {
    const sys = `${AXE_SYSTEM_PROMPT}\n\n${replyLanguageInstruction()}`;
    const r = await runNativeToolLoop(
      slot,
      [{ role: 'system', content: sys }, { role: 'user', content: text }],
      {
        // The real gate, not a copy: same card, same trust ladder, same
        // auto-run notification and reflection. Default-deny stands — the
        // only way past it is Luka clicking approve, or a category he
        // himself flipped in Settings.
        requestApproval: async (kind, title, detail) => {
          console.info(
            `%c[AXE] approval%c ${kind} — ${title}`,
            'color:#F59E0B;font-weight:600', 'color:inherit',
          );
          const ok = await requestActionApproval(kind, title, detail);
          console.info(
            `%c[AXE] approval%c ${kind} — ${ok ? 'goedgekeurd' : 'geweigerd'}`,
            ok ? 'color:#10B981;font-weight:600' : 'color:#EF4444;font-weight:600', 'color:inherit',
          );
          return ok;
        },
      },
    );

    if (!r.text.trim()) return false;

    console.info(
      `%c[AXE] route%c native tools · ${slot.provider} · ${r.rounds} ronde(s) · ${r.ranTools.join(', ') || 'geen tools'}`,
      'color:#10B981;font-weight:600', 'color:inherit',
    );
    publishAxeReply(r.text, slot, true, null, text);
    return true;
  } catch (e) {
    console.warn('[AXE] native tools failed, falling through:', e);
    return false;
  }
}

/**
 * Dit is werk, geen gesprek: door de tier-router als gewone achtergrondjob.
 *
 * Hier stond een tweede uitvoering van precies dat: een eigen
 * `createDurableTask`, een eigen `axe_active_durable_tasks` in localStorage,
 * een eigen poller van 4 s zonder limiet of backoff, en een eigen
 * aankondiging. Gevolg: een taak die hier begon verscheen niet in de
 * agents-balk, niet in de chips op de telefoon, niet in de vensters rond de
 * bol, en er was niets tegen te zeggen -- "stop die" kende hem niet.
 *
 * `voerJobsUit` doet alles wat dit deed, plus het register, de besturing, en
 * een monitor die wél een einde kent.
 */
async function stableAgenticSend(text: string): Promise<boolean> {
  try {
    return voerJobsUit(text, [{ text, route: classifyAxeTier(text) }]);
  } catch (e) {
    console.warn('[AXE agentic] kon geen job starten, val terug:', e);
    return false;
  }
}


async function stableSimpleSend(text: string): Promise<boolean> {
  const cap = classifyQuery(text);
  if (!isSimpleChatCapability(cap)) return false;

  const all = collectAllSlots();
  if (all.length === 0) return false;

  const st = useVoiceStore.getState();
  // Same rule as chatCascade: AXE speaks through a real chat model, not a coding
  // subscription. Strip subscriptions so your chosen brain answers.
  //
  // "Local model first" used to also apply here when nothing was pinned
  // (AXE Native) -- that's exactly the "AXE never gets Ollama" rule (Settings'
  // AXE Core row, domain/chatModelKeuzes.ts) being quietly overruled the one
  // time you left AXE on auto. The toggle is for the tier-2 workers/CrewAI,
  // not for AXE's own brain -- removed here, not repurposed here.
  const cascade = slotsVoorAgent('axe', buildStableChatCascade(all, {
    primary: st.primarySlot,
    fallback1: st.fallback1Slot,
    fallback2: st.fallback2Slot,
  }));
  if (cascade.length === 0) return false;

  const history = st.conversation
    .slice(-10)
    .map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }));

  // Leerlus #172: open de beurt nu, synchroon, zonder embeddings. RAG
  // en skills lopen mee maar houden first-token niet meer tegen (budget 0).
  noteRetrieval(text, [], [], 'chat');
  const { memoryBlock, skillsBlock } = await voorwerkVoorFirstToken({
    rag: buildRagContext(text, 600).catch(() => ''),
    skills: getSkillsPromptForAgent('axe core').catch(() => ''),
  });

  const system =
    AXE_SYSTEM_PROMPT +
    (skillsBlock ? `\n\n${skillsBlock}` : '') +
    (memoryBlock ? `\n\n${memoryBlock}` : '') +
    terugkomstContext() +
    replyLanguageInstruction() +
    `\n\n${CONVERSATION_FIRST_RULE}` +
    (isSocialChatTurn(text)
      ? `\n\nThis message is a greeting. Reply with a short hello. No tools. No markers. No mention of tools.`
      : '') +
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

  const toonStream = (partial: string, slot: KeySlot, axeTs: number) => {
    useVoiceStore.setState(s => ({
      conversation: volgendeAxeBericht(s.conversation, partial, slot, axeTs) as ConversationMessage[],
      response: partial,
      voiceStatus: 'processing' as const,
      activeProvider: slot.provider,
      error: null,
    }));
  };

  const wisStream = (axeTs: number) => {
    if (!axeTs) return;
    useVoiceStore.setState(s => ({
      conversation: s.conversation.filter(m => !(m.role === 'axe' && m.timestamp === axeTs)),
    }));
  };

  let lastError = '';
  for (const slot of cascade) {
    let axeTs = 0;
    const stroom = startAxeSpraakStroom({
      onFirstAudio: () => {
        markBeurt('firstAudio');
        pushBeurtLatentie();
        useVoiceStore.setState({ voiceStatus: 'speaking' });
      },
      onDone: () => useVoiceStore.setState({ voiceStatus: 'idle' }),
      onError: (reason) => useVoiceStore.setState({ error: reason }),
    });
    try {
      const raw = await streamProvider(slot, messages, (_delta, full) => {
        const visible = zichtbareAxeAntwoord(full);
        if (!visible.trim()) return;
        if (!axeTs) {
          axeTs = Date.now();
          markBeurt('firstToken');
          pushBeurtLatentie();
        }
        stroom.voer(visible);
        toonStream(visible, slot, axeTs);
      });
      const trimmed = zichtbareAxeAntwoord(raw).trim();
      if (!trimmed) {
        stroom.stop();
        wisStream(axeTs);
        continue;
      }
      if (!axeTs) axeTs = Date.now();
      stroom.sluit();

      routeEvt.winner = slot.provider;
      routeEvt.winnerModel = slot.model;
      routeEvt.attempts.push({ provider: slot.provider, model: slot.model, outcome: 'ok' });
      pushRoute(routeEvt);
      toonStream(trimmed, slot, axeTs);
      {
        const phase = useSphereProjectionStore.getState().phase;
        if (phase === 'idle' || phase === 'closing') {
          void presentAssistantReplyOnSphere(trimmed, text).catch(() => {});
        }
      }
      noteOwnerOutcome('chat', 'good');
      recordChatTurn(text, trimmed, slot.provider, cap);
      return true;
    } catch (e: unknown) {
      stroom.stop();
      wisStream(axeTs);
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
      noteOwnerOutcome('chat', 'good');
      recordChatTurn(text, local, 'ollama', cap);
      return true;
    } catch (e) {
      console.warn('[AXE chat] on-device model failed too:', e);
    }
  }

  routeEvt.via = 'none';
  pushRoute(routeEvt);
  noteOwnerOutcome('chat', 'poor');
  return false;
}

export function installStableChat(): void {
  if (installed) return;
  installed = true;

  const original = useVoiceStore.getState().sendMessage;
  // Het hervatten van lopende taken staat in installTierRouter
  // (hervatJobMonitors): één register, één plek die het weer oppakt.

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
        // Answer it now if we can; only file it if we cannot.
        const answered = await stableNativeToolSend(text);
        if (answered) return;
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
