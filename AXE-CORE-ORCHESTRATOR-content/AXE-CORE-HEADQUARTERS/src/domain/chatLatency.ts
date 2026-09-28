/**
 * Wanneer mag de AXE-chat first visible token tonen?
 *
 * Gemeten in de bron (23 sep 2026), niet live op de Mac:
 *  1. installStableChat wachtte tot 1,5s op buildRagContext (embeddings +
 *     Obsidian-sync) vóór callProvider.
 *  2. callProvider is gebufferd: de UI zag pas tekst na het hele antwoord.
 *  3. MarkdownMessage / useSpokenReveal sneed de reply af op speech-fraction.
 *     beginSpeechProgress zet fraction op 0, revealCut(0) is 0 tekens, en de
 *     eerste Kokoro-POST duurt vaak 2–12s — de chat bleef leeg terwijl het
 *     antwoord al in de store stond.
 *
 * Dit bestand is de afspraak: RAG/TTS/skills mogen first-token niet
 * tegenhouden. De tests falen op het oude pad.
 */

import { revealCut } from '@/domain/speechChunks';

/** Geen wachtbudget: een trage belofte levert fallback, de LLM start nu. */
export const RAG_FIRST_TOKEN_BUDGET_MS = 0;

export type SpeechStand = { text: string | null; fraction: number };

/**
 * Wat de chat mag tonen. De stem mag meelopen, maar nooit tekst verbergen.
 *
 * Het oude pad was `revealCut(text, fraction)` zodra speech.text === reply:
 * bij fraction 0 (TTS nog bezig met het eerste stuk) werd de hele bubble leeg.
 */
export function zichtbareChatTekst(
  volledig: string,
  speech: SpeechStand | null,
): string {
  void speech;
  return volledig;
}

/** Alleen om het oude pad te kunnen meten in tests. Niet gebruiken in de UI. */
export function oudeTtsGateTekst(volledig: string, speech: SpeechStand | null): string {
  if (!speech || speech.text === null || speech.text !== volledig) return volledig;
  return volledig.slice(0, revealCut(volledig, speech.fraction));
}

export function firstTokenWachtOp(naam: 'rag' | 'skills' | 'tts' | 'embeddings'): boolean {
  void naam;
  return false;
}

/**
 * Als `p` niet binnen het budget klaar is, fallback. Budget 0 = niet wachten.
 * De belofte zelf mag doorlopen (leerlus/RAG op de achtergrond).
 */
export function raceFirstToken<T>(
  p: Promise<T>,
  fallback: T,
  budgetMs: number = RAG_FIRST_TOKEN_BUDGET_MS,
): Promise<T> {
  const veilig = p.catch(() => fallback);
  void veilig;
  if (budgetMs <= 0) return Promise.resolve(fallback);
  return Promise.race([
    veilig,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), budgetMs)),
  ]);
}

export async function voorwerkVoorFirstToken(opts: {
  rag: Promise<string>;
  skills: Promise<string>;
}): Promise<{ memoryBlock: string; skillsBlock: string }> {
  const [memoryBlock, skillsBlock] = await Promise.all([
    raceFirstToken(opts.rag, ''),
    raceFirstToken(opts.skills, ''),
  ]);
  return { memoryBlock, skillsBlock };
}
