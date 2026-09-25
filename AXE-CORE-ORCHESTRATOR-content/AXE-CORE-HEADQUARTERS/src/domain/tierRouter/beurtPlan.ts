/**
 * Beurtplan — wat Luka bedoelt, niet waar de komma's staan.
 *
 * splitsAxeBeurten knipt op "en" en komma's. Voor een korte opdracht is dat
 * genoeg, voor een brain dump niet (gemeten 25 sep): "ik zat net te denken"
 * werd een eigen job, "we moeten de trading desk een keer opschonen" (een
 * idee) zette een shell-agent aan het werk, en "herinner me morgen om Jan te
 * bellen" ging naar de Browser-agent.
 *
 * Eén snelle modelaanroep leest de hele beurt en geeft vier dingen terug: wat
 * AXE hardop zegt, wat er NU gedaan moet worden, wat onthouden moet worden,
 * en wat een herinnering is. Geen I/O hier; de aanroep zit in application/.
 */
import type { AxeAgentId } from '@/domain/agents/roster';
import { splitsAxeBeurten } from '@/domain/tierRouter/splitsAxeBeurten';

export interface PlanJob {
  agent: AxeAgentId;
  title: string;
  /** Een opdracht die op zichzelf staat: de agent ziet het gesprek niet. */
  request: string;
}

export interface PlanHerinnering {
  title: string;
  /** ISO-tijd, als Luka er een noemde. */
  dueAt?: string;
}

export interface BeurtPlan {
  reply: string;
  jobs: PlanJob[];
  onthoud: string[];
  herinneringen: PlanHerinnering[];
}

/** Agents die echt werk kunnen doen via de takenkernel. */
const JOB_AGENTS: ReadonlyArray<AxeAgentId> = [
  'northsea', 'trading', 'developer', 'browser', 'intel', 'apps', 'finance', 'thinktank', 'wingman', 'axe',
];

export const PLAN_MAX_JOBS = 6;

/** Groq-model voor het plan: groot genoeg om te begrijpen, ~0,3s. */
export const PLAN_GROQ_MODEL = 'openai/gpt-oss-120b';

export const PLAN_TIMEOUT_MS = 6_000;

export function planPrompt(nu: Date, lopend: string[]): string {
  const lopendRegel = lopend.length
    ? `Already running (do not start these again): ${lopend.join(' | ')}`
    : 'Nothing is running right now.';
  return `You are AXE, Luka's assistant. Luka is talking to you out loud, often thinking as he goes.
Read his whole message and decide what he actually wants. Reply with JSON only:
{"reply": string, "jobs": [{"agent": string, "title": string, "request": string}], "remember": [string], "reminders": [{"title": string, "due": string|null}]}

- reply: what you say back, spoken, in the language he used. Talk like a real person who knows him well, not like a help desk: react to what he actually said. If he is telling a story, venting or thinking out loud, engage with it -- react, give your honest take, or ask one follow-up question. Never end with filler like "how can I help you". One to three short sentences. When you start jobs, say in a few words what you set in motion. Answer small questions directly. Never say you cannot do something that a job can do.
- jobs: ONLY things he asks to be done now. Not ideas ("we should some day..."), not thinking out loud, not stories, feelings or opinions, not questions you can answer in the reply. Most turns have no jobs. Max ${PLAN_MAX_JOBS}.
  agent: northsea (commodity desk, leads, mailbox - read only), trading (markets, positions, trading desk), developer (code, repos, builds, servers), browser (look something up on the web), intel (news, research briefs), apps (apps and VPS services), finance (money, subscriptions, credits), thinktank (work out an idea), axe (anything else).
  request: a complete instruction in English that makes sense without this conversation.
- remember: only lasting facts, ideas and preferences HE said that are worth keeping next month ("we should clean up the trading desk some day"). Not moods, not passing remarks, not details of a story, not opinions about other people. Never add your own advice. Short, in his words.
- reminders: things to do or be reminded of later. A reminder is never also a job. due = ISO 8601 with the Amsterdam offset if he named a time; a day without a time means 09:00 that day; else null.
Now is ${nu.toISOString()} (Luka is in Amsterdam). ${lopendRegel}
Empty arrays are fine. Plain conversation = just a reply.`;
}

function tekst(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Pak het JSON-object uit het antwoord; een model zet er soms ```json omheen. */
function eersteObject(raw: string): unknown {
  const start = raw.indexOf('{');
  const eind = raw.lastIndexOf('}');
  if (start < 0 || eind <= start) return null;
  try {
    return JSON.parse(raw.slice(start, eind + 1));
  } catch {
    return null;
  }
}

/** Valideert streng: een half plan wordt geen plan, dan neemt de oude route het. */
export function parseBeurtPlan(raw: string): BeurtPlan | null {
  const obj = eersteObject(raw || '');
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const reply = tekst(o.reply, 600);
  if (!reply) return null;

  const jobs: PlanJob[] = [];
  for (const j of Array.isArray(o.jobs) ? o.jobs : []) {
    if (!j || typeof j !== 'object') continue;
    const r = j as Record<string, unknown>;
    const request = tekst(r.request, 1200);
    if (!request) continue;
    const agent = JOB_AGENTS.includes(r.agent as AxeAgentId) ? (r.agent as AxeAgentId) : 'axe';
    jobs.push({ agent, title: tekst(r.title, 60) || request.slice(0, 60), request });
    if (jobs.length >= PLAN_MAX_JOBS) break;
  }

  const onthoud = (Array.isArray(o.remember) ? o.remember : [])
    .map((m) => tekst(m, 300))
    .filter(Boolean)
    .slice(0, 8);

  const herinneringen: PlanHerinnering[] = [];
  for (const h of Array.isArray(o.reminders) ? o.reminders : []) {
    if (!h || typeof h !== 'object') continue;
    const r = h as Record<string, unknown>;
    const title = tekst(r.title, 120);
    if (!title) continue;
    const due = tekst(r.due, 40);
    const geldig = due && !Number.isNaN(Date.parse(due)) ? new Date(due).toISOString() : undefined;
    herinneringen.push({ title, ...(geldig ? { dueAt: geldig } : {}) });
    if (herinneringen.length >= 8) break;
  }

  return { reply, jobs, onthoud, herinneringen };
}

/**
 * Wanneer het plan de beurt leest. Korte losse vragen blijven op de snelle
 * route (tier 1/2); pas bij meerdere stukken of een lange beurt loont een
 * modelaanroep die begrijpt wat een opdracht is en wat hardop denken.
 */
export function moetPlannen(text: string, stukken: number, tier: 1 | 2 | 3): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (stukken >= 2) return true;
  if (tier === 3) return true;
  return t.length >= 90;
}

/** Kort en in één stuk: zonder plan nog te vertrouwen als één opdracht. */
export function isKorteOpdracht(text: string): boolean {
  const t = (text || '').trim();
  return t.length > 0 && t.length <= 140 && splitsAxeBeurten(t).length <= 1;
}
