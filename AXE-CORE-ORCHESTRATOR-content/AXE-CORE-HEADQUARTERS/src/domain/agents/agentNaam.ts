/**
 * Eén agent, hoe hij ook gespeld staat.
 *
 * ## Waarom dit bestaat
 *
 * `roster.ts` noemt de agents `axe`, `northsea`, `developer`, `task`. De
 * zaailijst voor `public.agents` (`agentRegistry.ts`) noemt diezelfde agents
 * `code_agent`, `task_agent`, `axe_algo`. De terugvallijst voor `core_agents`
 * (`catalogs/defaultAgents.ts`) noemt ze `axe-developer`, `task-manager`,
 * `trading-agent`, en zijn `memory_namespace` noemt ze nóg anders: `tasks`,
 * `thinkthanks`, `companion`. Vier spellingen voor veertien agents.
 *
 * Dat is niet alleen rommelig, het kost werk dat werkt. Gemeten 1 okt 2026 door
 * elke spelling uit alle drie de lijsten door `loopAgentVoor` te halen: van de
 * 42 spellingen losten er 13 niet op. `task_agent`, `memory_agent`,
 * `cron_manager`, `finance_agent`, `thinktank_agent` en `app_agent_manager`
 * gaven null, terwijl `task`, `memory`, `cron`, `finance`, `thinktank` en `apps`
 * het wél deden -- dezelfde agents. Een herinnering die onder de ene naam is
 * opgeslagen telt dan niet mee in de lus van de andere, en dan staat er een
 * agent op het scherm als "nog niet aangesloten" terwijl zijn code gewoon
 * draait. Die precieze fout is al twee keer eerder gerepareerd, per naam, in de
 * aliasstapel onderaan `memoryFeedbackService.ts` -- en elke reparatie liet de
 * volgende spelling open staan.
 *
 * ## Hoe
 *
 * Eerst de mechanische regel, want die dekt 29 van de 42: kleine letters,
 * streepje wordt liggend streepje, `axe_`-voorvoegsel eraf, en
 * `_agent` / `_manager` / `_agent_manager` eraf. Wat dan overblijft is in de
 * meeste gevallen de rosternaam zelf.
 *
 * De rest zijn echte onregelmatigheden, en die staan hieronder met naam en
 * reden. Geen van de twee lijsten wordt hernoemd: hun ids staan in een
 * Supabase-tabel en zijn ook geheugen-namespace-voorvoegsel op plekken, dus
 * hernoemen betekent data migreren. De vertaling hoort op één plek, en dit is
 * die plek.
 *
 * `agentNaam.test.ts` loopt elke spelling uit alle drie de lijsten langs. Komt
 * er een agent of een spelling bij die hier niet thuiskomt, dan wordt die test
 * rood in plaats van dat er stil een lus wegvalt.
 */
import { AXE_AGENTS, type AxeAgentId } from './roster';

const ROSTER_IDS = new Set<string>(AXE_AGENTS.map((a) => a.id));

/**
 * Namen die in een tabel staan maar geen rosteragent ZIJN.
 *
 * Niet "nog niet opgezocht": allemaal met reden uitgesloten in roster.ts.
 * `eve` is een personaraamwerk, geen agent met eigen werk. `infrastructure`
 * heeft nooit een rosterplek gehad. `axe_ollama` en `axe_trader`/`Trading OS`
 * zijn een modelleverancier en een losse applicatie (zie ECOSYSTEM.md).
 *
 * Let op het verschil met `crewai_manager`: dat is géén eigen agent (Wingman
 * draait de crews), maar het is wél Wingmans werk, dus dat hoort bij de
 * onregelmatigheden hieronder en niet hier. Een rij die niet als eigen kaart
 * mag tonen is iets anders dan werk dat bij niemand hoort.
 */
export const GEEN_ROSTERAGENT: ReadonlySet<string> = new Set([
  'eve',
  'infrastructure',
  'axe_ollama',
  'ollama',
]);

/**
 * Wat de mechanische regel niet kan weten.
 *
 * Elke regel een reden, want een aliastabel zonder redenen groeit tot niemand
 * meer durft te schrappen.
 */
const ONREGELMATIG: Readonly<Record<string, AxeAgentId>> = {
  // 'code' is hoe de developer-agent heette vóór de tier-herschrijving; zijn
  // namespace (axe_code) en zijn zaai-id (code_agent) dragen dat nog.
  code: 'developer',
  // De lokale variant van dezelfde agent: ander model, zelfde agent, en ze
  // delen met opzet wat ze leren.
  local_code: 'developer',
  'code_editor': 'developer',
  // AXE zelf. 'core' komt uit axe-core, 'global' is zijn namespace: hij woont
  // in de gedeelde laag in plaats van een eigen.
  core: 'axe',
  global: 'axe',
  // 'trader' komt uit namespace axe_trader, die ouder is dan deze catalogus en
  // de lusgeschiedenis van trading al bevat. 'algo' uit zaai-id axe_algo.
  trader: 'trading',
  algo: 'trading',
  axe_algo: 'trading',
  // Een spelfout die in data is vastgelegd: de tab heet ThinkThanks, de agent
  // thinktank. Hernoemen zou de herinneringen losmaken van hun agent.
  thinkthanks: 'thinktank',
  // Meervoud tegen enkelvoud, en omgekeerd. Twee keer dezelfde soort slip.
  tasks: 'task',
  app: 'apps',
  // CrewAI Manager is geen eigen agent -- roster.ts zegt waarom: "redundant,
  // Wingman already runs the crews it needs". Zijn werk is dus Wingmans werk,
  // en zijn herinneringen horen in Wingmans lus.
  crewai: 'wingman',
  // 'research' is een lus zonder rosteragent (het is werk dat AXE zelf doet).
  // Hij staat hier bewust NIET: zie loopAgentVoor, waar de luskant hem kent.
};

/** Kleine letters, één soort streepje, voor- en achtervoegsels eraf. */
function normaliseer(spelling: string): string {
  let k = spelling.trim().toLowerCase().replace(/-/g, '_');
  if (k.startsWith('axe_') && !ONREGELMATIG[k]) k = k.slice(4);
  for (const achter of ['_agent_manager', '_manager', '_agent']) {
    if (k.endsWith(achter) && k.length > achter.length) {
      k = k.slice(0, -achter.length);
      break;
    }
  }
  return k;
}

/**
 * Staat deze naam met reden op de lijst van wat geen agent is?
 *
 * Los van `canoniekeAgent`, dat voor beide gevallen null geeft: "dit is met
 * reden geen agent" en "ik ken deze naam niet" horen niet hetzelfde te lijken.
 * Het eerste is een besluit, het tweede is een gat.
 */
/**
 * Welke rosteragent dit is, hoe het ook gespeld staat.
 *
 * `null` betekent: geen rosteragent. Dat is met opzet geen terugval op een
 * gokje -- een verzonnen agentnaam vervuilt de tellingen, en dan lijkt er een
 * lus te draaien die niet bestaat.
 */
export function isGeenRosteragent(spelling: string | undefined | null): boolean {
  if (!spelling) return false;
  const ruw = spelling.trim().toLowerCase().replace(/-/g, '_');
  return GEEN_ROSTERAGENT.has(ruw) || GEEN_ROSTERAGENT.has(normaliseer(spelling));
}

export function canoniekeAgent(spelling: string | undefined | null): AxeAgentId | null {
  if (!spelling) return null;
  const ruw = spelling.trim().toLowerCase().replace(/-/g, '_');
  if (GEEN_ROSTERAGENT.has(ruw)) return null;
  if (ONREGELMATIG[ruw]) return ONREGELMATIG[ruw];
  if (ROSTER_IDS.has(ruw)) return ruw as AxeAgentId;

  const kaal = normaliseer(spelling);
  if (GEEN_ROSTERAGENT.has(kaal)) return null;
  if (ONREGELMATIG[kaal]) return ONREGELMATIG[kaal];
  if (ROSTER_IDS.has(kaal)) return kaal as AxeAgentId;
  return null;
}
