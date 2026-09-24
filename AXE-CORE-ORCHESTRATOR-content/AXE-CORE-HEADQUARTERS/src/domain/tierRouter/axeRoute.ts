/**
 * AXE-route — de Jarvis-achtige laag vóór de baas-chat.
 *
 * Dit is NIET de roster-tier (manager/worker/assistant in roster.ts).
 * Dit is de aanvraag-route: 1 = regels + opgeslagen data, 2 = klein snel
 * model, 3 = echt werk naar een bestaande agent.
 *
 * De classifier schrijft geen antwoord. Hij kiest alleen een tier.
 * Regels eerst (geen netwerk). Een model mag alleen bij twijfel, en moet
 * binnen de timeout vallen — anders het huidige pad.
 */
import { classifyChatIntent, isSocialChatTurn } from '@/domain/chatIntent';
import { delegateFor, type AxeAgentId } from '@/domain/agents/roster';

export type AxeRouteTier = 1 | 2 | 3;

export type AxeRouteVia = 'rules' | 'model' | 'fallback';

export type AxeRouteSkill =
  | 'plan-today'
  | 'inbox-brief'
  | 'intel-brief'
  | 'deep-research'
  | 'weekly-review';

export type AxeRouteKind =
  | 'greeting'
  | 'status'
  | 'priorities'
  | 'tasks'
  | 'calendar'
  | 'quick'
  | 'agent'
  | 'unknown';

export interface AxeRoute {
  tier: AxeRouteTier;
  kind: AxeRouteKind;
  via: AxeRouteVia;
  reason: string;
  agent: AxeAgentId;
  skill: AxeRouteSkill | null;
  confident: boolean;
}

/** Groq-model dat al in de stack zit (aiAgent.ts) — klein en snel. */
export const TIER2_GROQ_MODEL = 'llama-3.1-8b-instant';

/** Hard maximum voor de optionele model-classifier. Regels zitten hier ver onder. */
export const AXE_ROUTE_TIMEOUT_MS = 700;

export const CLASSIFIER_PROMPT = `Classify the user message as tier 1, 2, or 3.
1 = greeting, presence, status, or a lookup of saved tasks/calendar/priorities. No writing.
2 = short question, summary, or explanation. Small model is enough.
3 = real work for an existing agent (code, trading, northsea, research, crew, browser).
Reply with JSON only: {"tier":1|2|3,"agent":"axe"|"trading"|"northsea"|"developer"|"wingman"|"browser"|"intel"|"thinktank"|"task"|"finance"|"memory"|"cron"|"apps"|"companion"}
Message:`;

const PRIORITY_RE =
  /\b(priorit(?:y|ies)|prioriteiten|top\s*3|wat moet ik (nu|vandaag) (doen|weten)|what (are|should) my priorities|what should i (do|focus on) today)\b/i;

const TASKS_RE =
  /\b(mijn taken|my tasks|open tasks|taaklijst|task list|to-?do'?s?|wat staat er open)\b/i;

const CALENDAR_RE =
  /\b(agenda|calendar|schedule|rooster|wat staat er (vandaag )?(op|in) (mijn )?agenda|what'?s on my (calendar|schedule)|afspraken)\b/i;

const STATUS_RE =
  /\b(how are you|hoe gaat het|hoe is de stand|what'?s your status|system status|status van (de )?(vps|systeem|system)|hoe staat (het )?systeem|are you (ok|okay|up)|ben je (ok|okay))\b/i;

const QUICK_RE =
  /\b(samenvat|summarize|vat .* samen|leg uit|explain|tell me about|vertel (me )?(over|iets)|what is|wat is|wat betekent|what does|how does|hoe werkt|what'?s the weather|wat is het weer)\b/i;

const SKILL_PATTERNS: { skill: AxeRouteSkill; re: RegExp }[] = [
  { skill: 'plan-today', re: /^(plan today|plan mijn dag|plan de dag)\b/i },
  { skill: 'inbox-brief', re: /^(inbox brief|inbox briefing)\b/i },
  { skill: 'intel-brief', re: /^(intel brief|intel briefing)\b/i },
  { skill: 'deep-research', re: /\b(deep research|diep research|diepgaand onderzoek)\b/i },
  { skill: 'weekly-review', re: /^(weekly review|weekreview|week review)\b/i },
];

const WORK_RE =
  /\b(research|onderzoek|schrijf (een )?rapport|write (a )?report|open (a )?(long|short)|zet een (long|short)|fix|los .* op|run the (wingman )?crew|start de crew|browse|scrape|deploy|refactor|implement|commit|pr\b|pull request)\b/i;

function schoon(text: string): string {
  return (text || '').trim();
}

function skillVan(text: string): AxeRouteSkill | null {
  for (const s of SKILL_PATTERNS) {
    if (s.re.test(text)) return s.skill;
  }
  return null;
}

/**
 * Synchrone regels. Geen I/O. Dit is de goedkope weg die onder 1s blijft
 * zonder een model aan te roepen.
 */
export function classifyAxeTier(text: string): AxeRoute {
  const t = schoon(text);
  if (!t) {
    return {
      tier: 2,
      kind: 'unknown',
      via: 'rules',
      reason: 'empty',
      agent: 'axe',
      skill: null,
      confident: false,
    };
  }

  const skill = skillVan(t);
  if (skill) {
    const agent: AxeAgentId =
      skill === 'intel-brief' ? 'intel' : skill === 'deep-research' ? 'browser' : 'axe';
    return {
      tier: 3,
      kind: 'agent',
      via: 'rules',
      reason: `skill:${skill}`,
      agent,
      skill,
      confident: true,
    };
  }

  if (isSocialChatTurn(t)) {
    return {
      tier: 1,
      kind: 'greeting',
      via: 'rules',
      reason: 'greeting',
      agent: 'axe',
      skill: null,
      confident: true,
    };
  }

  if (STATUS_RE.test(t) && t.length < 80) {
    return {
      tier: 1,
      kind: 'status',
      via: 'rules',
      reason: 'status lookup',
      agent: 'axe',
      skill: null,
      confident: true,
    };
  }

  if (CALENDAR_RE.test(t) && t.length < 100) {
    return {
      tier: 1,
      kind: 'calendar',
      via: 'rules',
      reason: 'calendar lookup',
      agent: 'axe',
      skill: null,
      confident: true,
    };
  }

  if (PRIORITY_RE.test(t) && t.length < 100) {
    return {
      tier: 1,
      kind: 'priorities',
      via: 'rules',
      reason: 'priorities lookup',
      agent: 'axe',
      skill: null,
      confident: true,
    };
  }

  if (TASKS_RE.test(t) && t.length < 100) {
    return {
      tier: 1,
      kind: 'tasks',
      via: 'rules',
      reason: 'tasks lookup',
      agent: 'axe',
      skill: null,
      confident: true,
    };
  }

  const intent = classifyChatIntent(t);
  // Nooit capability 'code' forceren: delegateFor geeft dan altijd developer,
  // ook als de tekst een trading- of crew-signaal heeft.
  const delegatie = delegateFor('fast', t);
  const actief = intent === 'act' || WORK_RE.test(t);
  const domein = delegatie.agent !== 'axe';

  if (actief || (domein && t.length > 20)) {
    const agent: AxeAgentId = domein
      ? delegatie.agent
      : intent === 'act'
        ? 'developer'
        : 'axe';
    return {
      tier: 3,
      kind: 'agent',
      via: 'rules',
      reason: actief ? `act:${delegatie.reason}` : delegatie.reason,
      agent,
      skill: null,
      confident: true,
    };
  }

  if (QUICK_RE.test(t) || (t.length < 80 && /\?$/.test(t))) {
    return {
      tier: 2,
      kind: 'quick',
      via: 'rules',
      reason: QUICK_RE.test(t) ? 'quick answer' : 'short question',
      agent: 'axe',
      skill: null,
      confident: true,
    };
  }

  if (t.length < 40 && !actief) {
    return {
      tier: 2,
      kind: 'quick',
      via: 'rules',
      reason: 'short chat',
      agent: 'axe',
      skill: null,
      confident: false,
    };
  }

  return {
    tier: 2,
    kind: 'unknown',
    via: 'rules',
    reason: 'ambiguous',
    agent: domein ? delegatie.agent : 'axe',
    skill: null,
    confident: false,
  };
}

const AGENTS = new Set<AxeAgentId>([
  'axe', 'trading', 'northsea', 'developer', 'wingman', 'browser', 'intel',
  'thinktank', 'task', 'finance', 'memory', 'cron', 'apps', 'companion',
]);

/** Parseert het JSON-antwoord van het optionele snelle model. */
export function parseModelKlassificatie(raw: string): AxeRoute | null {
  const match = (raw || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { tier?: unknown; agent?: unknown };
    const tier = parsed.tier;
    if (tier !== 1 && tier !== 2 && tier !== 3) return null;
    const agent = typeof parsed.agent === 'string' && AGENTS.has(parsed.agent as AxeAgentId)
      ? parsed.agent as AxeAgentId
      : 'axe';
    return {
      tier,
      kind: tier === 1 ? 'greeting' : tier === 3 ? 'agent' : 'quick',
      via: 'model',
      reason: 'model classifier',
      agent: tier === 3 ? agent : 'axe',
      skill: null,
      confident: true,
    };
  } catch {
    return null;
  }
}

export function capabilityVoorAgent(agent: AxeAgentId): string {
  switch (agent) {
    case 'developer': return 'code';
    case 'trading': return 'trading';
    case 'intel': return 'research';
    case 'browser': return 'research';
    case 'northsea': return 'agentic';
    default: return 'agentic';
  }
}

export function groetAntwoord(nu = new Date()): string {
  const uur = nu.getHours();
  if (uur < 12) return "Morning. I'm here — what do you need?";
  if (uur < 18) return "Hey. I'm here — what do you need?";
  return "Evening. I'm here — what do you need?";
}

export function statusAntwoord(stand: {
  vpsOnline: boolean | null;
  openTasks: number;
  overdueTasks: number;
}): string {
  const vps = stand.vpsOnline === null ? 'unknown' : stand.vpsOnline ? 'up' : 'down';
  const taken = stand.openTasks === 0
    ? 'No open tasks in memory.'
    : `${stand.openTasks} open task${stand.openTasks === 1 ? '' : 's'}${stand.overdueTasks ? `, ${stand.overdueTasks} overdue` : ''}.`;
  return `Sharp. VPS ${vps}. ${taken}`;
}

export function takenAntwoord(titels: string[], overdue: number): string {
  if (titels.length === 0) return 'No open tasks in memory.';
  const kop = overdue ? `${titels.length} open, ${overdue} overdue:` : `${titels.length} open:`;
  return `${kop}\n${titels.slice(0, 5).map((t) => `• ${t}`).join('\n')}`;
}

export function agendaAntwoord(items: string[]): string {
  if (items.length === 0) return 'Nothing on the calendar in the next 24 hours.';
  return `Next up:\n${items.slice(0, 5).map((t) => `• ${t}`).join('\n')}`;
}

export function prioriteitenAntwoord(titels: string[], overdue: number, agenda: string[]): string {
  const taken = takenAntwoord(titels, overdue);
  if (agenda.length === 0) return taken;
  return `${taken}\n\n${agendaAntwoord(agenda)}`;
}

export function tier3Ack(agentNaam: string, skill: AxeRouteSkill | null): string {
  if (skill) return `On it. Running ${skill.replace(/-/g, ' ')} — I'll report back.`;
  if (agentNaam && agentNaam !== 'AXE Core') {
    return `On it. Handing this to ${agentNaam} — I'll report back.`;
  }
  return "On it. Starting this in the background — I'll report back.";
}
