/**
 * elevenLabsService.ts
 * High-quality text-to-speech via ElevenLabs API.
 * Falls back to browser speechSynthesis if ElevenLabs is not configured.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { getSharedAudio } from '@/infrastructure/config/audioUnlock';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

// The API key path depends on environment:
// - Vercel prod (the real web app): never in the browser. Calls go through
//   the same-origin Vercel function /api/tts, which injects the server-side
//   ELEVENLABS_API_KEY. Keeps the key out of the public bundle.
// - `vite dev` / `tauri:dev`: developer convenience — if
//   VITE_ELEVENLABS_API_KEY is present, call ElevenLabs directly (no
//   serverless function running locally).
// - A PACKAGED Tauri app: same as dev — there is no server behind the
//   static bundle, and (unlike Vercel) it can't run at all while Vercel's
//   deployment is paused. A relative '/api/tts' 404s regardless. So a
//   packaged build with VITE_ELEVENLABS_API_KEY baked in at build time
//   also calls ElevenLabs directly — the same trade-off already accepted
//   for provider keys typed into Settings (this is a single-user desktop
//   app; the key is extractable from the bundle either way).
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY ?? '';
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const USE_DIRECT = !!ELEVENLABS_API_KEY && (import.meta.env.DEV || (import.meta.env.PROD && isTauriRuntime()));
const TTS_PROXY_URL = '/api/tts';

// Axelrod-tuned delivery, sent to the proxy so the tuning lives in one place.
// Confident, direct, a little assertive — not the slow/calm Jarvis cadence
// this used to be. speed at 1.0 (not dragged under it) + a higher style
// value are the two levers that move it from "composed butler" to "founder
// who already knows the answer". model kept as turbo for low latency +
// NL/EN auto-detection.
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

// Fallback only — used if the live /v1/voices fetch fails. Hardcoded voice
// IDs go stale exactly like the Gemini model-name bug did: ElevenLabs can
// retire/rename premade voices, and an ID that isn't actually reachable on
// this account silently falls through to the browser-TTS fallback below,
// which is what made every "different" voice sound identical. Prefer
// fetchAvailableVoices() for the real, current list tied to this API key.
export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  // Adam leads the list (and is the default below) to match the confident,
  // commanding "Bobby Axelrod" delivery this app is tuned for everywhere
  // else (see the browser-TTS fallback's voice choice below) — Daniel's
  // warm JARVIS read was inconsistent with that.
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', accent: 'American', gender: 'Male', description: 'Deep, confident, authoritative — AXE default' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', accent: 'British', gender: 'Male', description: 'Warm, smart, JARVIS-style' },
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
  // A packaged Tauri app has no server behind it at all — if it's not using
  // a direct key, there is structurally nothing that could answer '/api/tts'
  // (unlike Vercel prod, where the actual call reveals the truth), so
  // "optimistically true" would just be wrong here, not merely unconfirmed.
  if (import.meta.env.PROD && isTauriRuntime()) return USE_DIRECT;
  return USE_DIRECT ? !!ELEVENLABS_API_KEY : true;
}

/** Real connectivity test for the Settings card — a cheap GET, not a TTS
 *  call. Only meaningful in a packaged Tauri app (direct key required);
 *  on Vercel/dev the key lives server-side and can't be probed from here. */
export async function testElevenLabsKey(key?: string): Promise<{ ok: boolean; error?: string }> {
  const k = key?.trim() || ELEVENLABS_API_KEY;
  if (!k) return { ok: false, error: 'Geen key ingesteld (VITE_ELEVENLABS_API_KEY)' };
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

export async function speakWithElevenLabs(
  text: string,
  onDone?: () => void,
  onError?: () => void,
  onFallback?: (reason: string) => void,
): Promise<void> {
  // Try ElevenLabs first (via the same-origin proxy in prod, direct in dev)
  if (isElevenLabsConfigured()) {
    try {
      const currentVoice = getSelectedVoiceId();
      let response = await ttsFetch(text, currentVoice);

      // Self-heal a stale/invalid voice id (invalid_uid): the saved id isn't
      // usable on THIS account, so TTS 400s. Fetch the account's voices and
      // TRY each one (skipping the failing one) until a request actually
      // succeeds — picking [0] wasn't enough because [0] can BE the failing
      // voice. The first voice that plays gets persisted so it self-heals for
      // good. Capped so a fully-broken account can't fan out endless calls.
      if (!response.ok && response.status === 400) {
        const body = await response.clone().text().catch(() => '');
        if (/invalid_uid|voice/i.test(body)) {
          // Candidate pool = the account's fetched voices PLUS the classic
          // long-standing premade voices (ELEVENLABS_VOICES). The account's
          // "default" voices (Roger, Sarah, …) can be rejected with
          // invalid_uid on some plans while the classic premades still work,
          // so trying both maximises the chance of landing on one that plays.
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
      // Play through the SHARED element that was unlocked on the first user
      // gesture — a fresh `new Audio()` after an await gets blocked by iOS
      // ("not allowed by the user agent"), which forced the browser-voice
      // fallback even when ElevenLabs returned real audio.
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
    // This is AXE's real default voice, not a degraded fallback — ElevenLabs
    // is opt-in (needs a configured+working key), so most sessions run
    // through here. Tuned for a confident, commanding "Bobby Axelrod"
    // delivery rather than a slow, calm JARVIS read: closer to natural rate
    // (not dragged out) with a touch of extra weight in the pitch.
    utterance.rate = 1.02;
    utterance.pitch = 0.88;
    utterance.volume = 1.0;

    // AXE replies in whichever language Luka wrote in, so the fallback voice
    // must follow the TEXT, not a fixed locale (the old always-nl-NL setting
    // mispronounced every English reply). Light heuristic: a few unmistakably
    // Dutch function words → Dutch, else English.
    const isDutch = /\b(het|een|de|ik|je|niet|met|voor|maar|ook|even|zodra|akkoord|geen|wel)\b/i.test(text);
    const voices = window.speechSynthesis.getVoices();
    // "Alex" is macOS's best-quality built-in voice (natural, deep, American,
    // no download required) — the closest system voice to a confident
    // American lead like Bobby Axelrod, so it leads the English list.
    // Everything after it is a fallback for platforms/browsers without Alex
    // (Windows/Chrome/Linux), roughly ordered by how deep/commanding they read.
    const preferredVoices = isDutch
      ? ['Xander', 'Google Nederlands', 'Daniel']
      : ['Alex', 'Daniel', 'Google US English', 'Google UK English Male', 'Arthur', 'Oliver'];

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
