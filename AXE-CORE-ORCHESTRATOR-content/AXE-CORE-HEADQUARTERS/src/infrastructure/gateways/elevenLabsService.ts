/**
 * elevenLabsService.ts
 * High-quality text-to-speech via ElevenLabs API.
 * Falls back to browser speechSynthesis if ElevenLabs is not configured.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY ?? '';
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

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

/** Real voice list for this account/API key — GET /v1/voices, not a
 *  hardcoded guess. Throws if ElevenLabs isn't configured or the call fails;
 *  callers decide whether/how to fall back, rather than this function
 *  silently substituting something else. */
export async function fetchAvailableVoices(): Promise<ElevenLabsVoice[]> {
  if (!isElevenLabsConfigured()) throw new Error('ElevenLabs not configured');
  const res = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${res.statusText}`);
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

export function isElevenLabsConfigured(): boolean {
  return !!ELEVENLABS_API_KEY;
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
export async function speakWithElevenLabs(
  text: string,
  onDone?: () => void,
  onError?: () => void,
  onFallback?: (reason: string) => void,
): Promise<void> {
  // Try ElevenLabs first
  if (isElevenLabsConfigured()) {
    try {
      const voiceId = getSelectedVoiceId();
      const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.slice(0, 4000), // ElevenLabs limit
          model_id: 'eleven_turbo_v2_5', // Fastest, most natural model
          voice_settings: {
            stability: 0.42,      // lower = more expressive/less monotone-robotic
            similarity_boost: 0.8,
            style: 0.45,          // more emotional range — friendlier, less flat
            use_speaker_boost: true,
          },
        }),
      });

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
    utterance.lang = 'nl-NL';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to find a natural voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoices = [
      'Google US English',
      'Samantha',
      'Alex',
      'Daniel',
      'Google UK English Male',
      'Google UK English Female',
    ];
    
    for (const name of preferredVoices) {
      const voice = voices.find(v => v.name.includes(name));
      if (voice) {
        utterance.voice = voice;
        break;
      }
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
