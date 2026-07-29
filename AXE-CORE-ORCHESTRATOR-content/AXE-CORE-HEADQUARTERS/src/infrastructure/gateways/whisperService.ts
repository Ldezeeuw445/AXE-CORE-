/**
 * whisperService.ts — speech-to-text for AXE voice conversation.
 *
 * Browser Web Speech API ends too early (continuous=false). This module:
 *  1. Records mic audio with MediaRecorder
 *  2. Stops on silence (~1.4s after speech) or explicit stop()
 *  3. Transcribes via Groq whisper-large-v3 (free tier) or OpenAI Whisper
 *
 * Keys are read from axe_llm_connections (Settings) or VITE_* env.
 * TTS (ElevenLabs) is unrelated — this is STT only.
 */

const SILENCE_RMS = 0.012;
const SILENCE_MS = 1400;
const MAX_RECORD_MS = 45_000;
const MIN_SPEECH_MS = 350;

export type WhisperProvider = 'groq' | 'openai';

export interface WhisperConfig {
  provider: WhisperProvider;
  key: string;
  model: string;
  endpoint: string;
}

function readConnKey(id: string): string {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<
      string,
      { key?: string } | undefined
    >;
    return conns[id]?.key?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Prefer Groq (free whisper-large-v3), then OpenAI. */
export function resolveWhisperConfig(): WhisperConfig | null {
  const groq =
    readConnKey('groq') ||
    (typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_GROQ_API_KEY as string) ?? '' : '');
  if (groq) {
    return {
      provider: 'groq',
      key: groq,
      model: 'whisper-large-v3',
      endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    };
  }
  const openai =
    readConnKey('openai') ||
    (typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_OPENAI_API_KEY as string) ?? '' : '');
  if (openai) {
    return {
      provider: 'openai',
      key: openai,
      model: 'whisper-1',
      endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    };
  }
  return null;
}

export function isWhisperAvailable(): boolean {
  return !!resolveWhisperConfig();
}

export async function transcribeAudio(blob: Blob, lang = 'nl'): Promise<string> {
  const cfg = resolveWhisperConfig();
  if (!cfg) throw new Error('Geen Groq- of OpenAI-key voor Whisper. Zet Groq in Settings → Provider Keys.');

  const form = new FormData();
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('file', blob, `axe-voice.${ext}`);
  form.append('model', cfg.model);
  form.append('language', lang);
  form.append('response_format', 'json');

  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Whisper ${cfg.provider} HTTP ${res.status}: ${body.slice(0, 160)}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

// ── Live recording session ───────────────────────────────────────────────

let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
let rafId = 0;
let speechStartedAt = 0;
let hadSpeech = false;
let stopResolver: ((blob: Blob | null) => void) | null = null;

function clearTimers() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  if (maxTimer) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function pickMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

/**
 * Start mic capture. Resolves with audio blob when silence is detected after
 * speech, max duration hits, or stopRecording() is called.
 */
export async function startRecording(opts?: {
  onLevel?: (rms: number) => void;
  onSpeechStart?: () => void;
}): Promise<void> {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    stopRecording();
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  audioChunks = [];
  hadSpeech = false;
  speechStartedAt = 0;

  const mime = pickMime();
  mediaRecorder = mime
    ? new MediaRecorder(mediaStream, { mimeType: mime })
    : new MediaRecorder(mediaStream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const type = mediaRecorder?.mimeType || mime || 'audio/webm';
    const blob = audioChunks.length ? new Blob(audioChunks, { type }) : null;
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    mediaRecorder = null;
    clearTimers();
    const resolve = stopResolver;
    stopResolver = null;
    resolve?.(blob);
  };

  // VAD: AnalyserNode RMS
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(mediaStream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);

  const tick = () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      void ctx.close().catch(() => {});
      return;
    }
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    opts?.onLevel?.(rms);

    if (rms >= SILENCE_RMS) {
      if (!hadSpeech) {
        hadSpeech = true;
        speechStartedAt = Date.now();
        opts?.onSpeechStart?.();
      }
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    } else if (hadSpeech && Date.now() - speechStartedAt >= MIN_SPEECH_MS && !silenceTimer) {
      silenceTimer = setTimeout(() => {
        stopRecording();
      }, SILENCE_MS);
    }

    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  maxTimer = setTimeout(() => stopRecording(), MAX_RECORD_MS);
  mediaRecorder.start(250);
}

/** Stop capture; returns the recorded blob (or null if empty). */
export function stopRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      mediaStream?.getTracks().forEach((t) => t.stop());
      mediaStream = null;
      clearTimers();
      resolve(null);
      return;
    }
    stopResolver = resolve;
    try {
      mediaRecorder.stop();
    } catch {
      clearTimers();
      mediaStream?.getTracks().forEach((t) => t.stop());
      mediaStream = null;
      mediaRecorder = null;
      resolve(null);
    }
  });
}

export function isRecording(): boolean {
  return !!mediaRecorder && mediaRecorder.state !== 'inactive';
}

/**
 * One-shot: record until silence → Whisper transcript.
 * Call abort via stopRecording() from outside if user cancels.
 */
export async function listenAndTranscribe(opts?: {
  lang?: string;
  onLevel?: (rms: number) => void;
  onSpeechStart?: () => void;
}): Promise<string> {
  await startRecording({
    onLevel: opts?.onLevel,
    onSpeechStart: opts?.onSpeechStart,
  });

  // Wait until recorder stops (silence / max / external stop)
  const blob = await new Promise<Blob | null>((resolve) => {
    const prev = stopResolver;
    stopResolver = (b) => {
      prev?.(b);
      resolve(b);
    };
    // If already stopped between start and here
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      const type = 'audio/webm';
      resolve(audioChunks.length ? new Blob(audioChunks, { type }) : null);
    }
  });

  if (!blob || blob.size < 800) return '';
  return transcribeAudio(blob, opts?.lang ?? 'nl');
}
