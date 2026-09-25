/**
 * elevenLabsService.ts
 * High-quality text-to-speech via ElevenLabs API.
 * Falls back to browser speechSynthesis if ElevenLabs is not configured.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { getReplyLanguage } from '@/domain/replyLanguage';
import { STEMMEN } from '@/domain/stemKeuzes';
import { normalizeForSpeech } from '@/domain/speechText';

const ENV_ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY ?? '';
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const TTS_PROXY_URL = '/api/tts';

function settingsElevenLabsKey(): string {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<
      string,
      { key?: string } | undefined
    >;
    return (conns.elevenlabs?.key ?? '').trim();
  } catch {
    return '';
  }
}

function resolveElevenLabsKey(): string {
  return settingsElevenLabsKey() || ENV_ELEVENLABS_KEY;
}

function useDirectElevenLabs(): boolean {
  const key = resolveElevenLabsKey();
  if (!key) return false;
  return import.meta.env.DEV || (import.meta.env.PROD && isTauriRuntime());
}

/**
 * Realtime Scribe is enabled only on Luka's local/dev or packaged Tauri
 * surface, where AXE already allows the user-owned ElevenLabs key for TTS.
 * The public web build must never pull that key from local storage into a
 * provider request; there it simply keeps using the existing Whisper path.
 */
export function isElevenLabsRealtimeScribeConfigured(): boolean {
  return !!resolveElevenLabsKey() && (import.meta.env.DEV || isTauriRuntime());
}

/**
 * Exchange the local ElevenLabs key for the short-lived, single-use token
 * required by Scribe's client-side WebSocket. The API key is never put in the
 * WebSocket URL and the token is consumed as soon as the realtime session
 * opens.
 */
export async function createElevenLabsRealtimeScribeToken(): Promise<string> {
  if (!isElevenLabsRealtimeScribeConfigured()) {
    throw new Error('ElevenLabs realtime voice is not configured on this device.');
  }
  const key = resolveElevenLabsKey();
  const response = await fetch(`${ELEVENLABS_BASE_URL}/single-use-token/realtime_scribe`, {
    method: 'POST',
    headers: { 'xi-api-key': key },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs realtime token ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}`);
  }
  const data = await response.json() as { token?: string };
  if (!data.token) throw new Error('ElevenLabs returned no realtime token.');
  return data.token;
}

const TTS_MODEL_ID = 'eleven_flash_v2_5';
const TTS_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.85,
  style: 0.65,
  speed: 1.0,
  use_speaker_boost: true,
};

/**
 * De stem waarmee we praten als er nog niets gekozen is.
 *
 * Hier stond een lijst van negen stemmen plus een ophaler voor de HELE
 * ElevenLabs-bibliotheek. Dat leverde tientallen namen op die voor dit doel
 * nauwelijks verschillen, en de instellingen zijn daarom teruggebracht tot vier
 * keuzes (domain/stemKeuzes). Die lijst is nu de enige plek waar stem-id's
 * staan; twee lijsten zouden gegarandeerd uit elkaar lopen.
 */
const STANDAARD_EL_STEM =
  STEMMEN.find(s => s.motor === 'elevenlabs')?.stemId ?? 'pNInz6obpgDQGcFmaJgB';



const TTS_VOICE_KEY = 'axe_tts_voice';
const TTS_PROVIDER_KEY = 'axe_tts_provider';

export function getSelectedVoiceId(): string {
  try {
    return localStorage.getItem(TTS_VOICE_KEY)?.trim() || STANDAARD_EL_STEM;
  } catch {
    return STANDAARD_EL_STEM;
  }
}

export function setSelectedVoiceId(voiceId: string): void {
  const schoon = voiceId.trim();
  try {
    if (schoon) localStorage.setItem(TTS_VOICE_KEY, schoon);
    else localStorage.removeItem(TTS_VOICE_KEY);
    localStorage.setItem(TTS_PROVIDER_KEY, 'elevenlabs');
  } catch { /* ignore */ }
  void saveSetting(TTS_VOICE_KEY, schoon);
  void saveSetting(TTS_PROVIDER_KEY, 'elevenlabs');
}

export function isElevenLabsConfigured(): boolean {
  const key = resolveElevenLabsKey();
  if (import.meta.env.PROD && isTauriRuntime()) return !!key;
  return !!key || !useDirectElevenLabs();
}

export async function testElevenLabsKey(key?: string): Promise<{ ok: boolean; error?: string }> {
  const k = key?.trim() || resolveElevenLabsKey();
  if (!k) return { ok: false, error: 'Geen key ingesteld (Settings → ElevenLabs of VITE_ELEVENLABS_API_KEY)' };
  try {
    const res = await fetch(`${ELEVENLABS_BASE_URL}/user`, {
      headers: { 'xi-api-key': k },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body?.detail?.message ?? `ElevenLabs HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'ElevenLabs unreachable' };
  }
}

let currentAudio: HTMLAudioElement | null = null;
let elAudioContext: AudioContext | null = null;
let elAnalyser: AnalyserNode | null = null;
let elLevelData: Uint8Array<ArrayBuffer> | null = null;

/** Live 0..1 RMS van ElevenLabs-afspelen. Eigen Audio — niet getSharedAudio. */
export function getElevenLabsTtsLevel(): number {
  if (!elAnalyser || !elLevelData || !currentAudio || currentAudio.paused) return 0;
  elAnalyser.getByteTimeDomainData(elLevelData);
  let som = 0;
  for (const v of elLevelData) {
    const x = (v - 128) / 128;
    som += x * x;
  }
  return Math.min(1, Math.sqrt(som / elLevelData.length) * 3.2);
}

function elevenLanguageCode(): string {
  const mode = getReplyLanguage();
  if (mode === 'nl') return 'nl';
  return 'en';
}

function elevenLabsModelId(model?: string): string {
  if (
    model === 'eleven_v3_conversational' ||
    model === 'eleven_v3' ||
    model === 'eleven_flash_v2_5' ||
    model === 'eleven_turbo_v2_5'
  ) return model;
  return TTS_MODEL_ID;
}

function ttsFetch(text: string, voiceId: string, model?: string): Promise<Response> {
  const payload = {
    text: text.slice(0, 4000),
    model_id: elevenLabsModelId(model),
    voice_settings: TTS_VOICE_SETTINGS,
    language_code: elevenLanguageCode(),
  };
  const key = resolveElevenLabsKey();
  if (useDirectElevenLabs() && key) {
    return fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  return fetch(TTS_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, voiceId }),
  });
}

export async function speakWithElevenLabs(
  text: string,
  onDone?: () => void,
  onError?: () => void,
  onFallback?: (reason: string) => void,
  opts?: { model?: string; onStart?: () => void },
): Promise<void> {
  const spoken = normalizeForSpeech(text);
  if (!spoken) { onDone?.(); return; }

  if (isElevenLabsConfigured()) {
    try {
      const currentVoice = getSelectedVoiceId();
      const response = await ttsFetch(spoken, currentVoice, opts?.model);

      /* One fixed voice: if the selected voice-id is invalid on this key we do
       * NOT quietly switch to a different ElevenLabs voice and remember it —
       * that is how "you asked for Man and got someone else for a month"
       * happened. We surface the error and let the caller fall back to the
       * browser voice, leaving the user's chosen voice-id untouched. */
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`ElevenLabs ${response.status}: ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      // Eigen element: getSharedAudio mag niet een tweede MediaElementSource
      // krijgen (Fish hangt daar al aan).
      const audio = new Audio(url);
      audio.muted = false;
      currentAudio = audio;
      elAudioContext ??= new AudioContext();
      void elAudioContext.resume().catch(() => {});
      if (!elAnalyser) {
        elAnalyser = elAudioContext.createAnalyser();
        elAnalyser.fftSize = 512;
        elLevelData = new Uint8Array(elAnalyser.fftSize);
        elAnalyser.connect(elAudioContext.destination);
      }
      elAudioContext.createMediaElementSource(audio).connect(elAnalyser);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        onDone?.();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        onError?.();
      };

      await audio.play();
      opts?.onStart?.();
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('[ElevenLabs] TTS failed, falling back to browser:', reason);
      onFallback?.(reason);
    }
  } else {
    onFallback?.('ElevenLabs not configured');
  }

  speakWithBrowser(text, onDone);
}

export function speakWithBrowser(text: string, onDone?: () => void): void {
  try {
    if (!('speechSynthesis' in window)) {
      onDone?.();
      return;
    }

    const spoken = normalizeForSpeech(text);
    if (!spoken) { onDone?.(); return; }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.rate = 1.02;
    utterance.pitch = 0.88;
    utterance.volume = 1.0;

    const mode = getReplyLanguage();
    const isDutch =
      mode === 'nl' ||
      (mode === 'auto' && /\b(het|een|de|ik|je|niet|met|voor|maar|ook|even|zodra|akkoord|geen|wel)\b/i.test(text));
    const voices = window.speechSynthesis.getVoices();
    const preferredVoices = isDutch
      ? ['Xander', 'Google Nederlands', 'Google Dutch', 'Ellen']
      : ['Alex', 'Daniel', 'Google US English', 'Google UK English Male', 'Arthur', 'Oliver', 'Samantha'];

    let picked: SpeechSynthesisVoice | undefined;
    for (const name of preferredVoices) {
      picked = voices.find(v => v.name.includes(name));
      if (picked) break;
    }
    if (picked) {
      utterance.voice = picked;
      utterance.lang = picked.lang;
    } else {
      utterance.lang = isDutch ? 'nl-NL' : 'en-US';
    }

    utterance.onend = () => onDone?.();
    utterance.onerror = () => onDone?.();

    window.speechSynthesis.speak(utterance);
  } catch {
    onDone?.();
  }
}

export function stopTTS(): void {
  try {
    window.speechSynthesis.cancel();
  } catch { /* ignore */ }
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* ignore */ }
    currentAudio = null;
  }
}
