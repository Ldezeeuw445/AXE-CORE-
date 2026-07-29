/**
 * Reply language preference for AXE chat + TTS preview tone.
 * Stored in localStorage key axe_reply_language.
 *
 * - en   — always English (default; bossy Axelrod delivery)
 * - nl   — always Dutch
 * - auto — match Luka's message language
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';

export type ReplyLanguage = 'en' | 'nl' | 'auto';

const KEY = 'axe_reply_language';

export function getReplyLanguage(): ReplyLanguage {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'nl' || v === 'auto' || v === 'en') return v;
  } catch { /* ignore */ }
  return 'en';
}

export function setReplyLanguage(mode: ReplyLanguage): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch { /* ignore */ }
  void saveSetting(KEY, mode);
}

/** Appended to the system prompt every turn. */
export function replyLanguageInstruction(): string {
  const mode = getReplyLanguage();
  if (mode === 'nl') {
    return `

## Reply language (user preference)
Always reply in Dutch (Nederlands), even if Luka writes in English. Keep AXE's direct tone.`;
  }
  if (mode === 'auto') {
    return `

## Reply language (user preference)
Match Luka's language: Dutch when he writes/speaks Dutch, English when he writes/speaks English. Never switch mid-reply.`;
  }
  return `

## Reply language (user preference)
ALWAYS reply in English — even when Luka writes or speaks Dutch.
Tone: direct, confident, slightly bossy (Bobby Axelrod energy). Short and sharp.
Never switch to Dutch unless he explicitly asks for Dutch.`;
}

/** English preview line for Fish / ElevenLabs — shows the Axelrod voice properly. */
export const TTS_PREVIEW_EN =
  "Hey Luka. This is AXE. Direct, confident — let's move.";
