/**
 * elevenLabsService.ts
 * High-quality text-to-speech via ElevenLabs API.
 * Falls back to browser speechSynthesis if ElevenLabs is not configured.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSharedAudio } from '@/infrastructure/config/audioUnlock';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { getReplyLanguage } from '@/domain/replyLanguage';

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

const TTS_MODEL_ID = 'eleven_turbo_v2_5';
const TTS_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.85,
  style: 0.65,
  speed: 1.0,
  use_speaker_boost: true,
};

export interface ElevenLabsVoice {
  id: string;
  name: string;
  accent: string;
  gender: string;
  description: string;
}

export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', accent: 'American', gender: 'Male', description: 'Deep, confident, authoritative — closest to Bobby Axelrod (AXE default)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', accent: 'British', gender: 'Male', description: 'Warm, smart, JARVIS-style' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', accent: 'American', gender: 'Male', description: 'Warm, friendly, natural' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', accent: 'British', gender: 'Male', description: 'Warm, friendly, well-rounded' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', accent: 'American', gender: 'Female', description: 'Warm, friendly, conversational' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', accent: 'British', gender: 'Female', description: 'Soft, elegant, refined' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', accent: 'Australian', gender: 'Male', description: 'Casual, approachable, natural' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', accent: 'American', gender: 'Female', description: 'Clear, professional, warm' },
  { id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', accent: 'American', gender: 'Male', description: 'Young, energetic, upbeat' },
];

export async function fetchAvailableVoices(): Promise<ElevenLabsVoice[]> {
  const key = resolveElevenLabsKey();
  const direct = useDirectElevenLabs();
  const res = direct
    ? await fetch(`${ELEVENLABS_BASE_URL}/voices`, { headers: { 'xi-api-key': key } })
    : await fetch(TTS_PROXY_URL, { method: 'GET' });
  if (!res.ok) {
    if (res.status === 503) throw new Error('ElevenLabs not configured on the server (set ELEVENLABS_API_KEY in Vercel and redeploy).');
    throw new Error(`ElevenLabs ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  const voices = Array.isArray(data?.voices) ? data.voices : [];
  return voices.map((v: Record<string, unknown>) => {
    const labels = (v.labels as Record<string, string> | undefined) ?? {};
    return {
      id: String(v.voice_id ?? ''),
      name: String(v.name ?? 'Unknown'),
      accent: labels.accent ?? '—',
      gender: labels.gender ?? '—',
      description: String(v.description ?? labels.description ?? labels.use_case ?? ''),
    };
  }).filter((v: ElevenLabsVoice) => v.id);
}

const TTS_VOICE_KEY = 'axe_tts_voice';
const TTS_PROVIDER_KEY = 'axe_tts_provider';

export function getSelectedVoiceId(): string {
  return localStorage.getItem(TTS_VOICE_KEY) ?? ELEVENLABS_VOICES[0].id;
}

export function setSelectedVoiceId(voiceId: string): void {
  localStorage.setItem(TTS_VOICE_KEY, voiceId);
  localStorage.setItem(TTS_PROVIDER_KEY, 'elevenlabs');
  void saveSetting(TTS_VOICE_KEY, voiceId);
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

function elevenLanguageCode(): string {
  const mode = getReplyLanguage();
  if (mode === 'nl') return 'nl';
  return 'en';
}

function ttsFetch(text: string, voiceId: string): Promise<Response> {
  const payload = {
    text: text.slice(0, 4000),
    model_id: TTS_MODEL_ID,
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
): Promise<void> {
  if (isElevenLabsConfigured()) {
    try {
      const currentVoice = getSelectedVoiceId();
      let response = await ttsFetch(text, currentVoice);

      if (!response.ok && response.status === 400) {
        const body = await response.clone().text().catch(() => '');
        if (/invalid_uid|voice/i.test(body)) {
          const fetched = await fetchAvailableVoices().catch(() => [] as ElevenLabsVoice[]);
          const seen = new Set<string>([currentVoice]);
          let tried = 0;
          for (const v of [...fetched, ...ELEVENLABS_VOICES]) {
            if (seen.has(v.id) || tried >= 8) continue;
            seen.add(v.id);
            tried++;
            const retry = await ttsFetch(text, v.id);
            if (retry.ok) { setSelectedVoiceId(v.id); response = retry; break; }
          }
        }
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`ElevenLabs ${response.status}: ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = getSharedAudio();
      audio.muted = false;
      audio.src = url;
      currentAudio = audio;

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

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
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
