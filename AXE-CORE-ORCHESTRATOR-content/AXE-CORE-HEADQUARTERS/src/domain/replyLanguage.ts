/**
 * Reply language preference for AXE chat + TTS + Mindset/AXE spoken lines.
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
  // Notify UI (Mindset/AXE buttons, chat) without a full reload
  try {
    window.dispatchEvent(new CustomEvent('axe-reply-language', { detail: { mode } }));
  } catch { /* ignore */ }
}

/** Appended to the system prompt every turn — applies to chat + any agent that injects it. */
export function replyLanguageInstruction(): string {
  const mode = getReplyLanguage();
  if (mode === 'nl') {
    return `

## Reply language (GLOBAL user preference — mandatory)
Always reply in Dutch (Nederlands) in every channel: chat text, spoken TTS, status lines, and tool narrations.
Even if Luka writes in English, answer in Dutch. Keep AXE's direct tone.
Never switch to English unless he explicitly asks for English.`;
  }
  if (mode === 'auto') {
    return `

## Reply language (GLOBAL user preference)
Match Luka's language: Dutch when he writes/speaks Dutch, English when he writes/speaks English.
The spoken TTS reply must use the same language as the written reply. Never switch mid-reply.`;
  }
  return `

## Reply language (GLOBAL user preference — mandatory)
ALWAYS reply in English in every channel: chat text, spoken TTS, status lines, and tool narrations — even when Luka writes or speaks Dutch.
Tone: direct, confident, slightly bossy (Bobby Axelrod energy). Short and sharp.
Never switch to Dutch unless he explicitly asks for Dutch.`;
}

/** English preview line for Fish / ElevenLabs. */
export const TTS_PREVIEW_EN =
  "Hey Luka. This is AXE. Direct, confident — let's move.";

/** Dutch preview when reply language is nl. */
export const TTS_PREVIEW_NL =
  "Hey Luka. Dit is AXE. Direct, scherp — we gaan.";

/** Preview text matching the active reply language. */
export function ttsPreviewLine(): string {
  return getReplyLanguage() === 'nl' ? TTS_PREVIEW_NL : TTS_PREVIEW_EN;
}
