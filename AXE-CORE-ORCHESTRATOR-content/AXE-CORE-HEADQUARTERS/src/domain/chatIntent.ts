/**
 * Home chat Talk vs Act router.
 * TALK = normal conversation (Gemini / LLM only).
 * ACT  = tool-using agent loop (git, code, exec, search) — still requires approval on writes.
 */
export type ChatIntent = 'talk' | 'act';

const ACT_RE =
  /\b(bouw|build|pas\s+aan|wijzig|change|fix|commit|merge|pr\b|pull request|integreer|integrate|voeg\s+toe|add\s+to|schrijf\s+code|write\s+code|implement|deploy|run\s+|exec|shell|patch|refactor|open\s+pr|maak\s+een\s+branch|create\s+branch|delete\s+file|update\s+file|git\s+)/i;

const TALK_RE =
  /\b(wat\s+vind|what\s+do\s+you\s+think|leg\s+uit|explain|waarom|why|hoe\s+werkt|how\s+does|samenvat|summarize|vertel|tell\s+me|brainstorm)\b/i;

export function classifyChatIntent(text: string): ChatIntent {
  const t = (text || '').trim();
  if (!t) return 'talk';
  // Explicit act verbs win
  if (ACT_RE.test(t)) return 'act';
  if (TALK_RE.test(t) && !ACT_RE.test(t)) return 'talk';
  // Short questions → talk; long imperative → act
  if (t.length < 40 && /\?$/.test(t)) return 'talk';
  if (/^(please\s+)?(do|make|create|update|fix)\b/i.test(t)) return 'act';
  return 'talk';
}

export function intentBadgeLabel(intent: ChatIntent): string {
  return intent === 'act' ? 'Acting' : 'Talk';
}
