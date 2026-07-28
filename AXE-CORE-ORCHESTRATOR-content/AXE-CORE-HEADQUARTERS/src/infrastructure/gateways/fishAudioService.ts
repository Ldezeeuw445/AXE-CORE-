/**
 * fishAudioService.ts
 * A second, optional TTS provider — and AXE's default while ElevenLabs
 * needs a paid account. Same security shape as elevenLabsService.ts:
 * - Vercel prod: the API key lives only in the server-side Vercel function
 *   (api/tts-fish.ts), never in the bundle.
 * - `vite dev` / a PACKAGED Tauri app: no server behind the call (and a
 *   packaged app can't reach Vercel at all while its deployment is
 *   paused), so with VITE_FISH_AUDIO_API_KEY baked in at build time this
 *   calls Fish Audio directly instead — same accepted trade-off as the
 *   direct-mode ElevenLabs path.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSharedAudio } from '@/infrastructure/config/audioUnlock';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

const FISH_AUDIO_API_KEY = import.meta.env.VITE_FISH_AUDIO_API_KEY ?? '';
const FISH_AUDIO_BASE_URL = 'https://api.fish.audio/v1/tts';
const USE_DIRECT = !!FISH_AUDIO_API_KEY && (import.meta.env.DEV || (import.meta.env.PROD && isTauriRuntime()));
const FISH_PROXY_URL = '/api/tts-fish';
const FISH_VOICE_KEY = 'axe_fish_voice_id';

/** A Fish Audio "reference_id" — copy it from a voice's page on fish.audio. */
export function getFishVoiceId(): string {
  try { return localStorage.getItem(FISH_VOICE_KEY) ?? ''; } catch { return ''; }
}

export function setFishVoiceId(voiceId: string): void {
  try { localStorage.setItem(FISH_VOICE_KEY, voiceId); } catch { /* ignore */ }
  void saveSetting(FISH_VOICE_KEY, voiceId);
}

/** A packaged Tauri app has no server behind it at all — without a direct
 *  key baked in, there is structurally nothing that could answer
 *  '/api/tts-fish', so require a voice id AND (in that case) a direct key. */
export function isFishAudioConfigured(): boolean {
  const hasVoice = !!getFishVoiceId();
  if (import.meta.env.PROD && isTauriRuntime()) return hasVoice && USE_DIRECT;
  return hasVoice;
}

let currentAudio: HTMLAudioElement | null = null;

function ttsFetch(text: string, voiceId: string): Promise<Response> {
  return USE_DIRECT
    ? fetch(FISH_AUDIO_BASE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${FISH_AUDIO_API_KEY}`, 'Content-Type': 'application/json', model: 's2.1-pro-free' },
        body: JSON.stringify({ text: text.slice(0, 4000), reference_id: voiceId, format: 'mp3', speed: 1.0 }),
      })
    : fetch(FISH_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 4000), voiceId }),
      });
}

export async function speakWithFishAudio(
  text: string,
  onDone?: () => void,
  onError?: (reason: string) => void,
): Promise<void> {
  const voiceId = getFishVoiceId();
  if (!voiceId) { onError?.('No Fish Audio voice configured'); return; }
  if (import.meta.env.PROD && isTauriRuntime() && !USE_DIRECT) {
    onError?.('Packaged Tauri app: set VITE_FISH_AUDIO_API_KEY at build time (no Vercel proxy reachable from a static bundle).');
    return;
  }

  try {
    const res = await ttsFetch(text, voiceId);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        res.status === 503
          ? 'Fish Audio not configured on the server (set FISH_AUDIO_API_KEY in Vercel and redeploy).'
          : `Fish Audio ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
      );
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = getSharedAudio();
    audio.muted = false;
    audio.src = url;
    currentAudio = audio;

    audio.onended = () => { URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; onDone?.(); };
    audio.onerror = () => { URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; onError?.('Playback failed'); };

    await audio.play();
  } catch (err) {
    onError?.(err instanceof Error ? err.message : String(err));
  }
}

export function stopFishAudio(): void {
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* ignore */ }
    currentAudio = null;
  }
}
