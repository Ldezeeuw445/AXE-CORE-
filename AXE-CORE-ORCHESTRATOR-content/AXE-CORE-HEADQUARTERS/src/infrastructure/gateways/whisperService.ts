/**
 * whisperService.ts — speech-to-text for AXE voice conversation.
 *
 * Records mic with MediaRecorder, stops on silence after speech (or explicit
 * stop), transcribes via Groq whisper-large-v3 (free) or OpenAI Whisper.
 * Keys from axe_llm_connections / VITE_GROQ_API_KEY / VITE_OPENAI_API_KEY.
 * TTS (ElevenLabs) is separate — this is STT only.
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
    (typeof import.meta !== 'undefined' ? String(import.meta.env?.VITE_GROQ_API_KEY ?? '') : '');
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
    (typeof import.meta !== 'undefined' ? String(import.meta.env?.VITE_OPENAI_API_KEY ?? '') : '');
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
  if (!cfg) {
    throw new Error(
      'Geen Groq- of OpenAI-key voor Whisper. Zet Groq in Settings → Provider Keys (gratis Whisper).',
    );
  }

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

// ── Session state ────────────────────────────────────────────────────────

let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
let rafId = 0;
let speechStartedAt = 0;
let hadSpeech = false;
let sessionResolve: ((blob: Blob | null) => void) | null = null;
let audioCtx: AudioContext | null = null;

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

function cleanupStream() {
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  void audioCtx?.close().catch(() => {});
  audioCtx = null;
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

function finishSession() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    const blob =
      audioChunks.length > 0
        ? new Blob(audioChunks, { type: audioChunks[0]?.type || 'audio/webm' })
        : null;
    clearTimers();
    cleanupStream();
    mediaRecorder = null;
    const r = sessionResolve;
    sessionResolve = null;
    r?.(blob);
    return;
  }
  try {
    mediaRecorder.stop();
  } catch {
    clearTimers();
    cleanupStream();
    mediaRecorder = null;
    const r = sessionResolve;
    sessionResolve = null;
    r?.(null);
  }
}

/**
 * Record until silence after speech, max duration, or stopRecording().
 * Returns audio blob (or null if empty / cancelled before speech).
 */
export function recordUtterance(opts?: {
  onLevel?: (rms: number) => void;
  onSpeechStart?: () => void;
}): Promise<Blob | null> {
  // Cancel any prior session
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  clearTimers();
  cleanupStream();

  return (async () => {
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

    const done = new Promise<Blob | null>((resolve) => {
      sessionResolve = resolve;
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const type = mediaRecorder?.mimeType || mime || 'audio/webm';
      const blob = audioChunks.length ? new Blob(audioChunks, { type }) : null;
      clearTimers();
      cleanupStream();
      mediaRecorder = null;
      const r = sessionResolve;
      sessionResolve = null;
      r?.(blob);
    };

    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);

    const tick = () => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
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
      } else if (
        hadSpeech &&
        Date.now() - speechStartedAt >= MIN_SPEECH_MS &&
        !silenceTimer
      ) {
        silenceTimer = setTimeout(() => finishSession(), SILENCE_MS);
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    maxTimer = setTimeout(() => finishSession(), MAX_RECORD_MS);
    mediaRecorder.start(250);

    return done;
  })();
}

/** Abort current recording early (user tapped stop). */
export function stopRecording(): void {
  finishSession();
}

export function isRecording(): boolean {
  return !!mediaRecorder && mediaRecorder.state !== 'inactive';
}

/** Record one utterance → Whisper text. Empty string if silence / cancel. */
export async function listenAndTranscribe(opts?: {
  lang?: string;
  onLevel?: (rms: number) => void;
  onSpeechStart?: () => void;
}): Promise<string> {
  const blob = await recordUtterance({
    onLevel: opts?.onLevel,
    onSpeechStart: opts?.onSpeechStart,
  });
  if (!blob || blob.size < 800) return '';
  return transcribeAudio(blob, opts?.lang ?? 'nl');
}
