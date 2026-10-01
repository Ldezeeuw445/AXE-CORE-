/**
 * De vijf skills, op één plek: Plan Today, Inbox Brief, Intel Brief,
 * Deep Research, Weekly Review.
 *
 * ## Waarom dit bestand er nu pas is
 *
 * De namen bestonden al. `axeRoute.ts` declareerde het type, `SKILL_PATTERNS`
 * had de regexen, en `stuurAxeJobs` zette `skill` zelfs in de payload van de
 * durable task. Maar er gebeurde niets mee: gemeten 1 okt 2026 kent de backend
 * het woord `skill` niet (grep op `backend/axe_api/main.py` is leeg), en het
 * planpad zette `skill: null` hard (installTierRouter, het blok dat
 * `voerPlanUit` heet). Alle vijf gedroegen zich dus als "tier 3, doel = de
 * letterlijke zin die je typte". De naam was decoratie.
 *
 * Wat er verder verspreid stond: wélke agent een skill doet zat als if-keten in
 * `classifyAxeTier` (`intel-brief` → intel, `deep-research` → browser, anders
 * axe), en wat de agent moest DOEN stond nergens -- hij kreeg je eigen zin
 * doorgestuurd en moest maar raden wat "inbox brief" betekent.
 *
 * Hier staat per skill alles bij elkaar: hoe je hem aanroept, wie hem doet, op
 * welke tier, en de instructie die de agent krijgt. `axeRoute` leest zijn
 * regexen en zijn agentkeuze hieruit, de knoppen lezen `label`, en de stem leest
 * de ids. Eén rij erbij is dus één plek erbij, in plaats van vier.
 *
 * ## Alle vijf lezen alleen
 *
 * Luka, 1 okt 2026: ze mogen lezen en taken VOORSTELLEN, niets zelf veranderen.
 * Dat staat niet alleen in de instructietekst (een model mag je daarop niet
 * vertrouwen) maar ook in `leestAlleen`, waar `jobModus` de echte
 * `execution_mode: 'read'` van de durable task uit haalt. De tekst zegt het, het
 * hek dwingt het af.
 */
import type { AxeAgentId } from '@/domain/agents/roster';

/** De vijf. Dit type was `AxeRouteSkill` in axeRoute.ts, dat hem nu hier leest. */
export type AxeSkillId =
  | 'plan-today'
  | 'inbox-brief'
  | 'intel-brief'
  | 'deep-research'
  | 'weekly-review';

export interface AxeSkillDef {
  id: AxeSkillId;
  /** Wat de knop zegt. Engels, want het staat op het scherm. */
  label: string;
  /** Eén regel: wat je ervan krijgt. Voor de knop-tooltip en het commandopalet. */
  uitleg: string;
  /** Welke rosteragent dit doet. */
  agent: AxeAgentId;
  /**
   * 1 = uit opgeslagen data, nu, zonder model. 3 = een agent gaat ermee weg.
   * Alleen `plan-today` is tier 1: zijn hele inhoud (taken, agenda, top 3) staat
   * al in `haalTier1Kijk`. Daar een achtergrondtaak van maken betekende "On it,
   * I'll report back" op een vraag waarvan het antwoord klaar lag.
   */
  tier: 1 | 3;
  /**
   * De zelfstandige instructie voor de agent. Niet jouw zin: die is kort en
   * aanwijzend ("inbox brief"), en een agent die alleen dat krijgt moet raden.
   */
  request: string;
  /** Hoe je hem aanroept door te typen of te zeggen. */
  patroon: RegExp;
  /** Alle vijf: lezen en voorstellen. Zie de kop. */
  leestAlleen: true;
}

const LEES_REGEL =
  'Read-only: you may read anything, but change nothing. Create no tasks, send nothing, write no files. '
  + 'End with a short list of concrete tasks you propose, for Luka to confirm.';

export const AXE_SKILLS: readonly AxeSkillDef[] = [
  {
    id: 'plan-today',
    label: 'Plan Today',
    uitleg: 'Your day from stored data: top 3, open tasks, agenda.',
    agent: 'axe',
    tier: 1,
    request:
      'Give Luka his plan for today from stored data: the top 3 that matter, the open tasks, '
      + `and today's agenda. No research, no model calls. ${LEES_REGEL}`,
    patroon: /^(plan today|plan mijn dag|plan de dag|wat moet ik vandaag)\b/i,
    leestAlleen: true,
  },
  {
    id: 'inbox-brief',
    label: 'Inbox Brief',
    uitleg: "What came in and what wants your attention.",
    agent: 'axe',
    tier: 3,
    request:
      'Read the inbox folder in AXE memory (category "inbox") and the notifications of the last 24 hours. '
      + `Report what actually needs Luka's attention and what can wait. Group it, do not list everything. ${LEES_REGEL}`,
    patroon: /^(inbox brief|inbox briefing|wat is er binnengekomen)\b/i,
    leestAlleen: true,
  },
  {
    id: 'intel-brief',
    label: 'Intel Brief',
    uitleg: 'What moved in the world Luka watches.',
    agent: 'intel',
    tier: 3,
    request:
      'Brief Luka on what moved since the last intel brief in the areas he follows. '
      + `Say what changed, why it matters to him, and what is noise. ${LEES_REGEL}`,
    patroon: /^(intel brief|intel briefing)\b/i,
    leestAlleen: true,
  },
  {
    id: 'deep-research',
    label: 'Deep Research',
    uitleg: 'A real dig into one question, with sources.',
    agent: 'browser',
    tier: 3,
    request:
      'Research the subject Luka named properly: multiple sources, name them, and say where they disagree. '
      + `Separate what you found from what you concluded. ${LEES_REGEL}`,
    patroon: /\b(deep research|diep research|diepgaand onderzoek)\b/i,
    leestAlleen: true,
  },
  {
    id: 'weekly-review',
    label: 'Weekly Review',
    uitleg: 'What the week actually produced, and what slipped.',
    agent: 'axe',
    tier: 3,
    request:
      'Review the past week from stored data: tasks finished, tasks that slipped and why, '
      + `what the agents produced, and the one thing that would matter most next week. ${LEES_REGEL}`,
    patroon: /^(weekly review|weekreview|week review|weekoverzicht)\b/i,
    leestAlleen: true,
  },
];

const OP_ID = new Map<AxeSkillId, AxeSkillDef>(AXE_SKILLS.map((s) => [s.id, s]));

/** De definitie, of null bij een naam die geen skill is. */
export function skillDef(id: string | null | undefined): AxeSkillDef | null {
  if (!id) return null;
  return OP_ID.get(id as AxeSkillId) ?? null;
}

/** Is dit een van de vijf? Voor het lezen van wat een model of de stem teruggeeft. */
export function isAxeSkill(v: unknown): v is AxeSkillId {
  return typeof v === 'string' && OP_ID.has(v as AxeSkillId);
}

/**
 * Welke skill deze zin aanroept, of null.
 *
 * Eerste match wint, en de volgorde van `AXE_SKILLS` is dus betekenisvol:
 * `deep-research` matcht midden in een zin (je zegt "doe eens deep research
 * naar X"), de andere vier aan het begin. Daarom staat hij ná de vier die
 * strakker binden.
 */
export function skillVanTekst(text: string): AxeSkillId | null {
  const t = (text || '').trim();
  if (!t) return null;
  for (const s of AXE_SKILLS) {
    if (s.patroon.test(t)) return s.id;
  }
  return null;
}
