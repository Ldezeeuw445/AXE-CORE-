/**
 * fishAudioService.ts
 * Optional TTS provider — default voice is the configured AXE identity voice
 * on Fish Audio Discovery (reference_id).
 *
 * Key resolution:
 * - Settings connection key (if we add fishaudio to keys) or VITE_FISH_AUDIO_API_KEY
 * - Packaged Tauri: VPS proxy (CORS-safe); key optional if VPS holds it
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSharedAudio } from '@/infrastructure/config/audioUnlock';
import { isTauriRuntime, VPS_API_ORIGIN, vpsAuthHeaders } from '@/infrastructure/config/apiUrl';
import { normalizeForSpeech } from '@/domain/speechText';

const ENV_FISH_KEY = import.meta.env.VITE_FISH_AUDIO_API_KEY ?? '';
const USE_VPS_PROXY = import.meta.env.PROD && isTauriRuntime();
const FISH_AUDIO_BASE_URL = 'https://api.fish.audio/v1/tts';
const FISH_PROXY_URL = USE_VPS_PROXY ? `${VPS_API_ORIGIN}/proxy/fish-tts` : '/api/tts-fish';
const FISH_VOICE_KEY = 'axe_fish_voice_id';

/** Default AXE voice on Fish Audio (user-selected identity). */
export const LEWIS_VOICE_ID = 'c9c8850dc8384eb183d0e5e8b9161400';

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


/** A Fish Audio "reference_id" — defaults to the configured AXE voice. */
export function getFishVoiceId(): string {
  // Fixed emergency AXE fallback identity; legacy saved choices cannot drift it.
  return LEWIS_VOICE_ID;
}

/** Persist voice id and switch active TTS provider to Fish. */
export function setFishVoiceId(_voiceId: string): void {
  // Compatibility no-op. AXE exposes one identity, not a provider voice picker.
  try { localStorage.removeItem(FISH_VOICE_KEY); } catch { /* ignore */ }
  void saveSetting(FISH_VOICE_KEY, LEWIS_VOICE_ID);
}

/** Packaged Tauri needs a voice id (proxy may hold the API key). */
export function isFishAudioConfigured(): boolean {
  return !!getFishVoiceId();
}

let currentAudio: HTMLAudioElement | null = null;
let fishAudioContext: AudioContext | null = null;
let fishAnalyser: AnalyserNode | null = null;
let fishLevelData: Uint8Array<ArrayBuffer> | null = null;
let fishSource: MediaElementAudioSourceNode | null = null;

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
    headers: { 'Content-Type': 'application/json', ...vpsAuthHeaders(FISH_PROXY_URL) },
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
  const spoken = normalizeForSpeech(text);
  if (!spoken) { onDone?.(); return; }

  const voiceId = getFishVoiceId();
  if (!voiceId) {
    onError?.('No Fish Audio voice configured');
    return;
  }

  try {
    const res = await ttsFetch(spoken, voiceId);
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

    // The shared Fish fallback is still AXE's voice path, so expose its real
    // playback energy to the same presence visual as OpenAI Cedar. The shared
    // element may only be connected to one MediaElementSourceNode, hence the
    // one-time source and analyser.
    try {
      fishAudioContext ??= new AudioContext();
      if (!fishSource) {
        fishSource = fishAudioContext.createMediaElementSource(audio);
        fishAnalyser = fishAudioContext.createAnalyser();
        fishAnalyser.fftSize = 512;
        fishLevelData = new Uint8Array(fishAnalyser.fftSize);
        fishSource.connect(fishAnalyser);
        fishAnalyser.connect(fishAudioContext.destination);
      }
    } catch {
      fishAnalyser = null;
      fishLevelData = null;
    }

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


/** Live 0..1 RMS of the fixed Fish fallback playback. */
export function getFishTtsLevel(): number {
  if (!fishAnalyser || !fishLevelData || !currentAudio || currentAudio.paused) return 0;
  fishAnalyser.getByteTimeDomainData(fishLevelData);
  let sum = 0;
  for (const v of fishLevelData) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / fishLevelData.length) * 3.2);
}
