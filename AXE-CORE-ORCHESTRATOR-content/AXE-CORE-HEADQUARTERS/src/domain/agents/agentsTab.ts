/**
 * De Agents-tab, verdeeld in de drie tiers.
 *
 * Luka, 30 sep, na een reeks voorbeelden: "dit is precies de dingen zoals ik
 * het vanaf het begin al wou." Wat hij wil is twee dingen tegelijk:
 *
 * 1. **De roster leest als de architectuur.** Tier 1 links, tier 2 in het
 *    midden, tier 3 rechts, en Wingman's crew over de volle breedte eronder —
 *    want dat is geen vierde tier, het zijn negen personas onder één manager.
 * 2. **Alles wat al op de tab stond blijft.** De activity-feed, de schedules
 *    en de wachtrij, het geheugen per namespace en de volledige roster met
 *    instellingen verdwijnen niet: ze worden vier weergaven van dezelfde
 *    agents. En klik je één agent aan, dan krijg je exact diezelfde vier terug
 *    — maar alleen die van hem.
 *
 * Dit bestand doet alleen het rekenwerk, zonder I/O en zonder React: welke
 * kolommen er zijn, welke agent onder welke kolom valt, en wat de tellers
 * onder een kaart moeten zeggen. De rijen zelf komen uit activity.ts, die de
 * tab al gebruikte — er komt geen tweede bron bij.
 */
import { AXE_AGENTS, type AxeAgent, type AxeAgentId } from '@/domain/agents/roster';
import { agentsByKind } from '@/domain/agents/catalog';
import { memoryOwners, type SchedulePlan, type AgentQueue } from '@/domain/agents/activity';

/**
 * Wat dit bestand van een geheugentelling nodig heeft, en niet meer.
 *
 * Bewust niet `NamespaceCount` uit infrastructure/ geïmporteerd: domain/ is de
 * binnenste laag en mag alleen uit domain/ en shared/ lezen (de eslint-regel
 * no-restricted-imports bewaakt dat). Deze vorm past structureel op
 * NamespaceCount, dus de laag erboven kan zijn eigen type gewoon doorgeven.
 */
export interface GeheugenTelling {
  /** Eigen rijen. null = niet te lezen, en dat is iets anders dan nul. */
  own: number | null;
}

/** Welke van de vier weergaven er open staat. */
export type AgentsWeergave = 'roster' | 'activity' | 'memory' | 'settings';

export const WEERGAVEN: ReadonlyArray<{ id: AgentsWeergave; label: string }> = [
  { id: 'roster', label: 'Roster' },
  { id: 'activity', label: 'Activity & plans' },
  { id: 'memory', label: 'Memory' },
  { id: 'settings', label: 'Settings' },
];

/** Welk onderdeel van één agent er in de rechterlade open staat. */
export type LadeTab = 'nu' | 'activity' | 'plans' | 'memory' | 'settings';

export const LADE_TABS: ReadonlyArray<{ id: LadeTab; label: string }> = [
  { id: 'nu', label: 'Now' },
  { id: 'activity', label: 'Activity' },
  { id: 'plans', label: 'Plans' },
  { id: 'memory', label: 'Memory' },
  { id: 'settings', label: 'Settings' },
];

export interface TierKolom {
  key: 'tier1' | 'tier2' | 'tier3';
  /** 'Tier 1' — staat klein boven de kolom. */
  rang: string;
  titel: string;
  /**
   * De motorregel van dit tier, in het Engels want hij staat in de UI. Dit is
   * dezelfde regel die Settings' "Motoren per agent" hanteert; hij staat hier
   * zodat je bij het lezen van de kolom meteen ziet WAAROM een agent op een
   * abonnement draait en een ander op een betaalde sleutel.
   */
  regel: string;
  leden: readonly AxeAgent[];
}

const TIER_TEKST: Record<TierKolom['key'], { titel: string; rang: string; regel: string }> = {
  tier1: {
    rang: 'Tier 1',
    titel: 'Managers',
    regel: 'One subscription each, so two managers never fight over the same limit.',
  },
  tier2: {
    rang: 'Tier 2',
    titel: 'Agents-tab workers',
    regel: 'Auto-routed between capable engines, Ollama included. Pinning is allowed, not required.',
  },
  tier3: {
    rang: 'Tier 3',
    titel: 'App agents',
    regel: 'Paid Anthropic/OpenAI keys only, gpt-4o-mini at least. The planner runs them itself.',
  },
};

/**
 * De drie kolommen, in de volgorde van de roster.
 *
 * AXE zelf staat er bewust NIET in: hij is geen tier, hij stuurt ze aan. Hij
 * heeft zijn eigen plek in de War Room en in de geheugentabel, waar hij met
 * afstand het meeste staan heeft.
 */
export function tierKolommen(): TierKolom[] {
  return (['tier1', 'tier2', 'tier3'] as const).map((key) => ({
    key,
    ...TIER_TEKST[key],
    leden: AXE_AGENTS.filter((a) => a.tier === key),
  }));
}

/**
 * De namespace waarin deze agent zijn geheugen schrijft.
 *
 * Uit catalog.ts en niet uit `memoryOwners()`: die tweede is de lijst die op
 * DEZE tab getoond wordt, en die laat de trading-namespaces er bewust uit —
 * het geheugen van de desk hoort op de Trading-tab. Voor "hoe heet zijn
 * namespace" is dat het verkeerde antwoord: dan heeft Trading er ineens geen.
 */
export function namespaceVan(id: AxeAgentId): string | null {
  return agentsByKind('core').find((e) => e.id === id)?.namespace || null;
}

/**
 * Wordt het geheugen van deze namespace op deze tab geteld? Voor trading niet:
 * die staat op zijn eigen tab. De lade zegt dat dan met zoveel woorden, in
 * plaats van een nul te tonen alsof hij niets onthoudt.
 */
export function teltMeeOpDezeTab(ns: string | null): boolean {
  return !!ns && memoryOwners().some((o) => o.namespace === ns);
}

/**
 * De cijfers onder een kaart. Alleen wat er echt is: een nul komt er niet op,
 * want dertien kaarten met "0 schedules · 0 queued · 0 episodes" is ruis waar
 * je doorheen moet lezen om de twee te vinden die wél iets hebben.
 */
export interface KaartTellers {
  schedules: number;
  queued: number;
  approvals: number;
  episodes: number;
}

export function tellersVoor(
  id: AxeAgentId,
  plans: readonly SchedulePlan[],
  queues: readonly AgentQueue[],
  counts: Readonly<Record<string, GeheugenTelling>>,
  episodesPerAgent: Readonly<Partial<Record<AxeAgentId, number>>> = {},
): KaartTellers {
  const queue = queues.find((q) => q.agent === id);
  const ns = namespaceVan(id);
  // `own` is het aantal geheugenrijen van de agent zelf; wat de trading-desk in
  // zijn namespace schreef telt hier niet mee, anders leest AXE's kaart als
  // 5.089 terwijl 4.300 daarvan van een ander is.
  const eigen = ns ? counts[ns]?.own ?? 0 : 0;
  return {
    schedules: plans.filter((p) => p.agent === id).length,
    queued: queue?.total ?? 0,
    approvals: queue?.approvals ?? 0,
    episodes: episodesPerAgent[id] ?? eigen,
  };
}

/**
 * Hoeveel agents er op dit moment werken. Staat naast de kop, zodat je in één
 * blik ziet of de ploeg loopt zonder de kolommen af te gaan.
 */
export function aantalWerkend(
  pulses: Readonly<Partial<Record<AxeAgentId, { working: boolean }>>>,
): number {
  return AXE_AGENTS.filter((a) => pulses[a.id]?.working).length;
}
