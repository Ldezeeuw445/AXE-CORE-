/**
 * Home chat Talk vs Act router.
 * TALK = normal conversation (Gemini / LLM only).
 * ACT  = tool-using agent loop (git, code, exec, search) — still requires approval on writes.
 */
export type ChatIntent = 'talk' | 'act';

const ACT_RE =
  /\b(bouw|build|pas\s+aan|wijzig|change|fix|commit|merge|pr\b|pull request|integreer|integrate|voeg\s+toe|add\s+to|schrijf\s+code|write\s+code|implement|deploy|run\s+|exec|shell|patch|refactor|open\s+pr|maak\s+een\s+branch|create\s+branch|delete\s+file|update\s+file|git\s+)/i;

/**
 * Korte gesproken computeropdrachten bevatten vaak géén van de klassieke
 * coding-verbs hierboven: "open Safari", "klik daar", "type dit", "scroll
 * omlaag". Als die als TALK eindigen zegt AXE wat hij zou kunnen doen in plaats
 * van het daadwerkelijk te doen. Alleen imperatieve vormen aan het begin tellen,
 * zodat "wat vind je van Safari openen?" gewoon gesprek blijft.
 */
const DIRECT_ACTION_RE =
  /^(?:(?:hey|hoi|hi)\s+axe[,\s]+)?(?:(?:(?:can|could|would)\s+you|please)\s+)?(?:open(?:en)?|start(?:en)?|launch|sluit(?:en)?|close|klik(?:ken)?|click|tik(?:ken)?|tap|scroll(?:en)?|type|typ(?:en)?|focus|navigeer|navigate|ga\s+naar|go\s+to|verwijder(?:en)?|delete|maak|create|zet\s+.+\s+(?:open|aan|uit)|turn\s+.+\s+(?:on|off)|zoek\s+op|search\s+for)\b/i;

/**
 * "kan je Safari openen", "wil je Finder starten", "zou je dat bestand
 * verwijderen" — Dutch modal + je puts the object BEFORE the verb (verb-final
 * word order), unlike "could you open Safari" above where the verb comes
 * right after the modal. DIRECT_ACTION_RE's optional-prefix shape cannot
 * express that without also swallowing plain conversation ("kan je me
 * helpen met iets"), so this is its own pattern with the object as filler.
 */
const DIRECT_ACTION_MODAL_JE_RE =
  /^(?:(?:hey|hoi|hi)\s+axe[,\s]+)?(?:kan|kun|wil|zou)\s+je\s+.+\s+(?:open(?:en)?|start(?:en)?|sluit(?:en)?|klik(?:ken)?|verwijder(?:en)?|scroll(?:en)?|typ(?:en)?|maken?)\b/i;

const TALK_RE =
  /\b(wat\s+vind|what\s+do\s+you\s+think|leg\s+uit|explain|waarom|why|hoe\s+werkt|how\s+does|samenvat|summarize|vertel|tell\s+me|brainstorm)\b/i;

export function classifyChatIntent(text: string): ChatIntent {
  const t = (text || '').trim();
  if (!t) return 'talk';
  // Explicit act verbs and direct device commands win.
  if (ACT_RE.test(t) || DIRECT_ACTION_RE.test(t) || DIRECT_ACTION_MODAL_JE_RE.test(t)) return 'act';
  if (TALK_RE.test(t) && !ACT_RE.test(t)) return 'talk';
  // Short questions → talk; long imperative → act
  if (t.length < 40 && /\?$/.test(t)) return 'talk';
  if (/^(please\s+)?(do|make|create|update|fix)\b/i.test(t)) return 'act';
  return 'talk';
}

export function intentBadgeLabel(intent: ChatIntent): string {
  return intent === 'act' ? 'Acting' : 'Talk';
}

/**
 * Alleen een begroeting: "hey axe", "hoi", "ben je daar".
 * "hey axe, zoek bitcoin" is geen sociale beurt — dat is een vraag.
 */
const SOCIAL_ONLY_RE =
  /^(hey|hi|hoi|hallo|yo|dag|hoihoi|goedemorgen|goedemiddag|goedenavond|good\s+morning|good\s+evening|what'?s\s+up|whats\s+up|hoe\s+gaat\s+het|ben\s+je\s+daar|you\s+there)(?:\s*axe)?$/i;

export function isSocialChatTurn(text: string): boolean {
  const t = (text || '').trim().replace(/[.!?]+$/g, '').trim();
  if (!t) return false;
  if (ACT_RE.test(t) || DIRECT_ACTION_RE.test(t) || DIRECT_ACTION_MODAL_JE_RE.test(t)) return false;
  return SOCIAL_ONLY_RE.test(t);
}
