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
import { isTauriRuntime, VPS_API_ORIGIN } from '@/infrastructure/config/apiUrl';

const FISH_AUDIO_API_KEY = import.meta.env.VITE_FISH_AUDIO_API_KEY ?? '';
// Fish Audio's API doesn't answer CORS preflight requests properly (401s
// the OPTIONS instead of returning Access-Control-Allow-*), so a packaged
// Tauri app calling it directly from the webview gets silently blocked
// before the real request goes out ("Load failed") — even with a valid
// key. Route through the VPS proxy instead, where CORS doesn't apply
// (server-to-server). Verified: the direct call 401s its own preflight,
// the proxied one returns real, playable audio.
const USE_VPS_PROXY = import.meta.env.PROD && isTauriRuntime();
const FISH_AUDIO_BASE_URL = 'https://api.fish.audio/v1/tts';
const USE_DIRECT = !USE_VPS_PROXY && !!FISH_AUDIO_API_KEY && import.meta.env.DEV;
const FISH_PROXY_URL = USE_VPS_PROXY ? `${VPS_API_ORIGIN}/proxy/fish-tts` : '/api/tts-fish';
const FISH_VOICE_KEY = 'axe_fish_voice_id';

// Fish Audio's reference_id must be 1-128 chars of [A-Za-z0-9_-] — a pasted
// value wrapped in quotes (e.g. copied from a JSON snippet) fails that check
// with a 400 no matter how many times you re-paste it, since the quotes
// themselves are invalid characters. Strip them defensively on both read and
// write so an already-bad stored value self-heals without retyping.
function sanitizeVoiceId(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, '');
}

/** A Fish Audio "reference_id" — copy it from a voice's page on fish.audio. */
export function getFishVoiceId(): string {
  try { return sanitizeVoiceId(localStorage.getItem(FISH_VOICE_KEY) ?? ''); } catch { return ''; }
}

export function setFishVoiceId(voiceId: string): void {
  const clean = sanitizeVoiceId(voiceId);
  try { localStorage.setItem(FISH_VOICE_KEY, clean); } catch { /* ignore */ }
  void saveSetting(FISH_VOICE_KEY, clean);
}

/** A packaged Tauri app routes through the VPS proxy (no key needed locally
 *  — the VPS can hold its own FISH_AUDIO_API_KEY — but the client-baked key
 *  still works as a fallback the proxy accepts). Just needs a voice id. */
export function isFishAudioConfigured(): boolean {
  const hasVoice = !!getFishVoiceId();
  if (import.meta.env.PROD && isTauriRuntime()) return hasVoice;
  return hasVoice;
}

let currentAudio: HTMLAudioElement | null = null;

function ttsFetch(text: string, voiceId: string): Promise<Response> {
  if (USE_DIRECT) {
    return fetch(FISH_AUDIO_BASE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${FISH_AUDIO_API_KEY}`, 'Content-Type': 'application/json', model: 's2.1-pro-free' },
      body: JSON.stringify({ text: text.slice(0, 4000), reference_id: voiceId, format: 'mp3', speed: 1.0 }),
    });
  }
  return fetch(FISH_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // key: only meaningful for the VPS proxy (falls back to the client's
    // own VITE_-baked key if the VPS has no FISH_AUDIO_API_KEY of its own);
    // harmless no-op for the Vercel proxy, which ignores unknown fields.
    body: JSON.stringify({ text: text.slice(0, 4000), voiceId, key: USE_VPS_PROXY ? FISH_AUDIO_API_KEY : undefined }),
  });
}

export async function speakWithFishAudio(
  text: string,
  onDone?: () => void,
  onError?: (reason: string) => void,
): Promise<void> {
  const voiceId = getFishVoiceId();
  if (!voiceId) { onError?.('No Fish Audio voice configured'); return; }

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
