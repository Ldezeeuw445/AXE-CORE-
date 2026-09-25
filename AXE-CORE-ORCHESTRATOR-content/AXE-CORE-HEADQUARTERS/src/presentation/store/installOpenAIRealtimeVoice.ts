/**
 * installOpenAIRealtimeVoice.ts
 *
 * One live speech-to-speech call for AXE, over the OpenAI Realtime API
 * (`gpt-realtime`). It hears Luka, decides, and speaks back in the same
 * breath — no separate STT step, no separate LLM call, no separate TTS
 * call for ordinary conversation. That call IS AXE for the duration of the
 * conversation, using the same persona (AXE_SYSTEM_PROMPT) Luka's typed
 * chat uses.
 *
 * Real work still goes through the existing stack, never a second one:
 * the five tools below call straight into stuurAxeJobs/createDurableTask
 * (via installTierRouter's startAxeJobs), axeJobStore, the durable-task
 * cancel/approval endpoints, and ragMemoryService — the exact same things
 * typed chat and the tier router already use.
 *
 * If OpenAI Realtime cannot start, or drops mid-call, the existing Whisper
 * conversation loop remains the fallback — same pattern as the ElevenLabs
 * Scribe layer this file replaces.
 */
import { useVoiceStore, writeConversationMemory } from '@/presentation/store/voiceStore';
import { useAxeJobStore, lopendeJobs } from '@/presentation/store/axeJobStore';
import { startAxeJobs, setRealtimeJobAnnouncer } from '@/presentation/store/installTierRouter';
import { AXE_SYSTEM_PROMPT, REALTIME_VOICE_RULES } from '@/domain/prompts';
import { agentById } from '@/domain/agents/roster';
import {
  jobTitelVan,
  jobStatusTekst,
  sessieSamenvatting,
  magMetStemGoedkeuren,
  type AxeJob,
} from '@/domain/tierRouter/axeJobRegels';
import type { AxeRoute } from '@/domain/tierRouter/axeRoute';
import { sneltoetsActie, SNELTOETS_EVENT } from '@/domain/voice/sneltoets';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import {
  acquireMic,
  releaseMic,
} from '@/infrastructure/gateways/whisperService';
import {
  openRealtimeVoice,
  isOpenAiRealtimeConfigured,
  OPENAI_REALTIME_MODEL,
  type RealtimeToolDef,
  type RealtimeVoiceSession,
} from '@/infrastructure/gateways/openAiRealtimeVoice';
import {
  getDurableTask,
  cancelDurableTask,
  decideDurableTaskApproval,
} from '@/infrastructure/gateways/axeCoreApiService';
import { searchRagMemories, extractMemoryFromMessage } from '@/infrastructure/persistence/ragMemoryService';
import { noteRetrieval, noteOwnerOutcome } from '@/infrastructure/persistence/memoryFeedbackService';
import { stopAllAudio } from '@/presentation/store/installWhisperVoice';

let installed = false;
let realtimeActive = false;
let realtimeStarting = false;
let fallbackActive = false;
let generation = 0;
let session: RealtimeVoiceSession | null = null;
let micStreamForSession: MediaStream | null = null;
let hotkeysInstalled = false;

function isRealtimeVoiceActive(): boolean {
  return realtimeActive || realtimeStarting;
}

function microphoneWasDenied(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'NotAllowedError' || error.name === 'SecurityError';
  }
  const text = error instanceof Error ? error.message : String(error);
  return /permission denied|notallowederror|microphone blocked/i.test(text);
}

// ── Tool argument helpers ────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;

function argStr(args: ToolArgs, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function argBool(args: ToolArgs, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === 'boolean' ? v : undefined;
}

/** Best matching job for a loosely-spoken reference ("the northsea one").
 *  null = nothing to match against; 'ambiguous' = more than one fits, ask. */
function findJobByHint(jobs: AxeJob[], hint?: string): AxeJob | 'ambiguous' | null {
  if (jobs.length === 0) return null;
  if (!hint) return jobs.length === 1 ? jobs[0] : 'ambiguous';

  const h = hint.toLowerCase();
  const scored = jobs
    .map((j) => {
      const naam = agentById(j.agent).name.toLowerCase();
      let score = 0;
      if (h.includes(j.agent.toLowerCase())) score += 3;
      if (h.includes(naam) || naam.includes(h)) score += 3;
      if (h.includes(j.title.toLowerCase()) || j.title.toLowerCase().includes(h)) score += 2;
      if (h.includes(j.sourceText.toLowerCase())) score += 1;
      return { j, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return jobs.length === 1 ? jobs[0] : 'ambiguous';
  if (scored.length > 1 && scored[0].score === scored[1].score) return 'ambiguous';
  return scored[0].j;
}

function candidateList(jobs: AxeJob[]): string {
  return jobs.map((j) => `${agentById(j.agent).name} (${j.title})`).join(', ');
}

// ── The five real tools ──────────────────────────────────────────────────

export const REALTIME_TOOLS: RealtimeToolDef[] = [
  {
    name: 'start_background_task',
    description:
      "Start a new background task on an existing AXE agent (trading, northsea, developer, browser, research, etc). Use this whenever Luka asks you to actually do real work, not just talk about it. Returns immediately — the task keeps running after this call, and you'll be told the result later.",
    parameters: {
      type: 'object',
      properties: {
        request: { type: 'string', description: "The task in Luka's own words — what needs to happen." },
        title: { type: 'string', description: 'A short (under 10 words) title for the task.' },
      },
      required: ['request'],
    },
  },
  {
    name: 'get_task_status',
    description:
      'Check what is running or already finished this session. Call this before answering any question about a running task, instead of guessing.',
    parameters: {
      type: 'object',
      properties: {
        job_hint: {
          type: 'string',
          description: 'Optional: which task, by name or agent (e.g. "the northsea task"). Omit for an overview of everything.',
        },
      },
    },
  },
  {
    name: 'cancel_task',
    description: 'Stop a running or waiting background task.',
    parameters: {
      type: 'object',
      properties: {
        job_hint: {
          type: 'string',
          description: 'Which task to stop, by name or agent. Omit only if exactly one task is running.',
        },
      },
    },
  },
  {
    name: 'answer_pending_approval',
    description:
      "Approve or reject a low-risk approval a running task is waiting on. Only works for low-risk approvals — a shell command that stays on this machine and sends nothing out. Anything riskier (outbound mail/messages, NorthSea, git/db writes, an order) must be approved by Luka in the app, and this tool tells you that instead of acting.",
    parameters: {
      type: 'object',
      properties: {
        approve: { type: 'boolean', description: 'true to approve, false to reject.' },
        job_hint: { type: 'string', description: 'Optional: which waiting task, if more than one is waiting.' },
      },
      required: ['approve'],
    },
  },
  {
    name: 'search_memory',
    description:
      "Search AXE's long-term memory of past conversations and facts about Luka. Use this when he references something that isn't in this call's recent context.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' },
      },
      required: ['query'],
    },
  },
];

async function toolStartBackgroundTask(args: ToolArgs): Promise<string> {
  const request = argStr(args, 'request');
  if (!request) return JSON.stringify({ ok: false, message: 'No request text given.' });
  const title = argStr(args, 'title') ?? jobTitelVan(request);
  const route: AxeRoute = {
    tier: 3,
    kind: 'agent',
    via: 'model',
    reason: 'realtime_voice',
    agent: 'axe',
    skill: null,
    confident: true,
  };
  startAxeJobs([{ text: request, titel: title, route }]);
  return JSON.stringify({ ok: true, message: `Started: ${title}. I'll tell you when it's done.` });
}

async function toolGetTaskStatus(args: ToolArgs): Promise<string> {
  const jobs = useAxeJobStore.getState().jobs;
  const hint = argStr(args, 'job_hint');
  if (!hint) return JSON.stringify({ ok: true, message: sessieSamenvatting(jobs) });
  const match = findJobByHint(jobs, hint);
  if (match === null) return JSON.stringify({ ok: true, message: 'Nothing has run this session yet.' });
  if (match === 'ambiguous') return JSON.stringify({ ok: false, message: `Which one — ${candidateList(jobs)}?` });
  return JSON.stringify({ ok: true, message: jobStatusTekst(match) });
}

async function toolCancelTask(args: ToolArgs): Promise<string> {
  const jobs = lopendeJobs(useAxeJobStore.getState().jobs);
  if (jobs.length === 0) return JSON.stringify({ ok: false, message: 'Nothing is running right now.' });
  const match = findJobByHint(jobs, argStr(args, 'job_hint'));
  if (match === null) return JSON.stringify({ ok: false, message: 'Nothing is running right now.' });
  if (match === 'ambiguous') return JSON.stringify({ ok: false, message: `Which one should I stop — ${candidateList(jobs)}?` });
  if (!match.taskId) return JSON.stringify({ ok: false, message: `${agentById(match.agent).name} is still starting — try again in a moment.` });
  await cancelDurableTask(match.taskId, 'Stopped by Luka over voice.');
  return JSON.stringify({ ok: true, message: `Stopping ${agentById(match.agent).name}'s task now.` });
}

async function toolAnswerApproval(args: ToolArgs): Promise<string> {
  const approve = argBool(args, 'approve');
  if (approve === undefined) return JSON.stringify({ ok: false, message: 'Need approve: true or false.' });

  const waiting = useAxeJobStore.getState().jobs.filter((j) => j.state === 'waiting');
  if (waiting.length === 0) return JSON.stringify({ ok: false, message: 'Nothing is waiting on an approval right now.' });
  const match = findJobByHint(waiting, argStr(args, 'job_hint'));
  if (match === null) return JSON.stringify({ ok: false, message: 'Nothing is waiting on an approval right now.' });
  if (match === 'ambiguous') return JSON.stringify({ ok: false, message: `Which one — ${candidateList(waiting)}?` });
  if (!match.taskId) return JSON.stringify({ ok: false, message: 'That task has no id yet — try again in a moment.' });

  let approvals;
  try {
    approvals = (await getDurableTask(match.taskId)).approvals;
  } catch {
    return JSON.stringify({ ok: false, message: 'Could not reach that task right now.' });
  }
  const pending = approvals.find((a) => a.status === 'pending');
  if (!pending) return JSON.stringify({ ok: false, message: 'That approval is already resolved.' });

  // DurableTaskApproval carries the same kind/title/detail/metadata shape
  // AxeGoedkeuring expects, so magMetStemGoedkeuren reads it directly — the
  // same gate installTierRouter's probeerGesprokenGoedkeuring uses for a
  // spoken yes/no during the Whisper-fallback loop.
  if (!magMetStemGoedkeuren(pending)) {
    return JSON.stringify({
      ok: false,
      message: `${agentById(match.agent).name} needs a click in Approvals for this one — it's not something to approve by voice.`,
    });
  }

  await decideDurableTaskApproval(match.taskId, pending.id, approve, 'voice');
  return JSON.stringify({ ok: true, message: approve ? 'Approved. It continues now.' : 'Rejected.' });
}

async function toolSearchMemory(args: ToolArgs): Promise<string> {
  const query = argStr(args, 'query');
  if (!query) return JSON.stringify({ ok: false, message: 'No search text given.' });
  noteRetrieval(query, [], [], 'voice');
  const hits = await searchRagMemories(query, 5);
  if (hits.length === 0) return JSON.stringify({ ok: true, results: [] as string[] });
  return JSON.stringify({ ok: true, results: hits.map((h) => h.content) });
}

/** Exported for tests — this is also the whole dispatch table the realtime
 *  session's function calls run through. */
export async function handleRealtimeTool(name: string, rawArgs: unknown): Promise<string> {
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as ToolArgs;
  try {
    switch (name) {
      case 'start_background_task': return await toolStartBackgroundTask(args);
      case 'get_task_status': return await toolGetTaskStatus(args);
      case 'cancel_task': return await toolCancelTask(args);
      case 'answer_pending_approval': return await toolAnswerApproval(args);
      case 'search_memory': return await toolSearchMemory(args);
      default: return JSON.stringify({ ok: false, message: `Unknown tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}

// ── Memory: every voice turn lands where typed chat lands ────────────────

function recordVoiceTurn(question: string, answer: string): void {
  if (!question || !answer) return;
  noteRetrieval(question, [], [], 'voice');
  noteOwnerOutcome('voice', 'good');
  void writeConversationMemory(question, answer, 'openai', 'voice');
  void extractMemoryFromMessage('user', question);
  void extractMemoryFromMessage('axe', answer);
}

// ── ⌥Space (global) and Esc (window) — same switch as the mic button ─────

function installVoiceHotkeys(): void {
  if (hotkeysInstalled) return;
  hotkeysInstalled = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (useVoiceStore.getState().voiceStatus === 'idle') return;
      e.preventDefault();
      useVoiceStore.getState().stopListening();
    });
  }

  if (!isTauriRuntime()) return;
  void import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen(SNELTOETS_EVENT, () => {
        const active = isRealtimeVoiceActive() || useVoiceStore.getState().voiceStatus !== 'idle';
        if (sneltoetsActie(active) === 'stop') useVoiceStore.getState().stopListening();
        else useVoiceStore.getState().startListening();
      }),
    )
    .catch(() => {
      // No global-shortcut plugin on this surface (web build) — the mic
      // button and Escape above still fully work.
    });
}

// ── Session lifecycle ─────────────────────────────────────────────────────

export function installOpenAIRealtimeVoice(): void {
  if (installed) return;
  installed = true;

  const fallbackStart = useVoiceStore.getState().startListening;
  const fallbackStop = useVoiceStore.getState().stopListening;
  const baseSendMessage = useVoiceStore.getState().sendMessage;

  let lastUserText = '';
  let responseActive = false;
  const pendingAnnouncements: string[] = [];

  const flushPendingAnnouncements = () => {
    if (responseActive || pendingAnnouncements.length === 0 || !session || !realtimeActive) return;
    const text = pendingAnnouncements.shift() as string;
    responseActive = true;
    session.sayNow(text);
  };

  const closeRealtime = async (setIdle = true) => {
    realtimeActive = false;
    realtimeStarting = false;
    responseActive = false;
    generation += 1;
    setRealtimeJobAnnouncer(null);
    const closing = session;
    session = null;
    const stream = micStreamForSession;
    micStreamForSession = null;
    stopAllAudio();
    if (closing) await closing.close();
    if (stream) releaseMic();
    if (setIdle) {
      useVoiceStore.setState({ voiceStatus: 'idle', transcript: '', isGeminiLive: false });
    }
  };

  const startFallback = async (reason?: string) => {
    realtimeActive = false;
    realtimeStarting = false;
    session = null;
    fallbackActive = true;
    if (reason) console.warn('[AXE realtime voice] OpenAI Realtime unavailable; Whisper fallback:', reason);
    try {
      await fallbackStart();
    } finally {
      fallbackActive = false;
    }
  };

  const startRealtime = async () => {
    if (realtimeActive || realtimeStarting || fallbackActive) return;

    // A mic click means a spoken conversation — never leave AXE in
    // type-only response mode and mute for a voice call he just started.
    useVoiceStore.getState().setResponseMode('speak');

    if (!isOpenAiRealtimeConfigured()) {
      await startFallback('no local OpenAI key on this surface');
      return;
    }

    // WKWebView locks WebAudio until it is resumed from a direct user
    // gesture — do this before any network request, same reasoning as the
    // ElevenLabs layer this replaces.
    try {
      const unlock = new AudioContext();
      if (unlock.state === 'suspended') await unlock.resume();
      void unlock.close();
    } catch { /* input can still fall back to Whisper */ }

    realtimeStarting = true;
    const myGeneration = ++generation;
    useVoiceStore.setState({
      voiceStatus: 'processing',
      transcript: '',
      error: null,
      isGeminiLive: false,
    });
    stopAllAudio();

    try {
      const mic = await acquireMic();
      if (myGeneration !== generation || !realtimeStarting) return;
      micStreamForSession = mic;

      const instructions = `${AXE_SYSTEM_PROMPT}\n\n\n${REALTIME_VOICE_RULES}`;
      const recentHistory = useVoiceStore.getState().conversation
        .slice(-8)
        .map((m) => ({ role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', text: m.text }));

      const opened = await openRealtimeVoice(mic, { instructions, tools: REALTIME_TOOLS, history: recentHistory }, {
        onSessionReady: () => {
          if (myGeneration !== generation) return;
          useVoiceStore.setState({
            micPermission: 'granted',
            voiceStatus: 'listening',
            transcript: '',
            error: null,
          });
        },

        onUserSpeechStarted: () => {
          if (myGeneration !== generation) return;
          useVoiceStore.setState({ voiceStatus: 'listening', error: null });
        },

        onUserSpeechStopped: () => {
          if (myGeneration !== generation) return;
          useVoiceStore.setState((s) => (s.voiceStatus === 'listening' ? { voiceStatus: 'processing' } : {}));
        },

        onUserTranscript: (text) => {
          if (myGeneration !== generation) return;
          lastUserText = text;
          useVoiceStore.setState((s) => ({
            conversation: [...s.conversation, { role: 'user' as const, text, timestamp: Date.now() }],
            transcript: '',
          }));
        },

        onAssistantSpeakingStarted: () => {
          if (myGeneration !== generation) return;
          useVoiceStore.setState({ voiceStatus: 'speaking' });
        },

        onAssistantTranscript: (text) => {
          if (myGeneration !== generation) return;
          useVoiceStore.setState((s) => ({
            conversation: [
              ...s.conversation,
              {
                role: 'axe' as const,
                text,
                timestamp: Date.now(),
                provider: 'openai',
                model: OPENAI_REALTIME_MODEL,
                delegate: 'axe' as const,
              },
            ],
            response: text,
          }));
          recordVoiceTurn(lastUserText, text);
        },

        onFunctionCall: (name, args, callId) => {
          if (myGeneration !== generation) return;
          void handleRealtimeTool(name, args).then((output) => {
            if (myGeneration === generation) session?.sendFunctionResult(callId, output);
          });
        },

        onResponseStarted: () => {
          responseActive = true;
        },

        onResponseDone: () => {
          responseActive = false;
          if (myGeneration === generation && realtimeActive) {
            useVoiceStore.setState((s) => (s.voiceStatus !== 'idle' ? { voiceStatus: 'listening' } : {}));
          }
          flushPendingAnnouncements();
        },

        onError: (message) => {
          if (myGeneration !== generation) return;
          console.warn('[AXE realtime voice]', message);
          useVoiceStore.setState({ error: message });
        },

        onClosed: (reason) => {
          if (myGeneration !== generation) return;
          realtimeActive = false;
          session = null;
          void startFallback(`realtime connection closed: ${reason}`);
        },
      });

      if (myGeneration !== generation || !realtimeStarting) {
        await opened.close();
        return;
      }

      session = opened;
      realtimeStarting = false;
      realtimeActive = true;
      setRealtimeJobAnnouncer((text) => {
        pendingAnnouncements.push(text);
        flushPendingAnnouncements();
      });
      useVoiceStore.setState({
        micPermission: 'granted',
        voiceStatus: 'listening',
        transcript: '',
        error: null,
      });
    } catch (error) {
      if (myGeneration !== generation) return;
      realtimeStarting = false;
      realtimeActive = false;
      session = null;
      if (micStreamForSession) {
        releaseMic();
        micStreamForSession = null;
      }

      if (microphoneWasDenied(error)) {
        useVoiceStore.setState({
          voiceStatus: 'idle',
          micPermission: 'denied',
          error: 'Microphone permission denied. System Settings → Privacy → Microphone → AXE Core.',
        });
        return;
      }

      await startFallback(error instanceof Error ? error.message : String(error));
    }
  };

  useVoiceStore.setState({
    startListening: startRealtime,

    stopListening: () => {
      if (fallbackActive) {
        fallbackActive = false;
        fallbackStop();
        return;
      }
      void closeRealtime(true);
    },

    // Typed input hangs up a realtime call, same as the Whisper/ElevenLabs
    // layers before it — typing means "I'm done talking out loud".
    sendMessage: async (text: string) => {
      if (realtimeActive || realtimeStarting) await closeRealtime(false);
      return baseSendMessage(text);
    },
  });

  installVoiceHotkeys();
}
