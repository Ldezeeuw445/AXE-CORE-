/**
 * globalTts.ts — de enige ingang voor alles wat AXE hardop zegt.
 *
 * Eén stem, overal: Marin, via AXE Core. Geen keten van motoren, geen
 * terugval -- die zijn op 29 sep 2026 bewust weggehaald (`393c88ce`), omdat
 * een tweede stem die invalt betekent dat AXE middenin een antwoord van
 * identiteit wisselt. Valt de centrale stem weg, dan hoor je de fout in
 * plaats van iemand anders.
 *
 * Deze kop beschreef tot nu toe nog steeds de verwijderde George→Cedar-keten.
 * Dat is precies de verwarring die deze ronde opruimt: de naam stond op zes
 * manieren in de code en de uitleg beschreef code die er niet meer was.
 *
 * De "typt terwijl hij praat"-onthulling staat met opzet UIT (zie
 * `domain/chatLatency.ts` en `useSpokenReveal`): bij fraction 0 bleef de
 * bubbel leeg terwijl het antwoord er al was. De stem mag meelopen, de
 * letters niet wachten. Daarom roept dit bestand `speechProgress` niet meer
 * aan -- dat deed het nog wel, en het riep `endSpeechProgress()` zelfs aan
 * vóór er geluid was.
 */
import { stopFishAudio, getFishTtsLevel } from '@/infrastructure/gateways/fishAudioService';
import { stopTTS, getElevenLabsTtsLevel } from '@/infrastructure/gateways/elevenLabsService';
import {
  speakWithOpenAi,
  stopOpenAiTts,
  STANDAARD_STEM as AXE_OPENAI_VOICE,
  getAxeTtsLevel,
} from '@/infrastructure/gateways/openAiTtsService';
import { stopCartesia, getCartesiaTtsLevel } from '@/infrastructure/gateways/cartesiaTtsService';
import { getOpenAiRealtimeLevel } from '@/infrastructure/gateways/openAiRealtimeVoice';
import { normalizeForSpeech } from '@/domain/speechText';
import { markBeurt } from '@/domain/beurtKlok';

/** Stop any in-flight TTS from any provider. */
export function stopGlobalTts(): void {
  stopTTS();
  stopFishAudio();
  stopOpenAiTts();
  stopCartesia();
}

/**
 * Prepare text for the voice. Two jobs, in order:
 *  1. Drop UI / routing chrome that must never be spoken — the "google · gemini"
 *     model badges under chat bubbles, "provider:"/"routed:" lines. These are
 *     whole lines, so they are filtered before anything collapses the newlines.
 *  2. Hand the rest to normalizeForSpeech, which removes Markdown, links, emoji
 *     and stray symbols so AXE reads words, not "star star" and "backtick".
 */
export function sanitizeForSpeech(text: string): string {
  const withoutChrome = text
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      // provider · model badges (UI chrome under chat bubbles)
      if (/^(google|openai|anthropic|xai|groq|openrouter|ollama|deepseek)\s*[·•|]\s*\S+/i.test(t)) return false;
      if (/^(model|provider|via|routed)\s*[:=]/i.test(t)) return false;
      if (/^[a-z0-9_.-]+\s*[·•|]\s*[a-z0-9_.-]+$/i.test(t) && t.length < 48) return false;
      return true;
    })
    .join('\n');
  return normalizeForSpeech(withoutChrome);
}

/** Speak with the single canonical AXE voice (or the Settings motor). */
export function speakGlobal(
  text: string,
  onDone?: () => void,
  onError?: (reason: string) => void,
  onStart?: () => void,
): void {
  const line = sanitizeForSpeech(text);
  if (!line) {
    onDone?.();
    return;
  }

  stopGlobalTts();
  const hoor = () => {
    markBeurt('firstAudio');
    onStart?.();
  };

  void speakWithOpenAi(
    line,
    () => onDone?.(),
    (reason) => {
      onError?.(`AXE voice failed: ${reason}`);
      onDone?.();
    },
    AXE_OPENAI_VOICE,
  ).then(() => hoor());

}

/** Eén zin. `onStart` vuurt bij het eerste hoorbare sample. */
export function spreekStuk(stuk: string, onStart?: () => void): Promise<void> {
  const line = sanitizeForSpeech(stuk);
  if (!line) { onStart?.(); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    void speakWithOpenAi(line, resolve, (r) => reject(new Error(r)), AXE_OPENAI_VOICE)
      .then(() => onStart?.());
  });
}

/** Real 0..1 playback energy of whichever AXE voice is playing right now. */
export function getGlobalTtsLevel(): number {
  return Math.max(
    getAxeTtsLevel(),
    getFishTtsLevel(),
    getElevenLabsTtsLevel(),
    getCartesiaTtsLevel(),
    getOpenAiRealtimeLevel(),
  );
}
