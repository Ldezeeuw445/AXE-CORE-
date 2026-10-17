/**
 * De agentstatus zoals de server hem ziet, elke 15 s zolang het venster zichtbaar is.
 *
 * Eén gedeelde poll voor alle lezers (kolom + venster), zodat twee componenten
 * niet twee keer dezelfde vraag stellen. Lukt de vraag niet, dan blijft de
 * vorige stand staan met `ok: false` -- liever een oude echte stand dan een
 * verzonnen nieuwe, en de kolom valt dan terug op wat hij al deed.
 */
import { useEffect, useState } from 'react';
import { getAgentActivity, listAgentTiers, listPendingApprovals, type DurableTaskApproval } from '@/infrastructure/gateways/axeCoreApiService';
import type { ServerAgent } from '@/domain/agents/serverStatus';
import { normaliseerServerAgent } from '@/domain/agents/pendingApproval';
import type { AgentTierKaart } from '@/domain/agents/agentTiers';
import { meldActiviteit } from '@/shared/axeActiviteit';
import { activiteitUitServer } from '@/domain/agents/activiteitUitServer';

const POLL_MS = 10_000;

interface Stand {
  agents: Record<string, ServerAgent>;
  ok: boolean;
  at: number;
  approvals: DurableTaskApproval[];
  tiers: AgentTierKaart | null;
}

let stand: Stand = { agents: {}, ok: false, at: 0, approvals: [], tiers: null };
const lezers = new Set<(s: Stand) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let bezig = false;
/** Ontwerp/Playwright heeft een stand gezet; de VPS-poll mag die niet overschrijven. */
let vastgezet = false;

async function poll(): Promise<void> {
  if (vastgezet || bezig || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
  bezig = true;
  try {
    const [uit, approvals, tiers] = await Promise.all([
      getAgentActivity(10),
      listPendingApprovals(50).catch(() => [] as DurableTaskApproval[]),
      listAgentTiers().catch(() => stand.tiers),
    ]);
    if (vastgezet) return;
    const agents: Record<string, ServerAgent> = {};
    for (const a of uit.agents) agents[a.agent] = normaliseerServerAgent(a);
    if (stand.ok) {
      for (const a of activiteitUitServer(stand.agents, agents)) meldActiviteit(a);
    }
    stand = { agents, ok: true, at: Date.now(), approvals, tiers: tiers ?? stand.tiers };
  } catch {
    if (!vastgezet) stand = { ...stand, ok: false };
  } finally {
    bezig = false;
    if (!vastgezet) lezers.forEach((l) => l(stand));
  }
}

/** Ververs nu, bv. na pauzeren/hervatten of Approve/Decline. */
export function verversServerAgents(): void {
  void poll();
}

/** Snapshot zonder hook: bol en pills lezen dezelfde poll. */
export function leesServerAgents(): Stand {
  return stand;
}

/** Ontwerp/Playwright: een stand in de gedeelde poll zetten zonder de VPS. */
export function zetServerAgentsStand(deel: Partial<Stand>): void {
  vastgezet = true;
  stand = {
    agents: deel.agents ?? stand.agents,
    ok: deel.ok ?? true,
    at: Date.now(),
    approvals: deel.approvals ?? stand.approvals,
    tiers: deel.tiers === undefined ? stand.tiers : deel.tiers,
  };
  lezers.forEach((l) => l(stand));
}

export function useServerAgents(): Stand {
  const [s, setS] = useState(stand);
  useEffect(() => {
    lezers.add(setS);
    if (!timer) {
      void poll();
      timer = setInterval(() => { void poll(); }, POLL_MS);
    }
    return () => {
      lezers.delete(setS);
      if (lezers.size === 0 && timer) { clearInterval(timer); timer = null; }
    };
  }, []);
  return s;
}
