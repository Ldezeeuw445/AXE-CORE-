/**
 * elevenRealtimeScribe.ts
 *
 * Realtime microphone -> ElevenLabs Scribe v2 Realtime.
 *
 * This deliberately uses the public WebSocket protocol directly instead of
 * adding another voice framework to AXE. The output is text only; AXE's
 * existing sendMessage path remains the brain, tool router, memory and
 * approval boundary.
 *
 * Audio is captured as mono Float32 by WebAudio, resampled to 16 kHz PCM16
 * and sent in ~85 ms chunks. Scribe's VAD commits the user's turn after a
 * short silence, while partial transcripts are available immediately for
 * live captions and barge-in.
 */

export interface RealtimeScribeEvent {
  message_type: string;
  session_id?: string;
  text?: string;
  error?: string;
  warning?: string;
  [key: string]: unknown;
}

export interface RealtimeScribeHandlers {
  onPartial?: (text: string) => void;
  onCommitted?: (text: string) => void;
  onSessionStarted?: (sessionId?: string) => void;
  onError?: (message: string) => void;
  onClosed?: (code: number, reason: string) => void;
}

export interface RealtimeScribeSession {
  close: () => Promise<void>;
  isOpen: () => boolean;
}

const TARGET_SAMPLE_RATE = 16_000;
const PROCESSOR_SIZE = 4096;

function pcm16Bytes(input: Float32Array, inputRate: number): Uint8Array {
  if (!Number.isFinite(inputRate) || inputRate <= 0) {
    throw new Error('Invalid microphone sample rate.');
  }

  const outputLength = Math.max(1, Math.floor(input.length * TARGET_SAMPLE_RATE / inputRate));
  const buffer = new ArrayBuffer(outputLength * 2);
  const view = new DataView(buffer);
  const ratio = inputRate / TARGET_SAMPLE_RATE;

  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const left = Math.min(input.length - 1, Math.floor(position));
    const right = Math.min(input.length - 1, left + 1);
    const frac = position - left;
    const sample = Math.max(-1, Math.min(1, input[left] + (input[right] - input[left]) * frac));
    const int16 = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    view.setInt16(i * 2, int16, true);
  }

  return new Uint8Array(buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x4000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(bytes.length, i + chunkSize);
    for (let j = i; j < end; j++) binary += String.fromCharCode(bytes[j]);
  }
  return btoa(binary);
}

export function buildRealtimeScribeUrl(token: string): string {
  const params = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    token,
    audio_format: 'pcm_16000',
    commit_strategy: 'vad',
    // Fast enough to feel conversational, long enough not to split every
    // breath into a separate AXE command.
    vad_silence_threshold_secs: '0.65',
    vad_threshold: '0.4',
    min_speech_duration_ms: '100',
    min_silence_duration_ms: '100',
    // Helps prevent AXE's own speakers / nearby TV from becoming a turn.
    filter_background_audio: 'true',
  });
  return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
}

export async function openRealtimeScribe(
  token: string,
  handlers: RealtimeScribeHandlers = {},
): Promise<RealtimeScribeSession> {
  if (!token.trim()) throw new Error('Missing ElevenLabs realtime token.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture is not available.');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: TARGET_SAMPLE_RATE },
    },
  });

  const context = new AudioContext({ latencyHint: 'interactive' });
  const source = context.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated for new web apps, but it remains supported
  // by the macOS WKWebView used by Tauri. It also avoids shipping an AudioWorklet
  // file merely to turn a microphone buffer into PCM.
  const processor = context.createScriptProcessor(PROCESSOR_SIZE, 1, 1);
  const silent = context.createGain();
  silent.gain.value = 0;

  source.connect(processor);
  processor.connect(silent);
  silent.connect(context.destination);

  let closing = false;
  const socket = new WebSocket(buildRealtimeScribeUrl(token));

  const cleanupAudio = async () => {
    processor.onaudioprocess = null;
    try { source.disconnect(); } catch { /* already disconnected */ }
    try { processor.disconnect(); } catch { /* already disconnected */ }
    try { silent.disconnect(); } catch { /* already disconnected */ }
    stream.getTracks().forEach(track => track.stop());
    try { await context.close(); } catch { /* already closed */ }
  };

  try {
    await context.resume();
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('ElevenLabs realtime connection timed out.'));
      }, 10_000);

      socket.onopen = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Could not connect to ElevenLabs realtime transcription.'));
      };
    });
  } catch (error) {
    closing = true;
    try { socket.close(); } catch { /* ignore */ }
    await cleanupAudio();
    throw error;
  }

  socket.onmessage = (event: MessageEvent<string>) => {
    let payload: RealtimeScribeEvent;
    try {
      payload = JSON.parse(String(event.data)) as RealtimeScribeEvent;
    } catch {
      return;
    }

    if (payload.message_type === 'session_started') {
      handlers.onSessionStarted?.(
        typeof payload.session_id === 'string' ? payload.session_id : undefined,
      );
      return;
    }

    if (payload.message_type === 'partial_transcript') {
      const text = typeof payload.text === 'string' ? payload.text : '';
      if (text) handlers.onPartial?.(text);
      return;
    }

    if (payload.message_type === 'committed_transcript') {
      const text = typeof payload.text === 'string' ? payload.text : '';
      if (text) handlers.onCommitted?.(text);
      return;
    }

    if (typeof payload.error === 'string' && payload.error) {
      handlers.onError?.(payload.error);
    }
  };

  socket.onclose = (event) => {
    void (async () => {
      await cleanupAudio();
      if (!closing) {
        handlers.onClosed?.(event.code, event.reason || 'connection closed');
      }
    })();
  };

  socket.onerror = () => {
    if (!closing) handlers.onError?.('ElevenLabs realtime transcription connection failed.');
  };

  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    if (closing || socket.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    if (!input.length) return;

    try {
      const bytes = pcm16Bytes(input, context.sampleRate);
      socket.send(JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: bytesToBase64(bytes),
        sample_rate: TARGET_SAMPLE_RATE,
      }));
    } catch (error) {
      handlers.onError?.(error instanceof Error ? error.message : String(error));
    }
  };

  return {
    isOpen: () => !closing && socket.readyState === WebSocket.OPEN,
    close: async () => {
      if (closing) return;
      closing = true;
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, 'AXE voice stopped');
        }
      } catch { /* ignore */ }
      await cleanupAudio();
    },
  };
}
