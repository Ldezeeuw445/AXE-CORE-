/**
 * Welke weg jouw zin werkelijk nam.
 *
 * Settings toonde hier "AXE Branches": de drie routes van de
 * LangGraph-orchestrator op de VPS (CrewAI / cloudproviders / Claude Code).
 * Dat beschrijft een laag die de app bijna nooit meer bereikt --
 * `langGraphOrchestrator` wordt aangeroepen in `voiceStore.sendMessage`, de
 * BINNENSTE van vijf wikkels, die alleen draait als de tier-router én stable
 * chat allebei afhaken. Sinds de besturings- en registerrondes vangen die twee
 * vrijwel alles af.
 *
 * Gevolg: twee woordenlijsten voor "waar gaat mijn werk heen" -- branch A/B/C
 * in Settings, tier 1/2/3 in de code en de agentsbalk. Luka, 1 okt 2026:
 * precies wat één bron van waarheid in de weg zit.
 *
 * Dit telt de echte beurten uit `routingLog`. Puur: geen store, geen netwerk.
 */
import type { AxeAgentId } from '@/domain/agents/roster';

/** De drie wegen die een beurt kan nemen. Zelfde nummers als de tier-router. */
export type RouteTier = 1 | 2 | 3;

/** Eén beurt uit het routeringslog, structureel getypt. */
export interface RouteBeurt {
  ts: number;
  query?: string;
  routeTier?: RouteTier;
  via?: string;
  winner?: string;
  winnerModel?: string;
  delegate?: AxeAgentId;
}

export interface TierRegel {
  tier: RouteTier;
  naam: string;
  uitleg: string;
  /** Hoeveel van de gemeten beurten deze weg namen. */
  aantal: number;
  /** Welk deel van het totaal, 0..1. */
  deel: number;
  /** De motor die het laatst via deze weg antwoordde, of null. */
  laatsteMotor: string | null;
  /** De agent die het laatst via deze weg werkte (alleen tier 3). */
  laatsteAgent: AxeAgentId | null;
}

const TIERS: ReadonlyArray<{ tier: RouteTier; naam: string; uitleg: string }> = [
  { tier: 1, naam: 'Tier 1 — AXE himself', uitleg: 'Rules and memory. No model call: instant, free.' },
  { tier: 2, naam: 'Tier 2 — spoken back', uitleg: 'One fast model, streamed sentence by sentence.' },
  { tier: 3, naam: 'Tier 3 — background job', uitleg: 'A roster agent picks it up as a durable task.' },
];

/**
 * Welke weg een beurt nam.
 *
 * `routeTier` is de bron als hij er staat. Staat hij er niet -- oudere
 * beurten, of het legacy-pad -- dan leidt `via` hem af, zodat een log van
 * gisteren niet stilletjes als "onbekend" wegvalt.
 */
export function tierVan(beurt: RouteBeurt): RouteTier | null {
  if (beurt.routeTier === 1 || beurt.routeTier === 2 || beurt.routeTier === 3) return beurt.routeTier;
  switch (beurt.via) {
    case 'rules': return 1;
    case 'tier2': return 2;
    case 'tier3': case 'crew': return 3;
    default: return null;
  }
}

/**
 * De drie wegen met hun aandeel, nieuwste beurt eerst in `beurten`.
 *
 * Altijd alle drie, ook op nul: een weg die vandaag niet gebruikt is, is
 * informatie. Daarom geen filter op lege rijen.
 */
export function routeOverzicht(beurten: readonly RouteBeurt[], max = 50): TierRegel[] {
  const recent = [...beurten]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, max);
  const geteld = recent.map((b) => ({ b, tier: tierVan(b) })).filter((x) => x.tier !== null);
  const totaal = geteld.length;

  return TIERS.map(({ tier, naam, uitleg }) => {
    const eigen = geteld.filter((x) => x.tier === tier).map((x) => x.b);
    const laatste = eigen[0];
    return {
      tier,
      naam,
      uitleg,
      aantal: eigen.length,
      deel: totaal ? eigen.length / totaal : 0,
      laatsteMotor: laatste?.winner
        ? (laatste.winnerModel ? `${laatste.winner} · ${laatste.winnerModel}` : laatste.winner)
        : null,
      laatsteAgent: tier === 3 ? (laatste?.delegate ?? null) : null,
    };
  });
}

/** Eén regel over de laatste beurt, of null als er nog niets gemeten is. */
export function laatsteBeurtTekst(beurten: readonly RouteBeurt[]): string | null {
  const laatste = [...beurten].sort((a, b) => b.ts - a.ts)[0];
  if (!laatste) return null;
  const tier = tierVan(laatste);
  const weg = tier ? `tier ${tier}` : (laatste.via ?? 'unknown route');
  const motor = laatste.winner
    ? (laatste.winnerModel ? `${laatste.winner} · ${laatste.winnerModel}` : laatste.winner)
    : 'no engine recorded';
  return `Last turn went ${weg}, answered by ${motor}.`;
}
