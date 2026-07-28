/**
 * fishAudioService.ts
 * A second, optional TTS provider. ElevenLabs stays AXE's default voice —
 * this exists for a specific voice Fish Audio's library has that
 * ElevenLabs' doesn't, selectable in Settings, never silently swapped in.
 * Same security shape as elevenLabsService.ts: the API key lives only in
 * the server-side Vercel function (api/tts-fish.ts), never in the bundle.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSharedAudio } from '@/infrastructure/config/audioUnlock';

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

/** Client-side we can only know a voice id was entered — whether the server
 *  actually has FISH_AUDIO_API_KEY set is revealed by the first real call
 *  (a 503 means "not configured"), same honesty contract as ElevenLabs. */
export function isFishAudioConfigured(): boolean {
  return !!getFishVoiceId();
}

let currentAudio: HTMLAudioElement | null = null;

export async function speakWithFishAudio(
  text: string,
  onDone?: () => void,
  onError?: (reason: string) => void,
): Promise<void> {
  const voiceId = getFishVoiceId();
  if (!voiceId) { onError?.('No Fish Audio voice configured'); return; }

  try {
    const res = await fetch(FISH_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 4000), voiceId }),
    });
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
