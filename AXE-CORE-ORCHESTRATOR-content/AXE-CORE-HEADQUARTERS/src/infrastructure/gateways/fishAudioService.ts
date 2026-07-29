/**
 * fishAudioService.ts
 * Optional TTS provider — default voice is "Lewis" (Damian Lewis style,
 * commonly used as a Bobby Axelrod stand-in on Fish Audio Discovery).
 *
 * Key resolution:
 * - Settings connection key (if we add fishaudio to keys) or VITE_FISH_AUDIO_API_KEY
 * - Packaged Tauri: VPS proxy (CORS-safe); key optional if VPS holds it
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSharedAudio } from '@/infrastructure/config/audioUnlock';
import { isTauriRuntime, VPS_API_ORIGIN } from '@/infrastructure/config/apiUrl';

const ENV_FISH_KEY = import.meta.env.VITE_FISH_AUDIO_API_KEY ?? '';
const USE_VPS_PROXY = import.meta.env.PROD && isTauriRuntime();
const FISH_AUDIO_BASE_URL = 'https://api.fish.audio/v1/tts';
const FISH_PROXY_URL = USE_VPS_PROXY ? `${VPS_API_ORIGIN}/proxy/fish-tts` : '/api/tts-fish';
const FISH_VOICE_KEY = 'axe_fish_voice_id';
const TTS_PROVIDER_KEY = 'axe_tts_provider';

/** Lewis on Fish Audio Discovery — Damian Lewis / Bobby Axelrod–style. */
export const LEWIS_VOICE_ID = 'e385288efc394446b3155a4fdaf24b75';

function settingsFishKey(): string {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<
      string,
      { key?: string } | undefined
    >;
    return (conns.fishaudio?.key ?? conns.fish?.key ?? '').trim();
  } catch {
    return '';
  }
}

function resolveFishKey(): string {
  return settingsFishKey() || ENV_FISH_KEY;
}

const USE_DIRECT = !USE_VPS_PROXY && !!resolveFishKey() && import.meta.env.DEV;

function sanitizeVoiceId(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, '');
}

/** A Fish Audio "reference_id" — defaults to Lewis (Axelrod-style). */
export function getFishVoiceId(): string {
  try {
    const stored = sanitizeVoiceId(localStorage.getItem(FISH_VOICE_KEY) ?? '');
    return stored || LEWIS_VOICE_ID;
  } catch {
    return LEWIS_VOICE_ID;
  }
}

/** Persist voice id and switch active TTS provider to Fish. */
export function setFishVoiceId(voiceId: string): void {
  const clean = sanitizeVoiceId(voiceId) || LEWIS_VOICE_ID;
  try {
    localStorage.setItem(FISH_VOICE_KEY, clean);
    localStorage.setItem(TTS_PROVIDER_KEY, 'fish');
  } catch { /* ignore */ }
  void saveSetting(FISH_VOICE_KEY, clean);
  void saveSetting(TTS_PROVIDER_KEY, 'fish');
}

/** Packaged Tauri needs a voice id (proxy may hold the API key). */
export function isFishAudioConfigured(): boolean {
  return !!getFishVoiceId();
}

let currentAudio: HTMLAudioElement | null = null;

function ttsFetch(text: string, voiceId: string): Promise<Response> {
  const key = resolveFishKey();
  if (USE_DIRECT && key) {
    return fetch(FISH_AUDIO_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        model: 's2.1-pro-free',
      },
      body: JSON.stringify({
        text: text.slice(0, 4000),
        reference_id: voiceId,
        format: 'mp3',
        speed: 1.0,
      }),
    });
  }
  return fetch(FISH_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text.slice(0, 4000),
      voiceId,
      key: USE_VPS_PROXY ? key || undefined : undefined,
    }),
  });
}

export async function speakWithFishAudio(
  text: string,
  onDone?: () => void,
  onError?: (reason: string) => void,
): Promise<void> {
  const voiceId = getFishVoiceId();
  if (!voiceId) {
    onError?.('No Fish Audio voice configured');
    return;
  }

  try {
    const res = await ttsFetch(text, voiceId);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        res.status === 503
          ? 'Fish Audio not configured on the server (set FISH_AUDIO_API_KEY on VPS/Vercel).'
          : `Fish Audio ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
      );
    }

    const blob = await res.blob();
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
      onError?.('Playback failed');
    };

    await audio.play();
  } catch (err) {
    onError?.(err instanceof Error ? err.message : String(err));
  }
}

export function stopFishAudio(): void {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch { /* ignore */ }
    currentAudio = null;
  }
}
