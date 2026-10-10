/**
 * openAiRealtimeVoice.ts
 *
 * One WebRTC connection to the OpenAI Realtime API (`gpt-realtime`, OpenAI's
 * current recommended speech-to-speech model). This is the transport only:
 * it hears Luka, speaks back, and carries function-tool calls both ways.
 * What the tools DO, and what AXE knows, lives in
 * installOpenAIRealtimeVoice.ts — this file has no opinion about jobs,
 * memory or approvals.
 *
 * The long-lived OpenAI key never lives in this client. AXE Core mints one
 * short-lived Realtime client secret through the same authenticated backend
 * route on Tauri, iPad and iPhone; only that ephemeral value is sent from the
 * device to OpenAI for the WebRTC handshake.
 */
import { axeCoreApiExtraHeaders, axeCoreApiUrl } from '@/infrastructure/config/apiUrl';
import { createRealtimeUsageGuard, REALTIME_IDLE_MS, REALTIME_MAX_SESSION_MS } from './realtimeUsageGuard';

/** OpenAI's current recommended realtime speech-to-speech model (GA, Aug 2025). */
export const OPENAI_REALTIME_MODEL = 'gpt-realtime';

/** OpenAI's warm, natural realtime voice — closest match to AXE's Cedar TTS identity. */
export const OPENAI_REALTIME_VOICE = 'marin';


/** Ask AXE Core for a short-lived OpenAI Realtime credential. */
export async function createRealtimeClientSecret(): Promise<string> {
  const base = axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore').replace(/\/$/, '');
  const res = await fetch(`${base}/realtime/client-secret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...axeCoreApiExtraHeaders() },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AXE Core realtime session ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const data = (await res.json()) as { value?: string };
  if (!data.value) throw new Error('AXE Core returned no realtime client secret.');
  return data.value;
}

export interface RealtimeToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeVoiceHandlers {
  /** Data channel open and session configured — audio can flow now. */
  onSessionReady?: () => void;
  onUserSpeechStarted?: () => void;
  onUserSpeechStopped?: () => void;
  /** Final transcript of what Luka said. */
  onUserTranscript?: (text: string) => void;
  /** Wat Luka tot nu toe zegt, terwijl hij nog praat (opgebouwd uit delta's). */
  onUserTranscriptDelta?: (soFar: string) => void;
  /** First audible sample of AXE's reply for this turn. */
  onAssistantSpeakingStarted?: () => void;
  /** Final transcript of what AXE said, once the turn is fully spoken. */
  onAssistantTranscript?: (text: string) => void;
  onFunctionCall?: (name: string, args: unknown, callId: string) => void;
  /** A new response turn started — until onResponseDone, another
   *  response.create would fail: the API allows only one at a time. */
  onResponseStarted?: () => void;
  /** AXE's turn is fully done — the natural moment to say a queued job result. */
  onResponseDone?: () => void;
  onError?: (message: string) => void;
  onClosed?: (reason: string) => void;
}

export interface RealtimeVoiceSession {
  isOpen: () => boolean;
  close: () => Promise<void>;
  /** Hand a tool's result back to the model and let it continue the turn. */
  sendFunctionResult: (callId: string, output: string) => void;
  /** Inject a line for AXE to say next, in its own voice — used for
   *  background-job results landing mid-call. */
  sayNow: (text: string) => void;
  /** Seed prior turns (recent typed/spoken chat) as conversation history
   *  WITHOUT triggering a response — continuity, not a reply. */
  seedHistory: (turns: Array<{ role: 'user' | 'assistant'; text: string }>) => void;
  /** Stop AXE's current turn immediately (explicit stop, not user speech —
   *  the API already truncates its own reply on real barge-in). */
  interrupt: () => void;
}

/** Live 0..1 RMS of the realtime model's own voice, for the composer/sphere pulse. */
let levelAnalyser: AnalyserNode | null = null;
let levelData: Uint8Array<ArrayBuffer> | null = null;
let levelAudioEl: HTMLAudioElement | null = null;

export function getOpenAiRealtimeLevel(): number {
  if (!levelAnalyser || !levelData || !levelAudioEl || levelAudioEl.paused) return 0;
  levelAnalyser.getByteTimeDomainData(levelData);
  let sum = 0;
  for (const v of levelData) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / levelData.length) * 3.2);
}

/**
 * De session.update in het GA-formaat. Het oude (beta) formaat met `voice`,
 * `turn_detection` en `input_audio_transcription` op het hoogste niveau wordt
 * door `gpt-realtime` geweigerd ("Missing required parameter: 'session.type'")
 * -- en dan draait het gesprek zonder instructies, tools en transcriptie: AXE
 * hoort je wel, maar je ziet niet wat je zei en hij kan niets starten.
 */
export function realtimeSessionUpdate(opts: {
  instructions: string;
  tools: RealtimeToolDef[];
  voice?: string;
}): Record<string, unknown> {
  return {
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions: opts.instructions,
      tools: opts.tools.map((t) => ({ type: 'function', ...t })),
      tool_choice: 'auto',
      max_output_tokens: 512,
      truncation: { type: 'retention_ratio', retention_ratio: 0.8, token_limits: { post_instructions: 8000 } },
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 250,
            silence_duration_ms: 550,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: opts.voice ?? OPENAI_REALTIME_VOICE },
      },
    },
  };
}

function isAssistantAudioDelta(type: string): boolean {
  return /^response\.(audio_transcript|output_audio_transcript)\.delta$/.test(type);
}

function isAssistantAudioDone(type: string): boolean {
  return /^response\.(audio_transcript|output_audio_transcript)\.done$/.test(type);
}

/**
 * Open one realtime voice call over WebRTC.
 *
 * `micStream` is caller-owned (whisperService.acquireMic()) — this function
 * only adds its track to the peer connection, it never calls getUserMedia
 * itself, so the mic-level pulse the composer already reads keeps working
 * unchanged.
 */
export async function openRealtimeVoice(
  micStream: MediaStream,
  opts: {
    instructions: string;
    tools: RealtimeToolDef[];
    voice?: string;
    /** Prior turns (recent typed/spoken chat) to seed as history the instant
     *  the data channel opens — sent from inside channel.onopen so it can
     *  never race the channel actually being open. */
    history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  },
  handlers: RealtimeVoiceHandlers = {},
): Promise<RealtimeVoiceSession> {
  // Zonder betrouwbare lokale telling geen nieuwe betaalde sessie beginnen.
  const usageGuard = createRealtimeUsageGuard(localStorage);
  usageGuard.assertAvailable();
  const clientSecret = await createRealtimeClientSecret();

  const pc = new RTCPeerConnection();
  let closing = false;
  let assistantSpeaking = false;
  let laatsteAntwoordItem: string | null = null;
  let liveItem = '';
  let liveTekst = '';
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let sessionTimer: ReturnType<typeof setTimeout> | undefined;
  let levelContext: AudioContext | null = null;
  let responseCount = 0;

  const stopForLimit = (reason: string) => {
    if (closing) return;
    closing = true;
    cleanup();
    handlers.onClosed?.(reason);
  };
  const renewIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => stopForLimit('Voice paused after 90 seconds without new speech. Tap the mic to resume.'), REALTIME_IDLE_MS);
  };

  micStream.getAudioTracks().forEach((track) => pc.addTrack(track, micStream));

  const audioEl = new Audio();
  audioEl.autoplay = true;

  pc.ontrack = (event) => {
    if (closing) return;
    const [remote] = event.streams;
    if (!remote) return;
    audioEl.srcObject = remote;
    void audioEl.play().catch(() => {});

    try {
      const ctx = new AudioContext();
      levelContext = ctx;
      void ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(remote);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      // Tap only — never connect to ctx.destination, or the model's voice
      // would play twice (once here, once through audioEl).
      source.connect(analyser);
      levelAnalyser = analyser;
      levelData = new Uint8Array(analyser.fftSize);
      levelAudioEl = audioEl;
    } catch {
      /* level metering is cosmetic — a real conversation still works without it */
    }
  };

  const channel = pc.createDataChannel('oai-events');
  channel.onclose = () => stopForLimit('Voice data connection closed. Tap the mic to resume.');

  const send = (payload: Record<string, unknown>): void => {
    if (closing || channel.readyState !== 'open') return;
    try {
      channel.send(JSON.stringify(payload));
    } catch (error) {
      handlers.onError?.(error instanceof Error ? error.message : String(error));
    }
  };

  const sendHistoryItem = (turn: { role: 'user' | 'assistant'; text: string }): void => {
    send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: turn.role,
        // GA-schema: assistent-geschiedenis is `output_text`; `text` wordt geweigerd.
        content: [{ type: turn.role === 'user' ? 'input_text' : 'output_text', text: turn.text }],
      },
    });
  };

  channel.onopen = () => {
    if (closing) return;
    send(realtimeSessionUpdate(opts));
    renewIdle();
    sessionTimer = setTimeout(() => stopForLimit('Voice paused at the 10-minute session limit. Tap the mic to resume.'), REALTIME_MAX_SESSION_MS);
    // Sent from right here, not after openRealtimeVoice() resolves — the
    // channel is open NOW, by definition, so this can never race a data
    // channel that silently drops sends before it reaches 'open'.
    opts.history?.forEach(sendHistoryItem);
    handlers.onSessionReady?.();
  };

  channel.onmessage = (event: MessageEvent<string>) => {
    if (closing) return;
    let msg: { type?: string; [key: string]: unknown };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    const type = msg.type ?? '';

    if (type === 'input_audio_buffer.speech_started') {
      renewIdle();
      handlers.onUserSpeechStarted?.();
      return;
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      renewIdle();
      handlers.onUserSpeechStopped?.();
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.delta') {
      const itemId = typeof msg.item_id === 'string' ? msg.item_id : '';
      if (itemId !== liveItem) {
        liveItem = itemId;
        liveTekst = '';
      }
      liveTekst += typeof msg.delta === 'string' ? msg.delta : '';
      if (liveTekst.trim()) handlers.onUserTranscriptDelta?.(liveTekst.trim());
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      liveItem = '';
      liveTekst = '';
      const text = typeof msg.transcript === 'string' ? msg.transcript : '';
      if (text.trim()) handlers.onUserTranscript?.(text.trim());
      return;
    }
    if (type === 'response.created') {
      responseCount += 1;
      if (responseCount > 30) {
        stopForLimit('Voice response limit reached. Tap the mic to start a new conversation.');
        return;
      }
      assistantSpeaking = false;
      laatsteAntwoordItem = null;
      handlers.onResponseStarted?.();
      return;
    }
    // Het item dat AXE nu uitspreekt. `interrupt()` kapt precies dit af, zodat
    // het model weet tot waar jij hem gehoord hebt.
    if (type === 'response.output_item.added') {
      const item = msg.item as { id?: string } | undefined;
      if (item?.id) laatsteAntwoordItem = item.id;
      return;
    }
    if (isAssistantAudioDelta(type)) {
      if (!assistantSpeaking) {
        assistantSpeaking = true;
        handlers.onAssistantSpeakingStarted?.();
      }
      return;
    }
    if (isAssistantAudioDone(type)) {
      const text = typeof msg.transcript === 'string' ? msg.transcript : '';
      if (text.trim()) handlers.onAssistantTranscript?.(text.trim());
      return;
    }
    if (type === 'response.function_call_arguments.done') {
      const name = typeof msg.name === 'string' ? msg.name : '';
      const callId = typeof msg.call_id === 'string' ? msg.call_id : '';
      const rawArgs = typeof msg.arguments === 'string' ? msg.arguments : '{}';
      if (!name || !callId) return;
      let args: unknown = {};
      try {
        args = JSON.parse(rawArgs);
      } catch {
        /* the model sent malformed JSON — the handler gets {} and can still refuse gracefully */
      }
      handlers.onFunctionCall?.(name, args, callId);
      return;
    }
    if (type === 'response.done') {
      assistantSpeaking = false;
      try {
        usageGuard.record(msg.response);
      } catch (error) {
        stopForLimit(error instanceof Error ? error.message : 'Voice usage could not be recorded.');
        return;
      }
      handlers.onResponseDone?.();
      return;
    }
    if (type === 'error') {
      const err = msg.error as { message?: string } | undefined;
      handlers.onError?.(err?.message || 'OpenAI realtime error');
      stopForLimit(err?.message || 'OpenAI realtime error');
    }
  };

  const cleanup = () => {
    clearTimeout(idleTimer);
    clearTimeout(sessionTimer);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('storage', onStorageChange);
    // Eerst geen audio meer versturen; de eigenaar geeft de microfoon daarna vrij.
    pc.getSenders().forEach((sender) => { if (sender.track) sender.track.enabled = false; });
    if (levelContext) void levelContext.close().catch(() => {});
    levelContext = null;
    levelAnalyser = null;
    levelData = null;
    levelAudioEl = null;
    audioEl.pause();
    audioEl.srcObject = null;
    try {
      channel.close();
    } catch {
      /* already closed */
    }
    try {
      pc.close();
    } catch {
      /* already closed */
    }
  };

  const onPageHide = () => stopForLimit('Voice closed when leaving the page.');
  const onStorageChange = () => {
    try { usageGuard.assertAvailable(); }
    catch (error) { stopForLimit(error instanceof Error ? error.message : 'Voice usage unavailable.'); }
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('storage', onStorageChange);

  pc.onconnectionstatechange = () => {
    if (closing) return;
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      closing = true;
      cleanup();
      handlers.onClosed?.(`connection ${pc.connectionState}`);
    }
  };

  try {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // GA-endpoint eerst; het oude adres alleen als dat er (nog) niet is.
  const postSdp = (url: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
      signal: AbortSignal.timeout(15_000),
    });
  let sdpResponse = await postSdp('https://api.openai.com/v1/realtime/calls');
  if (sdpResponse.status === 404) {
    sdpResponse = await postSdp(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`,
    );
  }
  if (!sdpResponse.ok) {
    const body = await sdpResponse.text().catch(() => '');
    cleanup();
    throw new Error(`OpenAI realtime connect ${sdpResponse.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const answerSdp = await sdpResponse.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  } catch (error) {
    closing = true;
    cleanup();
    throw error;
  }

  return {
    isOpen: () => !closing && pc.connectionState !== 'failed' && pc.connectionState !== 'closed',
    close: async () => {
      if (closing) return;
      closing = true;
      cleanup();
    },
    sendFunctionResult: (callId, output) => {
      send({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: callId, output },
      });
      send({ type: 'response.create' });
    },
    sayNow: (text) => {
      send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text: `Say this now, in your own words if you like, in Dutch: ${text}` }],
        },
      });
      send({ type: 'response.create' });
    },
    // Kept for a session already open (e.g. seeding a fresh fact mid-call);
    // openRealtimeVoice's own `history` option is the reliable path for
    // connect-time seeding, sent from inside channel.onopen itself.
    seedHistory: (turns) => turns.forEach(sendHistoryItem),
    /**
     * Nu stoppen met praten, maar de verbinding houden.
     *
     * Hier stond `audioEl.pause()`, en dat was eenrichtingsverkeer: `play()`
     * wordt maar op één plek aangeroepen (`pc.ontrack`, bij verbinden), dus
     * na één keer onderbreken bleef AXE de rest van het gesprek stil -- en
     * `getOpenAiRealtimeLevel()` gaf 0, dus de bol-puls stierf mee. Pauzeren
     * hoeft ook niet: WebRTC stopt de stroom zelf zodra het antwoord
     * geannuleerd is; wat je nog hoort is de buffer, een fractie van een
     * seconde.
     *
     * `truncate` erbij, want zonder dat denkt het model dat je zijn hele
     * antwoord gehoord hebt en verwijst het daarna naar dingen die je nooit
     * hoorde.
     */
    interrupt: () => {
      if (laatsteAntwoordItem) {
        send({
          type: 'conversation.item.truncate',
          item_id: laatsteAntwoordItem,
          content_index: 0,
          audio_end_ms: Math.max(0, Math.round(audioEl.currentTime * 1000)),
        });
      }
      send({ type: 'response.cancel' });
    },
  };
}
