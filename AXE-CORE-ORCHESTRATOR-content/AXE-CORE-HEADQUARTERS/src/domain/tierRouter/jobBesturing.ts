/**
 * jobBesturing.ts — de herkenner voor het BESTUREN van een taak die al loopt.
 *
 * Gemeten probleem: "wat doet de trading agent?" matcht DOMAIN_SIGNALS.trading
 * in roster.ts, komt via classifyAxeTier op tier 3 uit, en start dus een NIEUWE
 * trading-taak in plaats van te vertellen wat de lopende doet. Hetzelfde bij
 * "stop de northsea taak". SESSION_RE in axeRoute.ts vangt alleen exacte
 * woorden als "status" af, dus al het overige valt erdoorheen.
 *
 * Deze module is puur: geen netwerk, geen store, geen React. Hij kijkt naar de
 * zin en naar de lijst lopende jobs, en zegt welke besturing erin zit — of
 * niets (null), zodat de gewone route zijn werk gewoon blijft doen.
 *
 * Regel die boven alles gaat: bij twijfel gebeurt er NIETS. Dan komt er één
 * korte vraag terug (`twijfel`) die de kandidaten noemt, en blijft `jobIds`
 * leeg. Liever één keer navragen dan de verkeerde taak afkappen.
 */
import { AXE_AGENTS, agentById, type AxeAgentId } from '@/domain/agents/roster';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';

export type BesturingActie =
  | 'status'
  | 'cancel'
  | 'redirect'
  | 'approve'
  | 'reject'
  | 'overview';

export type Besturing = {
  actie: BesturingActie;
  /** Leeg zodra er ook maar iets onduidelijk is. Nooit gokken. */
  jobIds: string[];
  /** Alleen bij 'redirect': de nieuwe opdracht, in de woorden van Luka zelf. */
  instructie?: string;
  /** Eén korte vraag terug; staat er een vraag, dan is `jobIds` altijd leeg. */
  twijfel?: string;
};

// ── Herkenning van de actie ───────────────────────────────────────────────

const OVERZICHT_RE =
  /\b(wat (loopt|draait|lopen|draaien)|welke (taken|jobs) (lopen|draaien)|lopende (taken|jobs)|wat ben je aan het doen|wat heb je (allemaal )?lopen|what'?s running|what is running|what are you (working on|running)|which (jobs|tasks) are running|running (jobs|tasks))\b/i;

const REDIRECT_RE =
  /\b(in plaats daarvan|in plaats hiervan|instead|actually|toch (op|via|met|naar|in)|doe het toch|verander (het|dat) (naar|in)|change (it|that) to|switch (it|that) to|make it|liever (op|via|met))\b/i;

/** "stop loss" is handelstaal, geen annulering. Eerst uitsluiten. */
const HANDELS_STOP_RE = /\bstop[- ]?(loss|order|limit)\b/i;

const CANCEL_RE =
  /(^\s*(stop|stoppen|cancel|kill|abort|annuleer|halt)\b)|\b(laat (het |die |dat )?maar( zitten)?|hou (er |ermee )?op( met)?|stop ermee|stop er mee|stop (het|die|dat|hem|de|met)|cancel (it|that|the|de|het)|kill (it|that|the)|forget it|vergeet het|niet meer doen|kap ermee)\b/i;

const STATUS_RE =
  /\b(wat doet|wat is .{1,40}(aan het doen|mee bezig)|hoe staat het (met|ermee)|hoe gaat het met|hoe ver is|waar is .{1,40}mee bezig|what'?s .{1,40}doing|what is .{1,40}doing|how'?s .{1,40}(doing|going)|how is .{1,40}(doing|going)|status (van|of|on)|how far (is|along)|progress (on|of))\b/i;

const APPROVE_RE =
  /^\s*((ja|yes|yep|yeah|ok|okay|oke|oké|prima|akkoord)\b[\s,.!]*(doe (het |dat )?maar|doe het|ga door|go ahead|do it|run it|approve( it)?|proceed)?|(doe (het |dat )?maar|go ahead|do it|run it|approve( it)?|ga door|proceed|goedkeuren))[\s.!]*$/i;

const REJECT_RE =
  /^\s*(nee|no|nope|niet doen|doe (het |dat )?niet|don'?t|do not|reject( it)?|weiger(en)?|liever niet|afwijzen)\b[\s,.!]*(dat|it|that|doen)?[\s.!]*$/i;

/** Expliciet "alles" is geen gok — dan mogen alle lopende jobs mee. */
const ALLES_RE =
  /\b(alles|allemaal|alle (taken|jobs)|everything|all of (it|them)|all (jobs|tasks)|both)\b/i;

const LAATSTE_RE =
  /\b(laatste|nieuwste|recentste|meest recente|last( one)?|latest|most recent|newest)\b/i;

const EERSTE_RE = /\b(eerste|oudste|first( one)?|oldest)\b/i;

// ── Woorden die niets over het doelwit zeggen ─────────────────────────────

/**
 * Frases die bij de ACTIE horen, niet bij het doelwit. Die knippen we eruit
 * vóór we kijken over welke taak het gaat — anders telt "stop" of "doing" mee
 * als aanwijzing.
 */
const MARKEER_FRASES = [
  'in plaats daarvan', 'in plaats hiervan', 'instead', 'actually',
  'doe het toch', 'doe het', 'doe maar', 'doe dat maar', 'do it', 'run it',
  'verander het naar', 'verander dat naar', 'change it to', 'change that to',
  'switch it to', 'make it', 'liever op', 'liever via', 'liever met',
  'wat doet', 'wat is', 'aan het doen', 'mee bezig',
  'hoe staat het met', 'hoe staat het', 'hoe gaat het met', 'hoe ver is',
  'waar is', "what's", 'what is', 'whats', 'doing', "how's", 'how is', 'going',
  'status van', 'status of', 'status on', 'how far is', 'how far along',
  'progress on', 'progress of',
  'wat loopt', 'wat draait', 'welke taken lopen', 'lopende taken',
  "what's running", 'what is running', 'what are you working on',
  'laat maar zitten', 'laat maar', 'hou op met', 'hou ermee op', 'hou op',
  'stop ermee', 'stop er mee', 'forget it', 'vergeet het', 'kap ermee',
  'go ahead', 'ga door', 'approve', 'akkoord', 'reject', 'niet doen',
  'proceed', 'goedkeuren', 'weigeren', 'afwijzen',
  'stop', 'stoppen', 'cancel', 'kill', 'abort', 'annuleer', 'halt',
  'ja', 'nee', 'yes', 'no', 'ok', 'okay', 'oke',
];

/** Langste frase eerst, anders laat "laat maar" het woord "zitten" liggen. */
const GESORTEERDE_FRASES = [...MARKEER_FRASES].sort((a, b) => b.length - a.length);

const VULWOORDEN = new Set([
  'de', 'het', 'die', 'dat', 'deze', 'dit', 'the', 'that', 'this', 'these', 'those',
  'een', 'an', 'er', 'there', 'maar', 'nog', 'nou', 'even', 'eens', 'zitten',
  'please', 'alsjeblieft', 'alstublieft', 'toch', 'mee', 'ermee', 'hem', 'haar',
  'hun', 'it', 'its', 'alles', 'allemaal', 'everything', 'both', 'beide',
  'taak', 'taken', 'task', 'tasks', 'job', 'jobs', 'opdracht', 'opdrachten',
  'agent', 'agents', 'van', 'of', 'met', 'with', 'op', 'on', 'aan', 'voor', 'for',
  'en', 'and', 'mijn', 'my', 'je', 'jouw', 'your', 'is', 'are', 'was', 'ben',
  'bent', 'nu', 'now', 'right', 'dan', 'then', 'uit', 'af', 'om', 'te', 'to',
  'in', 'at', 'me', 'ik', 'you', 'we', 'wel', 'niet', 'not', 'be', 'bezig',
  'busy', 'one', 'ene', 'them', 'those',
  // volgorde-woorden: die handelen we apart af (LAATSTE_RE / EERSTE_RE)
  'laatste', 'eerste', 'last', 'first', 'latest', 'oldest', 'nieuwste',
  'recentste', 'recent', 'newest',
]);

/**
 * Woorden die in élke agentnaam zitten en dus niets onderscheiden. Zonder deze
 * lijst zou "stop de task" zowel de Task-agent als elke andere taak raken.
 */
const GENERIEKE_AGENTWOORDEN = new Set([
  'axe', 'core', 'agent', 'manager', 'desk', 'app', 'task', 'the', 'ai',
]);

/** Apparaatnamen, per groep synoniemen. "mac mini" wordt "macmini" (normaliseer). */
const APPARAAT_GROEPEN: readonly string[][] = [
  ['imac'],
  ['macmini'],
  ['vps', 'hetzner'],
  ['iphone', 'telefoon', 'phone', 'a17', 'android'],
  ['macbook', 'laptop'],
  ['mac'],
];

// ── Kleine hulpjes ────────────────────────────────────────────────────────

function normaliseer(tekst: string): string {
  return (tekst || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\bnorth sea\b/g, 'northsea')
    .replace(/\bmac mini\b/g, 'macmini')
    .trim();
}

function woorden(genormaliseerd: string): string[] {
  return genormaliseerd.split(/[^a-z0-9']+/).filter(Boolean);
}

function ontsnap(frase: string): string {
  return frase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** De zin zonder actie-frases en zonder vulwoorden: wat er over doelwit gaat. */
function doelWoordenVan(genormaliseerd: string): string[] {
  let rest = ` ${genormaliseerd} `;
  for (const frase of GESORTEERDE_FRASES) {
    rest = rest.replace(new RegExp(`\\b${ontsnap(frase)}\\b`, 'g'), ' ');
  }
  return woorden(rest).filter((w) => w.length > 1 && !VULWOORDEN.has(w));
}

function agentWoorden(id: AxeAgentId): string[] {
  const a = agentById(id);
  const ruw = [
    id,
    ...woorden(normaliseer(a.name)),
    ...woorden(normaliseer(a.kort ?? '')),
  ];
  return [...new Set(ruw)].filter(
    (w) => w.length >= 3 && !GENERIEKE_AGENTWOORDEN.has(w),
  );
}

/** Elk woord dat een agent aanwijst — of die agent nu een job heeft of niet. */
const ALLE_AGENTWOORDEN = new Set(AXE_AGENTS.flatMap((a) => agentWoorden(a.id)));

function isApparaatWoord(w: string): boolean {
  return APPARAAT_GROEPEN.some((groep) => groep.includes(w));
}

function jobWoorden(job: AxeJob): Set<string> {
  return new Set(woorden(normaliseer(`${job.title} ${job.sourceText}`)));
}

/** Woorden uit de taaktitel die genoeg zeggen om op te matchen. */
function titelWoorden(job: AxeJob): Set<string> {
  const uit = new Set<string>();
  for (const w of jobWoorden(job)) {
    if (w.length >= 4 && !VULWOORDEN.has(w)) uit.add(w);
  }
  return uit;
}

/**
 * Hoe sterk wijst deze zin naar deze job? Agentnaam weegt het zwaarst,
 * daarna het apparaat, daarna losse woorden uit de titel.
 */
function scoor(job: AxeJob, doel: string[]): number {
  let score = 0;
  if (agentWoorden(job.agent).some((w) => doel.includes(w))) score += 3;

  const inJob = jobWoorden(job);
  for (const groep of APPARAAT_GROEPEN) {
    if (groep.some((w) => doel.includes(w)) && groep.some((w) => inJob.has(w))) {
      score += 2;
      break;
    }
  }

  const titel = titelWoorden(job);
  for (const w of doel) if (titel.has(w)) score += 1;
  return score;
}

function beste(jobs: readonly AxeJob[], doel: string[]): AxeJob[] {
  const scores = jobs.map((j) => scoor(j, doel));
  const max = Math.max(0, ...scores);
  if (max === 0) return [];
  return jobs.filter((_, i) => scores[i] === max);
}

function noem(job: AxeJob): string {
  const a = agentById(job.agent);
  return `${a.kort ?? a.name} (${job.title})`;
}

const WERKWOORD: Record<BesturingActie, string> = {
  status: 'check',
  cancel: 'stop',
  redirect: 'change',
  approve: 'approve',
  reject: 'reject',
  overview: 'list',
};

/** Eén korte vraag, met de kandidaten erin. UI-tekst is Engels. */
function vraag(actie: BesturingActie, kandidaten: readonly AxeJob[]): string {
  const ww = WERKWOORD[actie];
  if (kandidaten.length === 0) return `Nothing is running — what should I ${ww}?`;
  const lijst = kandidaten.slice(0, 4).map(noem);
  const laatste = lijst.pop() as string;
  const rij = lijst.length ? `${lijst.join(', ')} or ${laatste}` : laatste;
  return `Which one should I ${ww} — ${rij}?`;
}

/** Frases die alleen aangeven dát het anders moet; de rest is de opdracht. */
const INSTRUCTIE_RUIS = [
  'in plaats daarvan', 'in plaats hiervan', 'instead', 'actually',
  'change it to', 'change that to', 'switch it to', 'switch that to',
  'verander het naar', 'verander dat naar',
];

function instructieVan(ruw: string): string {
  let s = ruw.trim();
  for (const frase of INSTRUCTIE_RUIS) {
    s = s.replace(new RegExp(`\\b${ontsnap(frase)}\\b`, 'gi'), ' ');
  }
  s = s.replace(/\s+/g, ' ').replace(/^[\s,;.:-]+/, '').replace(/[\s,;.:!?-]+$/, '');
  return s || ruw.trim();
}

function bepaalActie(t: string): BesturingActie | null {
  if (OVERZICHT_RE.test(t)) return 'overview';
  if (REDIRECT_RE.test(t)) return 'redirect';
  if (!HANDELS_STOP_RE.test(t) && CANCEL_RE.test(t)) return 'cancel';
  if (STATUS_RE.test(t)) return 'status';
  if (APPROVE_RE.test(t)) return 'approve';
  if (REJECT_RE.test(t)) return 'reject';
  return null;
}

/** Uitkomst van het zoeken naar het doelwit. */
type Keuze =
  | { soort: 'treffers'; jobs: AxeJob[] }
  | { soort: 'alle' }
  | { soort: 'twijfel' }
  | { soort: 'geen-besturing' };

function kiesDoelwit(
  t: string,
  actie: BesturingActie,
  jobs: readonly AxeJob[],
): Keuze {
  // Expliciet alles: geen gok, dus ook geen vraag terug.
  if (ALLES_RE.test(t) && (actie === 'cancel' || actie === 'status')) {
    return { soort: 'alle' };
  }

  // Volgorde/recentheid gaat voor: dat is een directe aanwijzing.
  if (LAATSTE_RE.test(t)) return { soort: 'treffers', jobs: [jobs[jobs.length - 1]] };
  if (EERSTE_RE.test(t)) return { soort: 'treffers', jobs: [jobs[0]] };

  const doel = doelWoordenVan(t);

  if (actie === 'redirect') {
    // Bij bijsturen is "op de iMac" de nieuwe OPDRACHT, geen doelwit. Alleen
    // een agentnaam mag hier nog kiezen welke taak bijgestuurd wordt.
    const agentDoel = doel.filter((w) => ALLE_AGENTWOORDEN.has(w));
    if (agentDoel.length === 0) return { soort: 'treffers', jobs: [...jobs] };
    const treffers = beste(jobs, agentDoel);
    return treffers.length ? { soort: 'treffers', jobs: treffers } : { soort: 'twijfel' };
  }

  // Kaal commando ("stop", "hoe staat het ermee"): alles wat loopt is kandidaat.
  if (doel.length === 0) return { soort: 'treffers', jobs: [...jobs] };

  const treffers = beste(jobs, doel);
  if (treffers.length) return { soort: 'treffers', jobs: treffers };

  // Er is wél een agent of apparaat genoemd, maar geen enkele lopende taak
  // hoort erbij → vragen, nooit de enige andere taak pakken.
  if (doel.some((w) => ALLE_AGENTWOORDEN.has(w) || isApparaatWoord(w))) {
    return { soort: 'twijfel' };
  }

  // Verder niets herkenbaars: dit ging waarschijnlijk niet over een taak.
  return { soort: 'geen-besturing' };
}

/**
 * Zit er in deze zin een besturing van een lopende taak? `liveJobs` is de
 * lijst uit axeJobStore (lopendeJobs(jobs)). `null` = laat de gewone route
 * zijn gang gaan.
 */
export function herkenBesturing(
  tekst: string,
  liveJobs: readonly AxeJob[],
): Besturing | null {
  const ruw = (tekst || '').trim();
  if (!ruw) return null;

  const t = normaliseer(ruw);
  if (!t) return null;

  const actie = bepaalActie(t);
  if (!actie) return null;

  // Dubbele zekerheid: een afgeronde job mag nooit meer geraakt worden.
  const jobs = (liveJobs || []).filter(
    (j) => j.state === 'queued' || j.state === 'running' || j.state === 'waiting',
  );

  if (actie === 'overview') {
    return { actie: 'overview', jobIds: jobs.map((j) => j.id) };
  }

  // Niets onderweg → niets te besturen; dit was gewoon een zin.
  if (jobs.length === 0) return null;

  if (actie === 'approve' || actie === 'reject') {
    const wachtend = jobs.filter((j) => j.state === 'waiting');
    // "ja doe maar" zonder wachtende goedkeuring is doodgewoon praten.
    if (wachtend.length === 0) return null;
    if (wachtend.length === 1) return { actie, jobIds: [wachtend[0].id] };
    return { actie, jobIds: [], twijfel: vraag(actie, wachtend) };
  }

  const keuze = kiesDoelwit(t, actie, jobs);
  if (keuze.soort === 'geen-besturing') return null;
  if (keuze.soort === 'alle') return { actie, jobIds: jobs.map((j) => j.id) };

  const instructie = actie === 'redirect' ? instructieVan(ruw) : undefined;
  const treffers = keuze.soort === 'treffers' ? keuze.jobs : [];

  if (treffers.length === 1) {
    return instructie
      ? { actie, jobIds: [treffers[0].id], instructie }
      : { actie, jobIds: [treffers[0].id] };
  }

  // Meerdere kandidaten of geen enkele: vragen, en niets aanraken.
  const twijfel = vraag(actie, treffers.length ? treffers : jobs);
  return instructie ? { actie, jobIds: [], instructie, twijfel } : { actie, jobIds: [], twijfel };
}
