/**
 * elevenLabsService.ts
 * High-quality text-to-speech via ElevenLabs API.
 * Falls back to browser speechSynthesis if ElevenLabs is not configured.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';

// The API key path depends on environment:
// - PROD: never in the browser. All calls go through the same-origin Vercel
//   function /api/tts, which injects the server-side ELEVENLABS_API_KEY. This
//   is what makes "set it in Vercel env vars" actually work, and keeps the
//   key out of the public bundle.
// - DEV: developer convenience — if VITE_ELEVENLABS_API_KEY is present, call
//   ElevenLabs directly (no serverless function running under `vite dev`).
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY ?? '';
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const USE_DIRECT = import.meta.env.DEV && !!ELEVENLABS_API_KEY;
const TTS_PROXY_URL = '/api/tts';

// JARVIS-tuned delivery, sent to the proxy so the tuning lives in one place.
// Calm, composed, warm — not flat, not rushed. speed just under 1.0 gives a
// deliberate, unhurried cadence, the single biggest lever on "sounds like
// Jarvis". model kept as turbo for low latency + NL/EN auto-detection.
const TTS_MODEL_ID = 'eleven_turbo_v2_5';
const TTS_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.85,
  style: 0.55,
  speed: 0.94,
  use_speaker_boost: true,
};

export interface ElevenLabsVoice {
  id: string;
  name: string;
  accent: string;
  gender: string;
  description: string;
}

// Fallback only — used if the live /v1/voices fetch fails. Hardcoded voice
// IDs go stale exactly like the Gemini model-name bug did: ElevenLabs can
// retire/rename premade voices, and an ID that isn't actually reachable on
// this account silently falls through to the browser-TTS fallback below,
// which is what made every "different" voice sound identical. Prefer
// fetchAvailableVoices() for the real, current list tied to this API key.
export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', accent: 'British', gender: 'Male', description: 'Warm, smart, JARVIS-style AI assistant voice (default)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', accent: 'American', gender: 'Male', description: 'Deep, calm, authoritative' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', accent: 'American', gender: 'Male', description: 'Warm, friendly, natural' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', accent: 'British', gender: 'Male', description: 'Warm, friendly, well-rounded' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', accent: 'American', gender: 'Female', description: 'Warm, friendly, conversational' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', accent: 'British', gender: 'Female', description: 'Soft, elegant, refined' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', accent: 'Australian', gender: 'Male', description: 'Casual, approachable, natural' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', accent: 'American', gender: 'Female', description: 'Clear, professional, warm' },
  { id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', accent: 'American', gender: 'Male', description: 'Young, energetic, upbeat' },
];

/** Real voice list for this account/API key — GET /v1/voices (via the proxy
 *  in prod, direct in dev), not a hardcoded guess. Throws if ElevenLabs
 *  isn't configured or the call fails; callers decide whether/how to fall
 *  back, rather than this function silently substituting something else. */
export async function fetchAvailableVoices(): Promise<ElevenLabsVoice[]> {
  const res = USE_DIRECT
    ? await fetch(`${ELEVENLABS_BASE_URL}/voices`, { headers: { 'xi-api-key': ELEVENLABS_API_KEY } })
    : await fetch(TTS_PROXY_URL, { method: 'GET' });
  if (!res.ok) {
    // 503 from the proxy = no server-side key set.
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

/** Fast, synchronous read — used on the hot path when actually speaking.
 *  localStorage is hydrated from Supabase on login (see hydrateSettingsFromSupabase),
 *  so this stays in sync across devices without an async round-trip per utterance. */
export function getSelectedVoiceId(): string {
  return localStorage.getItem(TTS_VOICE_KEY) ?? ELEVENLABS_VOICES[0].id; // Default: Daniel — friendly, smart, JARVIS-like
}

/** Persists the chosen voice for this user — locally right away, and to
 *  Supabase in the background so it's the same voice on every device. */
export function setSelectedVoiceId(voiceId: string): void {
  localStorage.setItem(TTS_VOICE_KEY, voiceId);
  void saveSetting(TTS_VOICE_KEY, voiceId);
}

/** In dev this reflects the VITE key. In prod the real key lives server-side
 *  and the browser can't see it synchronously, so we report true optimistically
 *  and let the actual /api/tts call reveal the truth (a 503 there means
 *  "no server key" and callers fall back cleanly). */
export function isElevenLabsConfigured(): boolean {
  return USE_DIRECT ? !!ELEVENLABS_API_KEY : true;
}

// Tracked so stopTTS() can actually stop an in-flight ElevenLabs clip —
// previously it only cancelled window.speechSynthesis, so a second preview
// while one was still playing never stopped the first.
let currentAudio: HTMLAudioElement | null = null;

/**
 * Speak text using ElevenLabs if configured, otherwise fall back to browser TTS.
 * `onFallback` fires (with the real reason) whenever ElevenLabs didn't
 * actually speak this — the caller decides whether to surface that, but it's
 * never swallowed silently: a browser-voice fallback sounding identical
 * regardless of which ElevenLabs voice was "selected" is exactly the bug
 * this parameter exists to make visible instead of invisible.
 */
/** One TTS request for a given voice id (proxy in prod, direct in dev). */
function ttsFetch(text: string, voiceId: string): Promise<Response> {
  const payload = { text: text.slice(0, 4000), model_id: TTS_MODEL_ID, voice_settings: TTS_VOICE_SETTINGS };
  return USE_DIRECT
    ? fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    : fetch(TTS_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, voiceId }),
      });
}

/** The first voice actually available on this account — the real, valid id to
 *  fall back to when a saved id is rejected. Returns null if none. */
async function firstValidVoiceId(): Promise<string | null> {
  const list = await fetchAvailableVoices();
  return list[0]?.id ?? null;
}

export async function speakWithElevenLabs(
  text: string,
  onDone?: () => void,
  onError?: () => void,
  onFallback?: (reason: string) => void,
): Promise<void> {
  // Try ElevenLabs first (via the same-origin proxy in prod, direct in dev)
  if (isElevenLabsConfigured()) {
    try {
      let response = await ttsFetch(text, getSelectedVoiceId());

      // Self-heal a stale/invalid voice id (invalid_uid): the saved id — often
      // a hardcoded fallback that isn't on THIS account — gets rejected with a
      // 400. Fetch the account's real voices, switch to the first valid one,
      // persist it, and retry once so it "just works" instead of silently
      // dropping to the browser voice forever.
      if (!response.ok && response.status === 400) {
        const body = await response.clone().text().catch(() => '');
        if (/invalid_uid|voice/i.test(body)) {
          const healed = await firstValidVoiceId().catch(() => null);
          if (healed && healed !== getSelectedVoiceId()) {
            setSelectedVoiceId(healed);
            response = await ttsFetch(text, healed);
          }
        }
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`ElevenLabs ${response.status}: ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
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
      // Fall through to browser TTS
    }
  } else {
    onFallback?.('ElevenLabs not configured');
  }

  // Browser fallback
  speakWithBrowser(text, onDone);
}

/**
 * Browser speechSynthesis fallback.
 */
export function speakWithBrowser(text: string, onDone?: () => void): void {
  try {
    if (!('speechSynthesis' in window)) {
      onDone?.();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // Match the JARVIS-ish delivery of the ElevenLabs path as closely as the
    // browser engine allows: a hair slower and slightly lower-pitched reads
    // as calm and composed instead of the default chirpy TTS cadence.
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.volume = 1.0;

    // AXE replies in whichever language Luka wrote in, so the fallback voice
    // must follow the TEXT, not a fixed locale (the old always-nl-NL setting
    // mispronounced every English reply). Light heuristic: a few unmistakably
    // Dutch function words → Dutch, else English.
    const isDutch = /\b(het|een|de|ik|je|niet|met|voor|maar|ook|even|zodra|akkoord|geen|wel)\b/i.test(text);
    const voices = window.speechSynthesis.getVoices();
    // Deep male voices first ("Daniel" en-GB is the classic Jarvis-adjacent
    // system voice), matched to the detected language.
    const preferredVoices = isDutch
      ? ['Xander', 'Google Nederlands', 'Daniel']
      : ['Daniel', 'Google UK English Male', 'Arthur', 'Oliver', 'Alex'];

    let picked: SpeechSynthesisVoice | undefined;
    for (const name of preferredVoices) {
      picked = voices.find(v => v.name.includes(name));
      if (picked) break;
    }
    if (picked) {
      utterance.voice = picked;
      utterance.lang = picked.lang;
    } else {
      utterance.lang = isDutch ? 'nl-NL' : 'en-GB';
    }

    utterance.onend = () => onDone?.();
    utterance.onerror = () => onDone?.();

    window.speechSynthesis.speak(utterance);
  } catch {
    onDone?.();
  }
}

/**
 * Stop any active TTS.
 */
export function stopTTS(): void {
  try {
    window.speechSynthesis.cancel();
  } catch { /* ignore */ }
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* ignore */ }
    currentAudio = null;
  }
}
