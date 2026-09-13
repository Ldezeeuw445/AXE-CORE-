/**
 * elevenLabsService.ts
 * High-quality text-to-speech via ElevenLabs API.
 * Falls back to browser speechSynthesis if ElevenLabs is not configured.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSharedAudio } from '@/infrastructure/config/audioUnlock';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { getReplyLanguage } from '@/domain/replyLanguage';
import { STEMMEN } from '@/domain/stemKeuzes';

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

function getSelectedVoiceId(): string {
  return localStorage.getItem(TTS_VOICE_KEY) ?? STANDAARD_EL_STEM;
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
          /* Onbekende stem-id: probeer de ANDERE die we aanbieden.
           *
           * Dit haalde eerst de hele bibliotheek op en probeerde er acht. Dat
           * kon een willekeurige stem opleveren die je nooit gekozen had, en
           * die bleef dan staan -- je vroeg om "Man" en kreeg een maand lang
           * iemand anders. We bieden er twee aan; is de ene ongeldig op deze
           * sleutel, dan is de andere de enige zinnige poging. Lukt die ook
           * niet, dan valt hij verderop netjes terug op de browserstem. */
          for (const kandidaat of STEMMEN) {
            if (kandidaat.motor !== 'elevenlabs') continue;
            if (!kandidaat.stemId || kandidaat.stemId === currentVoice) continue;
            const retry = await ttsFetch(text, kandidaat.stemId);
            if (retry.ok) { setSelectedVoiceId(kandidaat.stemId); response = retry; break; }
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
