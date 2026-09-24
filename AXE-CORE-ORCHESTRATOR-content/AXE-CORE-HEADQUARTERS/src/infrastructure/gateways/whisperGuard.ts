/**
 * whisperGuard.ts — weigert stille opnames en klassieke Whisper-hallucinaties.
 *
 * Whisper-large-v3 (en whisper-1) vult stilte vaak met "you", "you you",
 * "thank you", "thanks for watching" of alleen een punt. Zonder deze poort
 * ging die tekst het gesprek in alsof Luka het zei.
 */

const MIN_BLOB_BYTES = 800;

/** Exacte zinnen die Whisper op stilte / ruis verzint. Kleine letters, geen leestekens. */
const HALLUCINATIES = new Set([
  'you',
  'you you',
  'you you you',
  'thank you',
  'thanks',
  'thanks for watching',
  'thank you for watching',
  'thanks for watching please subscribe',
  'please subscribe',
  'like and subscribe',
  'bye',
  'goodbye',
  'the',
  'a',
  'uh',
  'um',
  'hmm',
  'music',
  'subtitles',
  'subtitle',
]);

const HERHAALD_YOU = /^(you\s*)+$/;

/** Normaliseert transcript: kleine letters, leestekens weg, spaties plat. */
export function normaliseerTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\[\]()"'`.,!?…·•\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True als de tekst leeg is, alleen leestekens, of een bekende stilte-hallucinatie. */
export function isWhisperHallucination(text: string): boolean {
  const ruw = text.trim();
  if (!ruw) return true;
  if (/^[.\s…·•,!?-]+$/.test(ruw)) return true;

  const n = normaliseerTranscript(text);
  if (!n) return true;
  if (HALLUCINATIES.has(n)) return true;
  if (HERHAALD_YOU.test(n)) return true;
  return false;
}

/** Alleen naar Whisper sturen als er spraak is gemeten én de blob niet leeg is. */
export function shouldTranscribeUtterance(input: {
  blob: Blob | null;
  hadSpeech: boolean;
  minBytes?: number;
}): boolean {
  if (!input.hadSpeech) return false;
  if (!input.blob || input.blob.size < (input.minBytes ?? MIN_BLOB_BYTES)) return false;
  return true;
}

/** Transcript dat het gesprek in mag. Leeg = droppen. */
export function usableTranscript(text: string): string {
  const t = text.trim();
  if (!t || isWhisperHallucination(t)) return '';
  return t;
}
