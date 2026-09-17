/**
 * Welke hoofdmotor elke tier-1 manager heeft.
 *
 * ## Waarom dit bestaat
 *
 * Luka heeft zes abonnementen -- drie Claude, twee ChatGPT (Codex) en Cursor --
 * en (sinds de CONFIRMED ARCHITECTURE van 17 sep 2026,
 * docs/HANDOFF_AXE_AGENT_FORCE.md) vijf tier-1 managers die er een mogen
 * dragen: Wingman, NorthSea Desk Manager, Trading Agent, AXE Developer,
 * ThinkTank. Zonder verdeling pakken ze allemaal wat er in de cascade staat, en
 * dan vechten ze om hetzelfde abonnement. Gemeten 13 september: de trading-desk
 * startte zes `codex exec`-sessies tegelijk en binnen een uur was Codex op, ook
 * voor de editor.
 *
 * ## AXE zelf draagt hier geen rij
 *
 * Tot 17 sep stond AXE Core (de chat) hier ook bij, met een abonnement als
 * mogelijke motor. Dat is de fout die de CONFIRMED ARCHITECTURE rechtzet: AXE's
 * dropdown is ALLEEN snelle/slimme chat-modellen, nooit een abonnement, nooit
 * Ollama (zie domain/chatModelKeuzes.ts, rij 1 in Settings). Een abonnement is
 * voor een tier-1 manager die een CLI-sessie draait, niet voor AXE's eigen
 * model-antwoord.
 *
 * ## De twee regels
 *
 * 1. **Een abonnement hoort bij hooguit één agent.** Niet in de UI alleen, maar
 *    hier: `normaliseer()` haalt een dubbele toewijzing weg, dus een oude
 *    opgeslagen waarde of een tweede venster kan het niet omzeilen.
 * 2. **Subtaken draaien nooit op een abonnement.** De elf desk-rollen,
 *    embeddings, samenvattingen: die gaan over je API-sleutels. Een abonnement
 *    is voor de hoofdbeurt -- de code-run, de eindbeslissing van de Trading
 *    Agent. Zie zonderAbonnement() in abonnementChat.ts.
 *
 * ## Cursor mag overal
 *
 * Tot 14 september alleen bij de Code Agent (nu: AXE Developer), omdat andere
 * agents in `plan` draaiden en Cursor geen alleen-lezen stand had. Die heeft
 * hij nu (`--mode ask`, zie abonnementChat.ts). Elke agent kan dus elk
 * abonnement.
 *
 * ## Wingman en ThinkTank zijn nieuw hier
 *
 * Beide waren al agents (roster.ts), maar droegen nog geen motor-rij. Wingman
 * en NorthSea Desk Manager beginnen op API-sleutels, net als de oude
 * Northsea-rij dat deed. ThinkTank erft de tweede ChatGPT-stoel (`codex2`) die
 * eerder braak lag op de plek "vrije agent, taak nog te kiezen" — die stoel
 * heeft nu een echte taak.
 *
 * ## De planner-brug blijft de oude namen spreken
 *
 * `plannerKoppeling.ts` vertaalt deze nieuwe ids terug naar de sleutels die
 * `planner.py` op de agent-host al kent (`code-agent`, `axe-algo`,
 * `maps-agent`) — die server-kant is in deze sessie niet aan te passen, dus de
 * BUITENKANT van de opslag verandert niet, alleen de namen die Luka in de UI
 * ziet.
 */
import { ALLE_MOTOREN, ABONNEMENT_PROVIDER, zonderAbonnement, type AgentEngine } from '@/domain/abonnementChat';

export type HoofdAgent = 'wingman' | 'northsea' | 'trading' | 'developer' | 'thinktank';

/** Een abonnement, of: je API-sleutels (de gewone cascade). */
export type HoofdMotor = AgentEngine | 'sleutels';

export type MotorToewijzing = Record<HoofdAgent, HoofdMotor>;

export const HOOFD_AGENTS: readonly HoofdAgent[] = ['wingman', 'northsea', 'trading', 'developer', 'thinktank'] as const;

export const AGENT_LABEL: Record<HoofdAgent, string> = {
  wingman: 'Wingman',
  northsea: 'NorthSea Desk Manager',
  trading: 'Trading Agent (AXE Algo)',
  developer: 'AXE Developer',
  thinktank: 'ThinkTank',
};

export const MOTOR_LABEL: Record<HoofdMotor, string> = {
  claude: 'Claude-abonnement',
  claude2: 'Claude-abonnement 2',
  claude3: 'Claude-abonnement 3',
  claude4: 'Claude-abonnement 4',
  codex2: 'ChatGPT-abonnement 2 (Codex)',
  codex: 'ChatGPT-abonnement (Codex)',
  codex3: 'ChatGPT-abonnement 3 (Codex)',
  cursor: 'Cursor-abonnement',
  sleutels: 'API-sleutels',
};

/** Wat elke agent überhaupt mag: sinds Cursor alleen-lezen kan, alles. */
export const TOEGESTAAN: Record<HoofdAgent, readonly HoofdMotor[]> = {
  wingman: [...ALLE_MOTOREN, 'sleutels'],
  northsea: [...ALLE_MOTOREN, 'sleutels'],
  trading: [...ALLE_MOTOREN, 'sleutels'],
  developer: [...ALLE_MOTOREN, 'sleutels'],
  thinktank: [...ALLE_MOTOREN, 'sleutels'],
};

/** Elk abonnement bij de agent die er het best bij past, geen enkele dubbel. */
export const STANDAARD_TOEWIJZING: MotorToewijzing = {
  wingman: 'sleutels',
  northsea: 'sleutels',
  trading: 'codex',
  developer: 'cursor',
  // De tweede ChatGPT-stoel: lag eerder braak op "vrije agent, taak nog te
  // kiezen", nu ThinkTank's echte motor.
  thinktank: 'codex2',
};

export const MOTOREN_SLEUTEL = 'axe_agent_motoren';

/**
 * Een toewijzing die de regels haalt.
 *
 * Onbekend of niet toegestaan valt terug op de standaard voor die agent, tenzij
 * die standaard al bezet is; dan API-sleutels. Een abonnement dat twee keer
 * voorkomt blijft bij de eerste agent in HOOFD_AGENTS-volgorde. Nooit een
 * uitzondering: een kapotte opgeslagen waarde mag de chat niet stilzetten.
 */
export function normaliseer(ruw: unknown): MotorToewijzing {
  const bron = (ruw && typeof ruw === 'object') ? ruw as Record<string, unknown> : {};
  const bezet = new Set<HoofdMotor>();
  const uit = {} as MotorToewijzing;
  for (const agent of HOOFD_AGENTS) {
    const gevraagd = bron[agent];
    const kandidaten: unknown[] = gevraagd === undefined ? [STANDAARD_TOEWIJZING[agent]] : [gevraagd, STANDAARD_TOEWIJZING[agent]];
    let gekozen: HoofdMotor = 'sleutels';
    for (const k of kandidaten) {
      if (typeof k !== 'string') continue;
      const motor = k as HoofdMotor;
      if (!TOEGESTAAN[agent].includes(motor)) continue;
      if (motor !== 'sleutels' && bezet.has(motor)) continue;
      gekozen = motor;
      break;
    }
    // Een expliciet gekozen 'sleutels' mag nooit stilletjes een abonnement worden.
    if (gevraagd === 'sleutels') gekozen = 'sleutels';
    if (gekozen !== 'sleutels') bezet.add(gekozen);
    uit[agent] = gekozen;
  }
  return uit;
}

/**
 * Wat je voor deze agent in het menu kunt kiezen: toegestaan, en niet al van
 * een andere agent. Zijn eigen huidige keuze staat er altijd in.
 */
export function kiesbaar(toewijzing: MotorToewijzing, agent: HoofdAgent): HoofdMotor[] {
  const vanAnderen = new Set(
    HOOFD_AGENTS.filter(a => a !== agent).map(a => toewijzing[a]).filter(m => m !== 'sleutels'),
  );
  return TOEGESTAAN[agent].filter(m => m === 'sleutels' || !vanAnderen.has(m));
}

/**
 * Een nieuwe keuze voor één agent. Neemt hij een abonnement dat al van een
 * andere agent was, dan krijgt die ander API-sleutels -- de keuze die je nú
 * maakt wint, en er staat nooit iets dubbel.
 */
export function wijsToe(toewijzing: MotorToewijzing, agent: HoofdAgent, motor: HoofdMotor): MotorToewijzing {
  if (!TOEGESTAAN[agent].includes(motor)) return toewijzing;
  const volgende = { ...toewijzing, [agent]: motor };
  if (motor !== 'sleutels') {
    for (const ander of HOOFD_AGENTS) {
      if (ander !== agent && volgende[ander] === motor) volgende[ander] = 'sleutels';
    }
  }
  return normaliseer(volgende);
}

/** Het abonnement van deze agent, of null als hij op API-sleutels draait. */
export function abonnementVan(toewijzing: MotorToewijzing, agent: HoofdAgent): AgentEngine | null {
  const m = toewijzing[agent];
  return m === 'sleutels' ? null : m;
}

/**
 * De cascade van één agent: zijn eigen abonnement vooraan, daarna alleen
 * API-sleutels.
 *
 * Elke abonnement-slot die al in de cascade stond gaat eruit -- ook die van de
 * ★ Primary. Anders zou de chat, als zijn eigen abonnement op is, doorvallen op
 * het abonnement van AXE Algo, en dat is precies het gevecht dat dit voorkomt.
 */
export function cascadeVoorAgent<T extends { provider?: string; model?: string; key?: string }>(
  cascade: readonly T[],
  abonnement: AgentEngine | null,
): T[] {
  const rest = zonderAbonnement(cascade);
  if (!abonnement) return rest;
  return [{ provider: ABONNEMENT_PROVIDER, model: abonnement, key: '' } as T, ...rest];
}
