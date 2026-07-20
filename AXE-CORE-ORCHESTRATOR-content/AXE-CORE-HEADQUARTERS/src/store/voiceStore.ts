/**
 * store/voiceStore.ts
 *
 * UI state + conversation orchestration for the AXE voice/chat experience.
 *
 * This store used to be an 800-line god module that also contained the
 * provider registry, the HTTP gateway for four wire formats, routing policy,
 * credential resolution, and speech I/O. Those concerns now live in:
 *
 *   - core/llm/*                      provider registry, routing policy, prompts, types
 *   - infrastructure/llm/*            provider gateway (callProvider), slot resolver
 *   - infrastructure/voice/speech     STT/TTS adapters
 *   - infrastructure/persistence/*    routing-log persistence
 *
 * The store keeps only what a UI store should: Zustand state, user-visible
 * transitions, and the sendMessage pipeline that wires the pieces together.
 * All previous exports are re-exported below so existing imports keep working.
 */

import { create } from 'zustand';
import { logMessage } from '@/services/coreDB';
import { classifyQueryDynamic, loadCapabilities, getAgentSystemPrompt } from '@/services/capabilityService';
import { buildWorkflow, formatBuildResult } from '@/services/workflowBuilder';
import { getSystemSummary, checkAllServices } from '@/services/systemService';
import { loadSetting, saveSetting } from '@/services/userSettingsService';
import { loadMessages, saveMessage, AXE_USER_ID, loadAllConversations, createNewConversationId, APP_SOURCE, saveConversationLocal, loadConversationLocal } from '@/services/chatPersistence';
import type { ConversationSummary } from '@/services/chatPersistence';
import { isAxeApiConfigured, crewRun, checkAxeApi } from '@/services/axeCoreApiService';
import { detectChatAction, type ChatAction } from '@/services/chatActionService';
import { getEveSystemPromptSupplement } from '@/lib/eveSkills';
import { saveGlobalMemory, buildGlobalMemoryContext } from '@/services/globalMemoryService';
import { getSupabase } from '@/lib/supabaseClient';
import { tavilySearch, tavilyConfigured, formatTavilyResults } from '@/services/tavilyService';
import { browseFetch, formatBrowseResult } from '@/services/browserFetchService';

import type { ChatMessage, KeySlot, ProviderId, QueryCapability, RoutingEvent } from '@/core/llm/types';
import { PROVIDERS } from '@/core/llm/providers';
import { AXE_SYSTEM_PROMPT } from '@/core/llm/prompts';
import { classifyQuery, selectByCapability, prioritizeOllamaSlots, capabilityToSpecialists, shortErr } from '@/core/llm/routingPolicy';
import { callProvider } from '@/infrastructure/llm/providerGateway';
import { getAllConfiguredSlots } from '@/infrastructure/llm/slotResolver';
import { speakSafely, stopTTS, getRecognizer, stopRecognizer, recognitionSupported } from '@/infrastructure/voice/speech';
import { loadRoutingLog, saveRoutingLog, clearRoutingLog as clearRoutingLogStore } from '@/infrastructure/persistence/routingLogStore';
import { readJSON, readString, writeString } from '@/infrastructure/storage/localStore';

/* ── Backwards-compatible re-exports ─────────────────────────────────────
 * Everything below used to be defined in this file. Existing importers
 * (services, pages, components) keep working; new code should import from
 * the core/infrastructure modules directly. */
export type { KeySlot, ProviderId, RoutingEvent } from '@/core/llm/types';
export type { ProviderCfg } from '@/core/llm/types';
export { PROVIDERS, migrateModel } from '@/core/llm/providers';
export { AXE_SYSTEM_PROMPT } from '@/core/llm/prompts';
export { capabilityToSpecialists } from '@/core/llm/routingPolicy';
export { callProvider, toProxied } from '@/infrastructure/llm/providerGateway';

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';

type MsgArray = ChatMessage[];
type SlotMsgBuilder = (provider: string, msgs: MsgArray) => MsgArray;

/**
 * Resolve model-initiated tool calls in a response.
 * Handles [SEARCH: "query"] and [FETCH: "url"] markers.
 * Executes tools, feeds results back, repeats up to maxIter rounds.
 */
async function resolveModelToolCalls(
  response: string,
  slot: KeySlot,
  messages: MsgArray,
  buildSlotMsgs: SlotMsgBuilder,
  maxIter = 3
): Promise<string> {
  let current = response;
  for (let i = 0; i < maxIter; i++) {
    // Detect the first tool call in the response (SEARCH or FETCH)
    const searchMatch = current.match(/\[SEARCH:\s*"?([^"\]\n]{5,250})"?\]/);
    const fetchMatch = current.match(/\[FETCH:\s*"?(https?:\/\/[^"\]\n]{5,500})"?\]/);
    if (!searchMatch && !fetchMatch) break;

    let resultBlock = '';
    try {
      if (searchMatch && tavilyConfigured()) {
        const query = searchMatch[1].trim();
        const results = await tavilySearch(query, { maxResults: 4, depth: 'basic' });
        resultBlock = results.length > 0 ? formatTavilyResults(results, query) : `No search results found for "${query}".`;
      } else if (fetchMatch) {
        const url = fetchMatch[1].trim();
        const result = await browseFetch(url);
        resultBlock = formatBrowseResult(result, url);
      } else break;
    } catch { break; }

    if (!resultBlock) break;

    const followUp = buildSlotMsgs(slot.provider, [
      ...messages,
      { role: 'assistant' as const, content: current },
      { role: 'user' as const, content: `${resultBlock}\n\nGeef nu je volledige antwoord op basis van deze informatie. Verwijder alle [SEARCH:...] en [FETCH:...] markers uit je antwoord.` },
    ]);
    try { current = await callProvider(slot, followUp); } catch { break; }
  }
  // Strip any leftover markers from the final response
  return current
    .replace(/\[SEARCH:\s*"?[^"\]\n]*"?\]/g, '')
    .replace(/\[FETCH:\s*"?[^"\]\n]*"?\]/g, '')
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

async function logRoute(message: string, metadata: Record<string, unknown> = {}) {
  await logMessage('info', 'axe-core-router', message, { route_path: 'AXE CORE > Orchestrator > Capability Router', ...metadata }).catch(() => {});
}

export interface ConversationMessage { role: 'user' | 'axe'; text: string; timestamp: number; provider?: string; model?: string; slotErrors?: string; }

export type PendingChatAction = { kind: 'navigate'; path: string; label: string } | { kind: 'open_url'; url: string };

interface VoiceState {
  primarySlot: KeySlot | null; fallback1Slot: KeySlot | null; fallback2Slot: KeySlot | null; fallback3Slot: KeySlot | null; activeProvider: ProviderId | null;
  voiceStatus: VoiceStatus; transcript: string; response: string; conversation: ConversationMessage[]; sessionId: string; error: string | null;
  recognitionSupported: boolean; micPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  allConversations: ConversationSummary[]; isLoadingConversations: boolean;
  apiKey: string; apiKeyValid: boolean | null;
  pendingAction: PendingChatAction | null; clearPendingAction: () => void;
  routingLog: RoutingEvent[];
  isGeminiLive: boolean;
  responseMode: 'speak' | 'type';
  vpsOnline: boolean | null; // null=unknown, true=reachable, false=offline
  setResponseMode: (mode: 'speak' | 'type') => void;
  checkVpsStatus: () => Promise<void>;
  setPrimarySlot: (slot: KeySlot | null) => void; setFallback1Slot: (slot: KeySlot | null) => void; setFallback2Slot: (slot: KeySlot | null) => void; setFallback3Slot: (slot: KeySlot | null) => void;
  refreshConfiguration: () => Promise<void>; setApiKey: (key: string) => void; testApiKey: () => Promise<boolean>; testSlot: (slot: KeySlot) => Promise<boolean>;
  clearError: () => void; setError: (e: string | null) => void; clearConversation: () => void; clearRoutingLog: () => void;
  loadConversation: () => Promise<void>; loadAllConversations: () => Promise<void>; switchConversation: (id: string) => Promise<void>; startNewConversation: () => void;
  checkMicPermission: () => Promise<void>; startListening: () => Promise<void>; stopListening: () => void; sendMessage: (text: string) => Promise<void>;
}

function loadSlot(name: string): KeySlot | null { return readJSON<KeySlot | null>(name, null); }
function saveSlot(name: string, slot: KeySlot | null) { try { if (slot) { localStorage.setItem(name, JSON.stringify(slot)); saveSetting(name, slot); } else { localStorage.removeItem(name); saveSetting(name, null); } } catch {} }

function loadResponseMode(): 'speak' | 'type' {
  return readString('axe_response_mode') === 'type' ? 'type' : 'speak';
}

export const useVoiceStore = create<VoiceState>((set, get) => {
  const primary = loadSlot('axe_slot_primary'), fb1 = loadSlot('axe_slot_fallback1'), fb2 = loadSlot('axe_slot_fallback2'), fb3 = loadSlot('axe_slot_fallback3');
  const SESSION_KEY = `axe_chat_session_${APP_SOURCE}`;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sessionId = (() => { try { let id = localStorage.getItem(SESSION_KEY); if (!id || !UUID_RE.test(id)) { id = createNewConversationId(); localStorage.setItem(SESSION_KEY, id); } return id; } catch { return createNewConversationId(); } })();
  const legacyKey = readString('axe_api_key') || '';

  return {
    primarySlot: primary, fallback1Slot: fb1, fallback2Slot: fb2, fallback3Slot: fb3, activeProvider: primary?.provider ?? null,
    apiKey: primary?.key || legacyKey, apiKeyValid: null, voiceStatus: 'idle', transcript: '', response: '', sessionId,
    conversation: [], allConversations: [], isLoadingConversations: false, error: null,
    recognitionSupported, micPermission: 'unknown',
    routingLog: loadRoutingLog(),
    isGeminiLive: false,
    responseMode: loadResponseMode(),
    vpsOnline: null,
    pendingAction: null, clearPendingAction: () => set({ pendingAction: null }),
    setResponseMode: (mode) => { writeString('axe_response_mode', mode); set({ responseMode: mode }); },

    checkVpsStatus: async () => {
      if (!isAxeApiConfigured) { set({ vpsOnline: false }); return; }
      try { await checkAxeApi(); set({ vpsOnline: true }); }
      catch { set({ vpsOnline: false }); }
    },

    setPrimarySlot: (slot) => { saveSlot('axe_slot_primary', slot); if (slot) { writeString('axe_api_key', slot.key); } set({ primarySlot: slot, activeProvider: slot?.provider ?? null, apiKey: slot?.key ?? '', apiKeyValid: null }); },
    setFallback1Slot: (slot) => { saveSlot('axe_slot_fallback1', slot); set({ fallback1Slot: slot }); },
    setFallback2Slot: (slot) => { saveSlot('axe_slot_fallback2', slot); set({ fallback2Slot: slot }); },
    setFallback3Slot: (slot) => { saveSlot('axe_slot_fallback3', slot); set({ fallback3Slot: slot }); },

    refreshConfiguration: async () => {
      const [primary, fb1, fb2, fb3, legacyKey] = await Promise.all([
        loadSetting<KeySlot | null>('axe_slot_primary', null), loadSetting<KeySlot | null>('axe_slot_fallback1', null),
        loadSetting<KeySlot | null>('axe_slot_fallback2', null), loadSetting<KeySlot | null>('axe_slot_fallback3', null),
        loadSetting<string>('axe_api_key', ''),
      ]);
      set({ primarySlot: primary, fallback1Slot: fb1, fallback2Slot: fb2, fallback3Slot: fb3, activeProvider: primary?.provider ?? null, apiKey: primary?.key || legacyKey || '', apiKeyValid: null });
    },

    setApiKey: (key) => { writeString('axe_api_key', key); set({ apiKey: key, apiKeyValid: null, error: null }); },

    testApiKey: async () => { const primary = get().primarySlot; if (!primary) { set({ error: 'No primary key configured.' }); return false; } return get().testSlot(primary); },

    testSlot: async (slot: KeySlot) => {
      set({ voiceStatus: 'processing', error: null });
      try { await callProvider(slot, [{ role: 'system', content: 'You are AXE.' }, { role: 'user', content: 'Say OK' }]); set({ apiKeyValid: true, voiceStatus: 'idle', error: null }); return true; }
      catch (e: unknown) { const m = e instanceof Error ? e.message : String(e); set({ apiKeyValid: false, voiceStatus: 'idle', error: m.includes('Timeout') ? 'Timeout — server not reachable.' : m.includes('CORS') ? 'Network error — check API key.' : `API Error: ${m}` }); return false; }
    },

    clearError: () => set({ error: null }), setError: (error) => set({ error }),
    clearConversation: () => set({ conversation: [], transcript: '', response: '' }),
    clearRoutingLog: () => { clearRoutingLogStore(); set({ routingLog: [] }); },

    loadConversation: async () => {
      // Kick off VPS health check in background (non-blocking)
      get().checkVpsStatus().catch(() => {});
      const sid = get().sessionId;
      // ① localStorage first — instant, always works
      const local = loadConversationLocal(sid);
      if (local.length) { const mapped = local.map(m => ({ ...m, timestamp: m.timestamp || Date.now() })) as ConversationMessage[]; markLoadedAsPersisted(mapped); set({ conversation: mapped }); }
      // ② Supabase in background — fills in if local is empty or merges newer
      try {
        const remote = await loadMessages(sid);
        if (remote.length) {
          const mapped = remote.map(m => ({ ...m, timestamp: m.timestamp || Date.now() })) as ConversationMessage[];
          // Use remote if it has more messages than local (remote is source of truth for cross-device)
          const cur = get().conversation;
          if (mapped.length >= cur.length) { markLoadedAsPersisted(mapped); set({ conversation: mapped }); saveConversationLocal(sid, mapped); }
        }
      } catch { /* Supabase unavailable — local is good enough */ }
    },

    loadAllConversations: async () => { set({ isLoadingConversations: true }); try { const convs = await loadAllConversations(); set({ allConversations: convs, isLoadingConversations: false }); } catch { set({ isLoadingConversations: false }); } },

    switchConversation: async (conversationId: string) => {
      set({ voiceStatus: 'processing', error: null });
      try { localStorage.setItem(SESSION_KEY, conversationId); const loaded = await loadMessages(conversationId); const mapped = loaded.map(m => ({ ...m, timestamp: m.timestamp || Date.now() })) as ConversationMessage[]; markLoadedAsPersisted(mapped); set({ sessionId: conversationId, conversation: mapped, voiceStatus: 'idle', transcript: '', response: '' }); }
      catch { set({ voiceStatus: 'idle', error: 'Failed to load conversation' }); }
    },

    startNewConversation: () => { const newId = createNewConversationId(); localStorage.setItem(SESSION_KEY, newId); clearRoutingLogStore(); set({ sessionId: newId, conversation: [], transcript: '', response: '', voiceStatus: 'idle', error: null, routingLog: [] }); },

    checkMicPermission: async () => { try { if ('permissions' in navigator) { const r = await navigator.permissions.query({ name: 'microphone' as PermissionName }); set({ micPermission: r.state as 'granted' | 'denied' | 'prompt' }); } } catch {} },

    startListening: async () => {
      try {
        // ── Gemini Live (if Google slot is configured) ──────────────────
        const gState = get();
        const googleSlot = [gState.primarySlot, gState.fallback1Slot, gState.fallback2Slot, gState.fallback3Slot].find(s => s?.provider === 'google');
        if (googleSlot?.key) {
          try {
            const { setGeminiLiveApiKey, getGeminiLiveService, startGeminiLive } = await import('@/services/geminiLiveService');
            setGeminiLiveApiKey(googleSlot.key);
            const svc = getGeminiLiveService();
            svc.setCallbacks({
              onStart: () => set({ voiceStatus: 'listening', transcript: '', error: null, isGeminiLive: true }),
              onListening: () => set({ voiceStatus: 'listening' }),
              onSpeaking: () => set({ voiceStatus: 'speaking' }),
              onIdle: () => set({ voiceStatus: 'idle' }),
              onStop: () => set({ voiceStatus: 'idle', isGeminiLive: false }),
              // Gemini Live streams audio directly via WebSocket — do NOT call speakSafely
              // here or TTS will double-play. Just store the transcript.
              onText: (text) => {
                const trimmed = text.trim(); if (!trimmed) return;
                set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: trimmed, timestamp: Date.now(), provider: 'google', model: 'gemini-live' }], response: trimmed, voiceStatus: 'idle', error: null }));
              },
              onError: (err) => set({ voiceStatus: 'idle', isGeminiLive: false, error: `Gemini Live: ${err}` }),
            });
            await startGeminiLive();
            set({ isGeminiLive: true });
            return;
          } catch (liveErr) { console.warn('[GeminiLive] startup failed, falling back to browser STT:', liveErr); set({ isGeminiLive: false }); }
        }
        // ── Browser SpeechRecognition fallback ──────────────────────────
        const rec = getRecognizer(); if (!rec) { set({ error: 'Speech recognition not supported.' }); return; }
        try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(t => t.stop()); set({ micPermission: 'granted' }); } catch { set({ error: 'Microphone permission denied.' }); return; }
        stopTTS(); set({ transcript: '', response: '', voiceStatus: 'listening', error: null });
        rec.onresult = (event: SpeechRecognitionEvent) => { let final = ''; for (let i = 0; i < event.results.length; i++) if (event.results[i].isFinal) final += event.results[i][0].transcript; set({ transcript: final || get().transcript }); if (final) { set({ voiceStatus: 'processing' }); get().sendMessage(final).catch(() => set({ voiceStatus: 'idle' })); } };
        rec.onerror = (event: SpeechRecognitionErrorEvent) => { if (event.error === 'not-allowed') set({ voiceStatus: 'idle', micPermission: 'denied', error: 'Microphone blocked.' }); else if (event.error !== 'no-speech') set({ voiceStatus: 'idle', error: `Speech error: ${event.error}` }); else set({ voiceStatus: 'idle' }); };
        rec.onend = () => { if (get().voiceStatus === 'listening') set({ voiceStatus: 'idle' }); };
        rec.start();
      } catch (e: unknown) { const m = e instanceof Error ? e.message : String(e); set({ voiceStatus: 'idle', error: `Voice error: ${m}` }); }
    },

    stopListening: () => { stopRecognizer(); stopTTS(); set({ voiceStatus: 'idle', isGeminiLive: false }); },

    sendMessage: async (text: string) => {
      if (!text?.trim()) return;
      set(s => ({ conversation: [...s.conversation, { role: 'user' as const, text, timestamp: Date.now() }], voiceStatus: 'processing', error: null }));
      const lower = text.toLowerCase();

      // Chat-driven actions: navigate to a known tab (or a specific record
      // inside it), or open an external URL.
      const chatAction: ChatAction = await detectChatAction(text);
      if (chatAction) {
        if (chatAction.kind === 'navigate') {
          const reply = `Opening ${chatAction.label}.`;
          set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }], response: reply, voiceStatus: 'speaking', error: null, pendingAction: { kind: 'navigate', path: chatAction.path, label: chatAction.label } }));
          speakSafely(reply, () => set({ voiceStatus: 'idle' })); return;
        }
        if (chatAction.kind === 'open_url') {
          const reply = `Opening ${chatAction.url}.`;
          set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }], response: reply, voiceStatus: 'speaking', error: null, pendingAction: { kind: 'open_url', url: chatAction.url } }));
          speakSafely(reply, () => set({ voiceStatus: 'idle' })); return;
        }
        if (chatAction.kind === 'clarify') {
          set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: chatAction.message, timestamp: Date.now() }], response: chatAction.message, voiceStatus: 'speaking', error: null }));
          speakSafely(chatAction.message, () => set({ voiceStatus: 'idle' })); return;
        }
      }

      // Build workflow
      if (/\b(bouw|maak|create|build|genereer|generate)\b.*\b(workflow|automation|automatisering)\b/.test(lower) || /\bworkflow\b.*\b(voor|for|die|that|to)\b/.test(lower)) {
        const intent = text.replace(/^(core[,;]?\s*|axe[,;]?\s*)/i, '').trim(); set({ voiceStatus: 'processing' });
        const thinking = 'Building your workflow...'; set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: thinking, timestamp: Date.now() }], response: thinking }));
        const result = await buildWorkflow(intent, true, false); const reply = formatBuildResult(result);
        set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }], response: reply, voiceStatus: 'speaking', error: null }));
        speakSafely(result.success ? `Workflow "${result.workflowName}" deployed.` : 'Could not build workflow.', () => set({ voiceStatus: 'idle' })); return;
      }

      // System status
      if ((/\b(status|gezondheid|health|online|offline|draait|running)\b/.test(lower) && /\b(systeem|system|services|service)\b/.test(lower)) || /\b(alle|all|check|controleer)\b/.test(lower)) {
        set({ voiceStatus: 'processing' }); if (/\b(alle|all|check|controleer)\b/.test(lower)) await checkAllServices(); const summary = await getSystemSummary();
        const reply = `System status:\n\n${summary.split(' | ').map(s => `• ${s}`).join('\n')}`;
        set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }], response: reply, voiceStatus: 'speaking', error: null }));
        speakSafely('System status retrieved.', () => set({ voiceStatus: 'idle' })); return;
      }

      // Code edit
      if (/\b(verander|wijzig|pas\s+aan|change|modify|update|fix|rename)\b/i.test(lower) && /\b(tab|pagina|page|component|button|knop|kleur|color|stijl|style|tekst|text|header|menu|modal|sidebar|card|sectie|section)\b/i.test(lower)) {
        const { isGitHubConfigured, findFile, readFile, writeFile } = await import('@/services/githubCodeService');
        if (!isGitHubConfigured()) { const reply = 'GitHub not configured.'; set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }], response: reply, voiceStatus: 'speaking', error: null })); speakSafely(reply, () => set({ voiceStatus: 'idle' })); return; }
        set({ voiceStatus: 'processing' }); const thinking = 'Editing code...'; set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: thinking, timestamp: Date.now() }], response: thinking }));
        try {
          const filePath = await findFile(text); if (!filePath) throw new Error('File not found.'); const file = await readFile(filePath); const fileName = filePath.split('/').pop();
          const allSlots = getAllConfiguredSlots(); if (allSlots.length === 0) throw new Error('No AI configured.');
          const codeSlots = [...allSlots.filter(s => ['anthropic', 'openai', 'openrouter'].includes(s.provider)), ...allSlots]; const prioritized = prioritizeOllamaSlots('code', codeSlots);
          const editMessages = [{ role: 'system' as const, content: 'You are a code editor. Apply ONLY the requested change. Return ONLY the complete modified file content, no markdown fences.' }, { role: 'user' as const, content: `File: ${fileName}\n\nRequest: ${text}\n\nCurrent:\n${file.content}` }];
          let newContent = ''; for (const slot of prioritized) { try { newContent = await callProvider(slot, editMessages); break; } catch { continue; } } if (!newContent) throw new Error('AI could not generate edit.');
          newContent = newContent.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, ''); await writeFile(filePath, newContent, file.sha, `AXE: ${text.slice(0, 72)}`, file.repo);
          const reply = `Done. \`${fileName}\` updated and committed.`; set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now(), provider: 'github', model: 'code-edit' }], response: reply, voiceStatus: 'speaking', error: null })); speakSafely('Change committed.', () => set({ voiceStatus: 'idle' }));
        } catch (editErr) { const errMsg = editErr instanceof Error ? editErr.message : String(editErr); const reply = `Code edit failed: ${errMsg}`; set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }], response: reply, voiceStatus: 'idle', error: errMsg })); } return;
      }

      await logRoute('voice request', { routing_mode: 'langgraph', text: text.slice(0, 160) });

      const allSlots = getAllConfiguredSlots();
      if (allSlots.length === 0) { const { primarySlot, fallback1Slot, fallback2Slot, fallback3Slot } = get(); [primarySlot, fallback1Slot, fallback2Slot, fallback3Slot].forEach(s => s && allSlots.push(s)); }
      if (allSlots.length === 0) { await logRoute('no providers'); const reply = 'No AI configured. Go to Settings → Provider Keys.'; set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }], response: reply, voiceStatus: 'speaking', error: null })); speakSafely(reply, () => set({ voiceStatus: 'idle' })); return; }

      const cap = await classifyQueryDynamic(text).catch(() => classifyQuery(text));
      const capCfg = await loadCapabilities().catch(() => null);
      const matchedCap = capCfg?.find(c => c.capability === cap);
      let orderedSlots: KeySlot[], activeAgentPrompt: string | null = null;
      await logRoute('capability classified', { capability: cap, mode: matchedCap ? 'matched' : 'fallback' });

      if (matchedCap?.preferred_provider) {
        const preferred = matchedCap.preferred_provider;
        const fallback = matchedCap.fallback_provider;
        orderedSlots = [...allSlots.filter(s => s.provider === preferred), ...allSlots.filter(s => s.provider === fallback && s.provider !== preferred), ...allSlots.filter(s => s.provider !== preferred && s.provider !== fallback)];
        if (orderedSlots.length === 0) orderedSlots = allSlots;
        if (matchedCap.preferred_agent) activeAgentPrompt = await getAgentSystemPrompt(matchedCap.preferred_agent).catch(() => null);
      } else { orderedSlots = selectByCapability(cap as QueryCapability, allSlots); orderedSlots = prioritizeOllamaSlots(cap as QueryCapability, orderedSlots); }

      // ── Build a routing event that will be populated as slots are tried ──
      const routeEvt: RoutingEvent = { id: `re_${Date.now()}`, ts: Date.now(), query: text.slice(0, 60), capability: cap, slotOrder: orderedSlots.map(s => s.provider), attempts: [], via: 'none' };

      const history = get().conversation.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.text }));
      const eveSupp = orderedSlots[0] ? getEveSystemPromptSupplement(orderedSlots[0].provider) : '';
      const baseSystem = (activeAgentPrompt ? `${AXE_SYSTEM_PROMPT}\n\n## Active Specialization\n${activeAgentPrompt}` : AXE_SYSTEM_PROMPT) + eveSupp;

      // ── Build system content: date + RAG + Tavily — all in parallel ─
      const today = new Date().toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      let systemContent = baseSystem + `\n\n## Huidige datum\n${today} — Amsterdam (CET/CEST).`;

      const SEARCH_RE = /\b(wie|wat|wanneer|waar|hoe|why|who|what|when|where|how|zoek|search|nieuws|news|vandaag|today|recent|latest|actueel|verklaar|explain|define|wat betekent|tell me about|prijs|price|koers|stock|crypto|bitcoin|weather|weer|score|stand)\b/i;
      const shouldSearch = tavilyConfigured() && SEARCH_RE.test(text) && text.length > 12 && cap !== 'code';

      const [ragCtx, tavilyResults] = await Promise.all([
        buildGlobalMemoryContext(AXE_USER_ID, text, 900).catch(() => ''),
        shouldSearch ? tavilySearch(text.slice(0, 300), { maxResults: 5, depth: 'basic' }).catch(() => []) : Promise.resolve([]),
      ]);
      if (ragCtx) systemContent += `\n\n${ragCtx}`;
      if (tavilyResults.length > 0) systemContent += `\n\n${formatTavilyResults(tavilyResults, text)}`;

      const messages = [{ role: 'system' as const, content: systemContent }, ...history.slice(0, -1), { role: 'user' as const, content: text }];

      const pushRouteEvt = (evt: RoutingEvent) => {
        set(s => {
          const head = s.routingLog[0];
          // Coalesce: if the most-recent entry has the same winner provider and
          // the same outcome path, bump its count and refresh ts/query instead of
          // pushing a new entry.  This keeps the panel readable during bursts.
          if (head && head.winner && head.winner === evt.winner && head.via === evt.via && evt.via !== 'none') {
            const merged: RoutingEvent = { ...head, ts: evt.ts, query: evt.query, count: (head.count ?? 1) + 1 };
            const updated = [merged, ...s.routingLog.slice(1)].slice(0, 50);
            saveRoutingLog(updated); return { routingLog: updated };
          }
          const updated = [evt, ...s.routingLog].slice(0, 50); saveRoutingLog(updated); return { routingLog: updated };
        });
      };

      // EVE per-slot: each provider gets its own skill supplement injected into the system message
      const buildSlotMessages = (slotProvider: string, baseMsgs: typeof messages) => {
        const slotEve = getEveSystemPromptSupplement(slotProvider);
        if (!slotEve) return baseMsgs;
        const slotSys = (activeAgentPrompt ? `${AXE_SYSTEM_PROMPT}\n\n## Active Specialization\n${activeAgentPrompt}` : AXE_SYSTEM_PROMPT) + slotEve;
        return [{ role: 'system' as const, content: slotSys }, ...baseMsgs.slice(1)];
      };

      try {
        const { classifyBranch } = await import('@/services/langGraphOrchestrator');
        const branch = classifyBranch(text, orderedSlots);
        // Only try VPS/crew if VPS is confirmed online (or status unknown on first message)
        const vpsReachable = get().vpsOnline !== false;
        if (branch === 'local' && isAxeApiConfigured && vpsReachable) {
          try {
            const conv = get().conversation.slice(-12).map(m => ({ role: m.role, content: m.text })); const specialists = capabilityToSpecialists(cap);
            const crewRes = await crewRun({ task: text, conversation: conv, specialists }); if (crewRes?.status === 'ok' && crewRes.result) {
              const trimmed = crewRes.result.trim();
              routeEvt.via = 'crew'; routeEvt.winner = 'crew'; routeEvt.winnerModel = 'crewai'; routeEvt.attempts = [{ provider: 'crew', model: 'crewai', outcome: 'ok' }];
              pushRouteEvt(routeEvt);
              set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: trimmed, timestamp: Date.now(), provider: 'crew', model: 'crewai' }], response: trimmed, voiceStatus: 'speaking', activeProvider: 'ollama' as ProviderId, error: null }));
              speakSafely(trimmed, () => set({ voiceStatus: 'idle' })); logMessage('info', 'axe-core-voice', `[CREW] ${text.slice(0, 60)}`, {}).catch(() => {}); return;
            }
          } catch (crewErr) { console.warn('[Crew] failed:', crewErr); }
        }
        const { orchestrate } = await import('@/services/langGraphOrchestrator');
        const lgCallFn = (slot: { provider: string; key: string; model?: string; baseUrl?: string }, msgs: typeof messages) => callProvider(slot as KeySlot, buildSlotMessages(slot.provider, msgs));
        const result = await orchestrate(messages, orderedSlots, lgCallFn);
        if (result) {
          // Apply tool calls (SEARCH/FETCH) to LangGraph response too
          const resolved = await resolveModelToolCalls(result.response, result.slot as KeySlot, messages, buildSlotMessages);
          const trimmed = resolved.trim();
          routeEvt.via = 'langgraph'; routeEvt.winner = result.slot.provider; routeEvt.winnerModel = result.slot.model; routeEvt.attempts = [{ provider: result.slot.provider, model: result.slot.model, outcome: 'ok' }];
          pushRouteEvt(routeEvt);
          set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: trimmed, timestamp: Date.now(), provider: result.slot.provider, model: result.slot.model }], response: trimmed, voiceStatus: 'speaking', activeProvider: result.slot.provider as ProviderId, error: null }));
          speakSafely(trimmed, () => set({ voiceStatus: 'idle' })); logMessage('info', 'axe-core-voice', `[LG] ${result.slot.provider}`, {}).catch(() => {}); writeConversationMemory(text, trimmed, result.slot.provider, cap).catch(() => {}); await logRoute('langgraph success', { provider: result.slot.provider }); return;
        }
      } catch (lgErr) { console.warn('[LangGraph] failed:', lgErr); await logRoute('langgraph fallback', { error: lgErr instanceof Error ? lgErr.message : String(lgErr) }); }

      let lastError = '';
      const slotAttempts: { provider: string; err: string }[] = [];
      for (const slot of orderedSlots) {
        try {
          const rawReply = await callProvider(slot, buildSlotMessages(slot.provider, messages));
          const reply = await resolveModelToolCalls(rawReply, slot, messages, buildSlotMessages); const trimmed = reply.trim();
          const skipped = slotAttempts.map(a => `${a.provider} ${a.err}`).join(' · ');
          routeEvt.via = 'fallback'; routeEvt.winner = slot.provider; routeEvt.winnerModel = slot.model; routeEvt.attempts.push({ provider: slot.provider, model: slot.model, outcome: 'ok' });
          pushRouteEvt(routeEvt);
          set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: trimmed, timestamp: Date.now(), provider: slot.provider, model: slot.model, ...(skipped ? { slotErrors: skipped } : {}) }], response: trimmed, voiceStatus: 'speaking', activeProvider: slot.provider, error: null }));
          speakSafely(trimmed, () => set({ voiceStatus: 'idle' })); logMessage('info', 'axe-core-voice', `[${slot.provider}] ${text.slice(0, 60)}`, {}).catch(() => {}); writeConversationMemory(text, trimmed, slot.provider, cap).catch(() => {}); await logRoute('provider success', { provider: slot.provider }); return;
        }
        catch (e: unknown) { lastError = e instanceof Error ? e.message : String(e); const se = shortErr(lastError); slotAttempts.push({ provider: slot.provider, err: se }); routeEvt.attempts.push({ provider: slot.provider, model: slot.model, outcome: 'fail', err: se }); await logRoute('provider failed', { provider: slot.provider, error: lastError.slice(0, 200) }); }
      }

      await logRoute('all providers failed', { error: lastError.slice(0, 200) });
      const slotSummary = slotAttempts.map(a => `${a.provider} ${a.err}`).join(' · ');
      routeEvt.via = 'none'; pushRouteEvt(routeEvt);
      const errReply = 'AXE Core is temporarily unavailable. Check your API keys in Settings.';
      set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: errReply, timestamp: Date.now(), provider: 'error', slotErrors: slotSummary || undefined }], response: errReply, voiceStatus: 'idle', error: lastError }));
    },
  };
});

/* ── Persistence ─────────────────────────────────────────────────────── */
let _maxPersistedTs = 0;
function markPersisted(ts: number) { if (ts >= _maxPersistedTs) _maxPersistedTs = ts + 1; }

/** Mark all messages in a loaded batch as already persisted so the subscriber
 *  does not re-save them and create Supabase duplicates. */
export function markLoadedAsPersisted(msgs: { timestamp: number }[]): void {
  const max = msgs.reduce((m, msg) => Math.max(m, msg.timestamp), 0);
  if (max > 0) markPersisted(max);
}

useVoiceStore.subscribe((state, prev) => {
  if (state.conversation === prev.conversation) return;
  const sid = state.sessionId;

  // ① Always save to localStorage immediately — this is the reliable primary store
  saveConversationLocal(sid, state.conversation);

  // ② Save new messages to Supabase in background (best-effort)
  const toPersist = state.conversation.filter(m => m.timestamp > _maxPersistedTs);
  if (toPersist.length === 0) return;
  for (const m of toPersist) saveMessage({ conversation_id: sid, user_id: AXE_USER_ID, role: m.role, content: m.text, provider: m.provider ?? null, model: m.model ?? null });
  markPersisted(toPersist[toPersist.length - 1].timestamp);
});
