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
 * Realtime is the only voice path. If it cannot start or drops, AXE surfaces
 * that failure and stops voice; it never silently degrades to batch STT/TTS.
 */
import { useVoiceStore, writeConversationMemory } from '@/presentation/store/voiceStore';
import { useAxeJobStore, lopendeJobs } from '@/presentation/store/axeJobStore';
import { startAxeJobs, setRealtimeJobAnnouncer } from '@/presentation/store/installTierRouter';
import { AXE_SYSTEM_PROMPT, REALTIME_VOICE_RULES } from '@/domain/prompts';
import { AXE_AGENTS, agentById, type AxeAgentId } from '@/domain/agents/roster';
import {
  jobTitelVan,
  jobStatusTekst,
  sessieSamenvatting,
  magMetStemGoedkeuren,
  type AxeJob,
} from '@/domain/tierRouter/axeJobRegels';
import type { AxeRoute } from '@/domain/tierRouter/axeRoute';
import { AXE_SKILLS, isAxeSkill, skillDef } from '@/domain/tierRouter/axeSkills';
import { sneltoetsActie, SNELTOETS_EVENT } from '@/domain/voice/sneltoets';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import {
  acquireMic,
  releaseMic,
} from '@/infrastructure/gateways/whisperService';
import {
  openRealtimeVoice,
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
// stopAllAudio was stopGlobalTts() plus twee aanroepen die stopGlobalTts zelf
// al doet. De Whisper-lus eromheen is op 29 sep uit main.tsx gehaald en nu weg.
import { stopGlobalTts } from '@/infrastructure/gateways/globalTts';

let installed = false;
let realtimeActive = false;
let realtimeStarting = false;
let generation = 0;
let session: RealtimeVoiceSession | null = null;
/** Praat AXE op dit moment? Staat op modulebereik omdat `installVoiceHotkeys`
 *  buiten de installer-closure leeft en Escape dit moet kunnen zien. */
let responseActive = false;
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

// ── The real tools ───────────────────────────────────────────────────────

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
        agent: {
          type: 'string',
          enum: AXE_AGENTS.filter((a) => a.id !== 'axe').map((a) => a.id),
          description: 'The roster agent that owns this work. Pick the domain owner: developer for code/apps, trading for the Trading tab, northsea for NorthSea Desk, thinktank for ThinkTank, wingman for broad crew work, etc.',
        },
        /* Eén parameter in plaats van vijf nieuwe tools. Dat is met opzet:
           installOpenAIRealtimeVoice.test.ts eist de EXACTE lijst van vijf
           toolnamen, en prompts.ts vertelt het model in proza dat het "exactly
           seven real tools" heeft (5 + show_on_home/use_computer sinds 7 okt). Tools erbij betekent die twee ook
           aanpassen en het model een lijst van tien geven; één parameter houdt
           beide waar. */
        skill: {
          type: 'string',
          enum: AXE_SKILLS.map((sk) => sk.id),
          description: `One of AXE's five named skills, when Luka asks for exactly that: ${AXE_SKILLS.map((sk) => `${sk.id} (${sk.uitleg})`).join('; ')}. These have a fixed instruction and a fixed agent, so naming one beats writing your own request. Leave it out when unsure.`,
        },
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
  {
    name: 'show_on_home',
    description:
      "Show something on AXE's Home screen — the sphere turns into it. Use it whenever Luka asks to see, look up, google or open something, AND on your own when something you are discussing is easier to see than to hear: a summary of what you two just talked about, a comparison, a plan, a checklist (kind document, markdown in content), an example or mockup of something (kind html, a self-contained HTML page in content), a picture of a thing or place (kind image), a place (map), a market (chart), a web search or news (web). Returns what is shown so you can talk about it.",
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['web', 'map', 'chart', 'image', 'document', 'html'], description: 'web (default), map, chart, image need a query; document and html need content.' },
        query: { type: 'string', description: 'For web/map/chart/image: search terms, a place, a ticker or a subject.' },
        title: { type: 'string', description: 'Short title shown above it.' },
        content: { type: 'string', description: 'For document: markdown. For html: a complete self-contained HTML page (inline CSS/JS, dark background).' },
      },
    },
  },
  {
    name: 'use_computer',
    description:
      "Act on Luka's own Mac — the same computer use the typed chat has. Open or focus an app (app.open with {app:'Safari'}), list running apps (app.list), look at the screen (screen.observe), list personal files (personal.files.list with {path}), read a file in a workspace (files.read with {path, workspace}; it is also shown on Home), click or type (pointer.click, keyboard.type). Anything that changes something shows Luka an approval card first; you never choose the risk level.",
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'The computer tool id, e.g. app.open, screen.observe, files.read.' },
        args: { type: 'object', description: 'Arguments for that tool, e.g. {"app":"Safari"}.' },
      },
      required: ['tool'],
    },
  },
  {
    name: 'get_overview',
    description:
      "How things stand right now: what needs Luka's attention (approvals, failed jobs, news), whether the Mac mini, iMac and both VPSes are up with their load, the core services, and the market prices. Call this whenever he asks how it is going, what is waiting, whether everything is online, or what you would do next — instead of guessing.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'use_connected_service',
    description:
      "Use the services connected to AXE (Supabase, Cloudflare, GitHub, mail and more, plus NorthSea). Step 1: action 'list' shows what is connected. Step 2: action 'tools' with a service lists what it can do. Step 3: action 'call' with service, tool and args does it. Reading runs at once; anything that changes or sends something shows Luka an approval card first.",
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'tools', 'call'], description: 'list, tools or call.' },
        service: { type: 'string', description: 'The service id from the list.' },
        tool: { type: 'string', description: "For 'call': the tool name from 'tools'." },
        args: { type: 'object', description: "For 'call': the arguments for that tool." },
      },
      required: ['action'],
    },
  },
];

async function toolStartBackgroundTask(args: ToolArgs): Promise<string> {
  const request = argStr(args, 'request');
  if (!request) return JSON.stringify({ ok: false, message: 'No request text given.' });
  const requestedAgent = argStr(args, 'agent');
  const validAgent = AXE_AGENTS.some((a) => a.id === requestedAgent && a.id !== 'axe')
    ? requestedAgent as AxeAgentId
    : 'axe';

  /* Een benoemde skill wint van wat het model er zelf bij bedacht: wie hem doet
     en wat de opdracht is staat in de tabel. Zo krijgt de agent via de stem
     exact dezelfde instructie als via de knop en via typen -- dat was de hele
     reden om skills één plek te geven. */
  const ruwSkill = argStr(args, 'skill');
  const def = isAxeSkill(ruwSkill) ? skillDef(ruwSkill) : null;
  const title = argStr(args, 'title') ?? (def ? def.label : jobTitelVan(request));
  const opdracht = def ? `${def.request}\n\nLuka said: ${request}` : request;
  const route: AxeRoute = {
    tier: 3,
    kind: 'agent',
    via: 'model',
    reason: def ? `realtime_voice:skill:${def.id}` : 'realtime_voice',
    agent: def ? def.agent : validAgent,
    skill: def ? def.id : null,
    confident: true,
  };
  startAxeJobs([{ text: opdracht, titel: title, route }]);
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
      case 'show_on_home': return await (await import('./realtimeHomeTools')).toolShowOnHome(args);
      case 'use_computer': return await (await import('./realtimeHomeTools')).toolUseComputer(args);
      case 'get_overview': return await (await import('./realtimePartnerTools')).toolGetOverview();
      case 'use_connected_service': return await (await import('./realtimePartnerTools')).toolConnectedService(args);
      default: {
        // The rest of the registry (search, fetch, git, database, phone, home, Obsidian, browser...):
        // the same executor and the same approval card the typed chat uses.
        const partner = await import('./realtimePartnerTools');
        if (partner.isRegisterTool(name)) return await partner.runRegisterTool(name, args);
        return JSON.stringify({ ok: false, message: `Unknown tool: ${name}` });
      }
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

/**
 * Wat de mic-sneltoets doet. Eén plek, twee triggers.
 *
 * In Tauri komt de druk uit Rust (globale sneltoets, werkt ook als een andere
 * app voorop staat); in de web-app en de PWA komt hij uit het venster
 * (`useKeyboardShortcuts`, want daar is geen Rust). Stond de beslissing in de
 * Tauri-tak hieronder, dan zou de web-kant zijn eigen versie krijgen -- en dan
 * betekent dezelfde aanslag op twee plekken net iets anders.
 */
export function schakelStemSneltoets(): void {
  const actief = isRealtimeVoiceActive() || useVoiceStore.getState().voiceStatus !== 'idle';
  if (sneltoetsActie(actief) === 'stop') useVoiceStore.getState().stopListening();
  else useVoiceStore.getState().startListening();
}

/**
 * Één aanslag van de stem-sneltoets, waar hij ook vandaan komt.
 * Zelfde tweetrap als Escape: eerst stil leggen, pas daarna ophangen.
 */
function sneltoetsAanslag(): void {
  if (responseActive && session) {
    session.interrupt();
    responseActive = false;
    useVoiceStore.setState({ voiceStatus: 'listening' });
    return;
  }
  schakelStemSneltoets();
}

/**
 * Het DOM-event waarmee een schil zonder Rust (de Android-app) het gesprek start of stopt.
 * In Tauri komt dezelfde aanslag als `axe://sneltoets-mic` binnen; op de telefoon is er geen
 * globale sneltoets, dus de pil op het slotscherm en de assistent-knop sturen dit event.
 */
const STEM_TOGGLE_EVENT = 'axe-voice-toggle';

function installVoiceHotkeys(): void {
  if (hotkeysInstalled) return;
  hotkeysInstalled = true;

  if (typeof window !== 'undefined') {
    window.addEventListener(STEM_TOGGLE_EVENT, sneltoetsAanslag);
    // De Android-schil wacht hierop voordat hij het gesprek start: een event dat vóór de
    // listener is verstuurd, is verloren, en de pagina is na het ontgrendelen nog aan het laden.
    (window as unknown as Record<string, unknown>).__axeVoiceReady = true;
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (useVoiceStore.getState().voiceStatus === 'idle') return;
      e.preventDefault();
      // Twee trappen, en dat onderscheid stond al in `stemlusOvergang`:
      // barge-in houdt de microfoon open (`cancelListen: false`), esc niet.
      // Praat hij? Dan val je hem in de rede en praat je gewoon door. Is hij
      // al stil, dan is Escape pas ophangen. Tot nu toe was elke Escape
      // ophangen -- er was geen manier om alleen "hou even op" te zeggen.
      if (responseActive && session) {
        session.interrupt();
        responseActive = false;
        useVoiceStore.setState({ voiceStatus: 'listening' });
        return;
      }
      useVoiceStore.getState().stopListening();
    });
  }

  if (!isTauriRuntime()) return;
  void import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen(SNELTOETS_EVENT, sneltoetsAanslag),
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

  const baseSendMessage = useVoiceStore.getState().sendMessage;

  let lastUserText = '';
  const pendingAnnouncements: string[] = [];

  const flushPendingAnnouncements = () => {
    if (responseActive || pendingAnnouncements.length === 0 || !session || !realtimeActive) return;
    const text = pendingAnnouncements.shift() as string;
    responseActive = true;
    session.sayNow(text);
  };

  const closeRealtime = async (setIdle = true) => {
    realtimeActive = false;
    useVoiceStore.setState({ liveCall: false });
    realtimeStarting = false;
    responseActive = false;
    generation += 1;
    setRealtimeJobAnnouncer(null);
    const closing = session;
    session = null;
    const stream = micStreamForSession;
    micStreamForSession = null;
    stopGlobalTts();
    if (closing) await closing.close();
    if (stream) releaseMic();
    if (setIdle) {
      useVoiceStore.setState({ voiceStatus: 'idle', transcript: '', isGeminiLive: false });
    }
  };

  const startRealtime = async () => {
    if (realtimeActive || realtimeStarting) return;

    // A mic click means a spoken conversation — never leave AXE in
    // type-only response mode and mute for a voice call he just started.
    useVoiceStore.getState().setResponseMode('speak');

    // Hier stond een controle op `isOpenAiRealtimeConfigured()`, die
    // onvoorwaardelijk `true` teruggaf -- een wachter die nooit afgaat, met
    // een melding ("not configured on this device") over het per-apparaat
    // model dat op 29 sep is verlaten. De sleutel is centraal; ontbreekt hij,
    // dan werpt `createRealtimeClientSecret` en komt de échte reden van de
    // server in de foutafhandeling hieronder.

    // WKWebView locks WebAudio until it is resumed from a direct user
    // gesture — do this before any network request, same reasoning as the
    // ElevenLabs layer this replaces.
    try {
      const unlock = new AudioContext();
      if (unlock.state === 'suspended') await unlock.resume();
      void unlock.close();
    } catch { /* Realtime will report the actual microphone/audio failure below. */ }

    realtimeStarting = true;
    const myGeneration = ++generation;
    useVoiceStore.setState({
      voiceStatus: 'processing',
      transcript: '',
      error: null,
      isGeminiLive: false,
    });
    stopGlobalTts();

    try {
      const mic = await acquireMic();
      if (myGeneration !== generation || !realtimeStarting) return;
      micStreamForSession = mic;

      // The whole registry, not just the base tools: what is switched on right now, and (so AXE can say
      // exactly why instead of "I can't") what is switched off. If the registry cannot load for any
      // reason the call still opens with the base tools -- a voice with fewer hands beats no voice.
      let sessionTools: RealtimeToolDef[] = REALTIME_TOOLS;
      let uitgezet = '';
      try {
        const partner = await import('./realtimePartnerTools');
        sessionTools = [...REALTIME_TOOLS, ...partner.registerStemTools()];
        const uit = partner.uitgezetteTools();
        if (uit.length) {
          uitgezet = `\n\nSwitched off right now (not set up, or its backend is down): ${uit.join(', ')}. If Luka needs one of these, say it is off and what turns it on — never just "I can't".`;
        }
      } catch (error) {
        console.warn('[AXE voice] registry tools unavailable, using the base tools:', error);
      }
      const instructions = `${AXE_SYSTEM_PROMPT}\n\n\n${REALTIME_VOICE_RULES}${uitgezet}`;
      const recentHistory = useVoiceStore.getState().conversation
        .slice(-8)
        .map((m) => ({ role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', text: m.text }));

      const opened = await openRealtimeVoice(mic, { instructions, tools: sessionTools, history: recentHistory }, {
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

        // Live meeschrijven terwijl Luka praat -- zoals OS3: je ziet wat AXE hoort.
        onUserTranscriptDelta: (soFar) => {
          if (myGeneration !== generation) return;
          useVoiceStore.setState({ transcript: soFar });
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
          useVoiceStore.setState({ liveCall: false });
          realtimeStarting = false;
          session = null;
          releaseMic();
          micStreamForSession = null;
          setRealtimeJobAnnouncer(null);
          useVoiceStore.setState({
            voiceStatus: 'idle',
            error: `Realtime voice connection closed: ${reason}`,
          });
        },
      });

      if (myGeneration !== generation || !realtimeStarting) {
        await opened.close();
        return;
      }

      session = opened;
      realtimeStarting = false;
      realtimeActive = true;
      useVoiceStore.setState({ liveCall: true });
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
      useVoiceStore.setState({ liveCall: false });
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

      useVoiceStore.setState({
        voiceStatus: 'idle',
        error: `Realtime voice failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  useVoiceStore.setState({
    startListening: startRealtime,

    stopListening: () => {
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
