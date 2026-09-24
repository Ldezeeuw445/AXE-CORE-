/**
 * toolLeak — vangnet voor interne tool-instructies die in de chatbubble lekken.
 *
 * De échte fix zit in de system prompt (conversation-first). Dit bestand is
 * expres het gordel-en-bretels-stuk: als een model tóch over markers, XML of
 * invoke-syntax gaat praten, mag Luka dat niet zien. Geen algemene
 * content-filter — alleen bekende lekzinnen.
 */
import { stripToolMarkers } from './toolCatalog';

/** Korte AXE-begroeting als het hele antwoord een lek was. Engels: UI-taal. */
export const SOCIAL_LEAK_FALLBACK = "Hey. I'm here — what do you need?";

/**
 * Zinnen waarin het model de tool-protocolles voorleest in plaats van te
 * antwoorden. Breed genoeg voor de screenshot ("geen tool-marker aanwezig"),
 * smal genoeg om "I'll search for that" met rust te laten.
 */
const LEAK_SENTENCE =
  /[^.!?\n]*\b(?:tool[- ]?markers?|juiste marker|function[- ]?calls?|invoke\s+syntax|geen (?:enkele )?tool[- ]?marker)[^.!?\n]*[.!?;:]*/gi;

const LEAK_SIGNAL =
  /tool[- ]?marker|juiste marker|function[- ]?call|invoke\s+syntax|<\/?(?:tool_call|function_call|invoke)\b/i;

const INVOKE_XML =
  /<\/?(?:tool_call|function_call|invoke|tool)(?:\s[^>]*)?>/gi;

export function looksLikeToolInstructionLeak(text: string): boolean {
  return LEAK_SIGNAL.test(text);
}

function opruimen(text: string): string {
  return text
    .replace(INVOKE_XML, '')
    .replace(/\(\s*[,;:]?\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Haalt bekende lekzinnen en hintergebleven markers weg.
 * Was het hele antwoord een lek, dan de fallback — anders de schone rest.
 */
export function stripToolInstructionLeak(text: string): string {
  if (!text) return '';
  const hadLeak = looksLikeToolInstructionLeak(text);
  let out = stripToolMarkers(text);
  out = out.replace(LEAK_SENTENCE, ' ');
  out = opruimen(out);
  if (!out && hadLeak) return SOCIAL_LEAK_FALLBACK;
  return out;
}

/** Wat de chatbubble mag tonen. Leeg modelantwoord blijft leeg (cascade). */
export function zichtbareAxeAntwoord(text: string): string {
  return stripToolInstructionLeak(text);
}
