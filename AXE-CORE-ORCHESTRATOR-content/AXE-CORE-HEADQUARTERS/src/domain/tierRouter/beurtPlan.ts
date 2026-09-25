/**
 * Beurtplan — wat Luka bedoelt, niet waar de komma's staan.
 *
 * splitsAxeBeurten knipt op "en" en komma's. Voor een korte opdracht is dat
 * genoeg, voor een brain dump niet (gemeten 25 sep): "ik zat net te denken"
 * werd een eigen job, "we moeten de trading desk een keer opschonen" (een
 * idee) zette een shell-agent aan het werk, en "herinner me morgen om Jan te
 * bellen" ging naar de Browser-agent.
 *
 * Eén snelle modelaanroep leest de hele beurt en geeft terug: wat AXE hardop
 * zegt, wat er NU gedaan moet worden (en op welke computer), wat er met al
 * lopend werk moet gebeuren, wat onthouden moet worden, en wat een herinnering
 * is. Geen I/O hier; de aanroep zit in application/.
 */
import type { AxeAgentId } from '@/domain/agents/roster';
import { splitsAxeBeurten } from '@/domain/tierRouter/splitsAxeBeurten';

/** De drie computers waar werk op kan landen; null = het maakt niet uit. */
export type PlanDevice = 'vps' | 'mac-mini' | 'imac';

const PLAN_DEVICES: ReadonlyArray<PlanDevice> = ['vps', 'mac-mini', 'imac'];

export interface PlanJob {
  agent: AxeAgentId;
  title: string;
  /** Een opdracht die op zichzelf staat: de agent ziet het gesprek niet. */
  request: string;
  /** Waar het moet gebeuren. null als het werk overal kan draaien. */
  device?: PlanDevice | null;
}

/** Wat je met een taak kunt doen die al loopt. */
export type PlanControlActie = 'status' | 'cancel' | 'redirect' | 'approve' | 'reject' | 'overview';

const PLAN_CONTROL_ACTIES: ReadonlyArray<PlanControlActie> = [
  'status', 'cancel', 'redirect', 'approve', 'reject', 'overview',
];

/** Een greep naar een lopende taak: niet nieuw werk, maar werk besturen. */
export interface PlanControl {
  action: PlanControlActie;
  /** De korte id uit de lopende-lijst, bijvoorbeeld "j1". */
  job: string;
  /** Alleen bij redirect (en soms approve/reject): wat er in plaats daarvan moet. */
  instruction?: string;
}

export interface PlanHerinnering {
  title: string;
  /** ISO-tijd, als Luka er een noemde. */
  dueAt?: string;
}

export interface BeurtPlan {
  reply: string;
  jobs: PlanJob[];
  /** Wat er met al lopend werk moet gebeuren (status, stoppen, bijsturen). */
  controls: PlanControl[];
  onthoud: string[];
  herinneringen: PlanHerinnering[];
}

/** Agents die echt werk kunnen doen via de takenkernel. */
const JOB_AGENTS: ReadonlyArray<AxeAgentId> = [
  'northsea', 'trading', 'developer', 'browser', 'intel', 'apps', 'finance', 'thinktank', 'wingman', 'axe',
];

export const PLAN_MAX_JOBS = 6;

export const PLAN_MAX_CONTROLS = 6;

/** Groq-model voor het plan: groot genoeg om te begrijpen, ~0,3s. */
export const PLAN_GROQ_MODEL = 'openai/gpt-oss-120b';

export const PLAN_TIMEOUT_MS = 6_000;

export function planPrompt(nu: Date, lopend: string[]): string {
  const lopendRegel = lopend.length
    ? `Already running (do not start these again): ${lopend.join(' | ')}`
    : 'Nothing is running right now.';
  return `You are AXE, Luka's assistant. Luka is talking to you out loud, often thinking as he goes.
You remember what he told you before (see "What you remember" when present); use it like a friend would.
Read his whole message and decide what he actually wants. Reply with JSON only:
{"reply": string, "jobs": [{"agent": string, "title": string, "request": string, "device": string|null}], "controls": [{"action": string, "job": string, "instruction": string|null}], "remember": [string], "reminders": [{"title": string, "due": string|null}]}

- reply: what you say back, spoken, in the language he used. Talk like a real person who knows him well, not like a help desk: react to what he actually said. If he is telling a story, venting or thinking out loud, engage with it -- react, give your honest take, or ask one follow-up question. Never end with filler like "how can I help you". One to three short sentences. When you start jobs, say in a few words what you set in motion. Answer small questions directly. Never say you cannot do something that a job can do.
- jobs: ONLY things he asks to be done now. Not ideas ("we should some day..."), not thinking out loud, not stories, feelings or opinions, not questions you can answer in the reply. Most turns have no jobs. Max ${PLAN_MAX_JOBS}.
  agent: northsea (commodity desk, leads, mailbox - read only), trading (markets, positions, trading desk), developer (code, repos, builds, servers), browser (look something up on the web), intel (news, research briefs), apps (apps and VPS services), finance (money, subscriptions, credits), thinktank (work out an idea), axe (anything else).
  request: a complete instruction in English that makes sense without this conversation.
  device: which computer has to do it. Exactly one of "vps" (the always-on server), "mac-mini" or "imac" (his two Macs at home), or null. Set it as soon as he names a machine, and also when the work is clearly about the files, the apps, the screen or the repo checkout of one of the Macs. null when any machine will do, or when you are not sure -- never guess a machine.
- controls: what to do with work that is ALREADY running, never new work. Each running task is listed below as [j1] Trading Agent - "Check open positions" - running on VPS.
  action: status (he asks how it is going), cancel (he wants it stopped), redirect (it must keep going but differently), approve (he says yes to what it asked), reject (he says no to it), overview (he asks what is running at all -- use the first listed id).
  job: the short id between brackets, exactly as listed, for example j1. Never invent one: if you cannot point at a listed task, leave the control out.
  instruction: only with redirect (and optionally approve/reject): what he wants instead, in English. Otherwise null.
  A control is never also a job: asking about running work starts nothing.
- remember: everything he tells you that is worth knowing later: ideas and plans ("we should clean up the trading desk some day"), facts about his life, work and the people in it, what is going on with them, what he wants and prefers. One fact per item, short, in his words. Skip only filler, greetings and passing moods. Never add your own advice. Do not repeat what is already in your memory above.
- reminders: things to do or be reminded of later, only when he asks for one now. Never one that is already in your memory above. A reminder is never also a job.
- Never ask "shall I ...?" about something you are already doing in this same answer; just say it is done. due = ISO 8601 with the Amsterdam offset if he named a time; a day without a time means 09:00 that day; else null.
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

/** De korte ids uit de lopende-lijst: "[j1] Trading Agent - ..." levert "j1". */
export function lopendeJobIds(lopend: readonly string[]): string[] {
  const uit: string[] = [];
  for (const regel of lopend) {
    const m = typeof regel === 'string' ? /^\s*\[([A-Za-z0-9_-]{1,24})\]/.exec(regel) : null;
    if (m) uit.push(m[1]);
  }
  return uit;
}

/**
 * Valideert streng: een half plan wordt geen plan, dan neemt de oude route het.
 * `lopend` is dezelfde lijst als die planPrompt kreeg; zonder die lijst kent
 * het plan geen enkele lopende taak en vallen alle controls weg.
 */
export function parseBeurtPlan(raw: string, lopend: readonly string[] = []): BeurtPlan | null {
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
    // Strikt: alles wat niet exact een van de drie machines is, is geen machine.
    const device = PLAN_DEVICES.includes(r.device as PlanDevice) ? (r.device as PlanDevice) : null;
    jobs.push({ agent, title: tekst(r.title, 60) || request.slice(0, 60), request, device });
    if (jobs.length >= PLAN_MAX_JOBS) break;
  }

  // Controls wijzen naar werk dat al loopt; een id dat niet in die lijst staat
  // is een verzinsel van het model en gooien we weg.
  const bekendeJobs = lopendeJobIds(lopend);
  const controls: PlanControl[] = [];
  for (const c of Array.isArray(o.controls) ? o.controls : []) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    if (!PLAN_CONTROL_ACTIES.includes(r.action as PlanControlActie)) continue;
    const action = r.action as PlanControlActie;
    const gevraagd = tekst(r.job, 26).replace(/^\[|\]$/g, '');
    const job = bekendeJobs.find((id) => id.toLowerCase() === gevraagd.toLowerCase());
    if (!job) continue;
    const instruction = tekst(r.instruction, 600);
    controls.push({ action, job, ...(instruction ? { instruction } : {}) });
    if (controls.length >= PLAN_MAX_CONTROLS) break;
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

  return { reply, jobs, controls, onthoud, herinneringen };
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
