/**
 * fastPathRouter — deterministic, zero-latency intent matches that must
 * never wait on an LLM round-trip: "stop" while AXE is speaking, "repeat
 * that", and an on-demand daily briefing. Same convention as the existing
 * inline regex checks at the top of voiceStore.sendMessage (chat actions,
 * workflow build, system status, code edit) — this is that same pattern,
 * pulled into its own module because it needs to run before ANY of those,
 * including before the user's text is even shown as "thinking".
 *
 * Deliberately narrow: no fast-path for greetings ("hoi") or generic memory
 * questions — a scripted non-LLM reply there would feel like a generic
 * chatbot instead of AXE, which is the opposite of the point.
 */

export type FastIntent = 'stop' | 'continue' | 'briefing' | 'none';

export interface FastRoute {
  intent: FastIntent;
}

const STOP_RE = /^(stop|stil|genoeg|hou op|shut up|be quiet|quiet)[.!]?$/i;
const CONTINUE_RE = /^(ga door|continue|verder|herhaal(\s+dat)?|repeat( that)?|nog een keer|again)[.!?]?$/i;
const BRIEFING_RE = /^(maak me klaar voor vandaag|get me ready for today|geef me (mijn\s+)?(ochtend)?briefing|wat moet ik vandaag weten|daily briefing|briefing (van vandaag|voor vandaag))[.!?]?$/i;

export function routeFast(text: string): FastRoute {
  const t = text.trim();
  if (!t || t.length > 60) return { intent: 'none' }; // long text is never a bare command
  if (STOP_RE.test(t)) return { intent: 'stop' };
  if (CONTINUE_RE.test(t)) return { intent: 'continue' };
  if (BRIEFING_RE.test(t)) return { intent: 'briefing' };
  return { intent: 'none' };
}
