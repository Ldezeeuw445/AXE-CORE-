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
 * The key comes from the same place whisperService reads it
 * (readConnKey('openai') / VITE_OPENAI_API_KEY) and this calls OpenAI
 * directly from the client, exactly like openAiTtsService.ts and
 * whisperService.ts already do for the OpenAI-key case — no VPS proxy hop
 * for this one, same as the rest of AXE's voice stack.
 */
import { readConnKey } from '@/infrastructure/gateways/whisperService';

/** OpenAI's current recommended realtime speech-to-speech model (GA, Aug 2025). */
export const OPENAI_REALTIME_MODEL = 'gpt-realtime';

/** OpenAI's warm, natural realtime voice — closest match to AXE's Cedar TTS identity. */
export const OPENAI_REALTIME_VOICE = 'marin';

function resolveOpenAiKey(): string {
  return (
    readConnKey('openai') ||
    (typeof import.meta !== 'undefined' ? String(import.meta.env?.VITE_OPENAI_API_KEY ?? '') : '')
  );
}

export function isOpenAiRealtimeConfigured(): boolean {
  return resolveOpenAiKey().length > 0;
}

/**
 * Exchange the local OpenAI key for a short-lived client secret. The
 * standard key never leaves this device for the SDP handshake below — only
 * this ephemeral value does, and it is scoped to one realtime session.
 */
export async function createRealtimeClientSecret(): Promise<string> {
  const key = resolveOpenAiKey();
  if (!key) throw new Error('No OpenAI key configured for realtime voice.');

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: { type: 'realtime', model: OPENAI_REALTIME_MODEL } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI realtime session ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const data = (await res.json()) as { value?: string; client_secret?: { value?: string } };
  const secret = data.value ?? data.client_secret?.value;
  if (!secret) throw new Error('OpenAI returned no realtime client secret.');
  return secret;
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
  const clientSecret = await createRealtimeClientSecret();

  const pc = new RTCPeerConnection();
  let closing = false;
  let assistantSpeaking = false;

  micStream.getAudioTracks().forEach((track) => pc.addTrack(track, micStream));

  const audioEl = new Audio();
  audioEl.autoplay = true;

  pc.ontrack = (event) => {
    const [remote] = event.streams;
    if (!remote) return;
    audioEl.srcObject = remote;
    void audioEl.play().catch(() => {});

    try {
      const ctx = new AudioContext();
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

  const send = (payload: Record<string, unknown>): void => {
    if (channel.readyState !== 'open') return;
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
        content: [{ type: turn.role === 'user' ? 'input_text' : 'text', text: turn.text }],
      },
    });
  };

  channel.onopen = () => {
    send({
      type: 'session.update',
      session: {
        instructions: opts.instructions,
        voice: opts.voice ?? OPENAI_REALTIME_VOICE,
        tools: opts.tools.map((t) => ({ type: 'function', ...t })),
        tool_choice: 'auto',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 500,
          create_response: true,
        },
        input_audio_transcription: { model: 'whisper-1' },
      },
    });
    // Sent from right here, not after openRealtimeVoice() resolves — the
    // channel is open NOW, by definition, so this can never race a data
    // channel that silently drops sends before it reaches 'open'.
    opts.history?.forEach(sendHistoryItem);
    handlers.onSessionReady?.();
  };

  channel.onmessage = (event: MessageEvent<string>) => {
    let msg: { type?: string; [key: string]: unknown };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    const type = msg.type ?? '';

    if (type === 'input_audio_buffer.speech_started') {
      handlers.onUserSpeechStarted?.();
      return;
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      handlers.onUserSpeechStopped?.();
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const text = typeof msg.transcript === 'string' ? msg.transcript : '';
      if (text.trim()) handlers.onUserTranscript?.(text.trim());
      return;
    }
    if (type === 'response.created') {
      assistantSpeaking = false;
      handlers.onResponseStarted?.();
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
      handlers.onResponseDone?.();
      return;
    }
    if (type === 'error') {
      const err = msg.error as { message?: string } | undefined;
      handlers.onError?.(err?.message || 'OpenAI realtime error');
    }
  };

  const cleanup = () => {
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

  pc.onconnectionstatechange = () => {
    if (closing) return;
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      closing = true;
      cleanup();
      handlers.onClosed?.(`connection ${pc.connectionState}`);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const sdpResponse = await fetch(
    `https://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!sdpResponse.ok) {
    const body = await sdpResponse.text().catch(() => '');
    cleanup();
    throw new Error(`OpenAI realtime connect ${sdpResponse.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const answerSdp = await sdpResponse.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

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
    interrupt: () => {
      audioEl.pause();
      send({ type: 'response.cancel' });
    },
  };
}
