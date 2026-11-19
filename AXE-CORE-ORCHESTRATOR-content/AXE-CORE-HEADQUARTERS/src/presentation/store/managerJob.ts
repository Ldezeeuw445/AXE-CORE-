/**
 * Een opdracht aan een manager starten: overal op dezelfde manier.
 *
 * Stond als functie in ManagersDesk.tsx; het managervenster op Home
 * (AgentVensters.tsx) startte zijn taken met een eigen kopie zonder `chat`,
 * en dan schrijft de VPS de voortgang niet in het gesprek van die manager
 * (taak_voortgang.py). BOUWLIJST "Eerst" 8, 20 nov: één route.
 */
import type { AxeAgentId } from '@/domain/agents/roster';
import { agentById } from '@/domain/agents/roster';
import { isGrokManager, type GrokManagerId } from '@/domain/agents/grokManagers';
import { isCodingOpdracht, primaireRepoVoor } from '@/domain/agents/bossRoute';
import { GESPREK_CONTEXT } from '@/domain/tierRouter/agentDraad';
import { managerChatRoute } from '@/domain/agents/managersComposerDoel';
import { laadManagerChat, gesprekContext } from '@/domain/agents/managerChatOpslag';
import { startAxeJobs } from '@/presentation/store/installTierRouter';

export function startManagerJob(
  agentId: AxeAgentId,
  tekst: string,
  opts?: { device?: string | null; tab?: string },
): void {
  const coding = isCodingOpdracht(tekst) && isGrokManager(agentId);
  const repo = coding ? primaireRepoVoor(agentId as GrokManagerId) : null;
  const basis = coding
    ? `${tekst}\n\n[AXE manager coding] Repo: ${repo}. Produce a branch + PR only. Never merge, never deploy. Wait for Luka's approval.`
    : tekst;
  const goal = `${basis}${GESPREK_CONTEXT}${gesprekContext(agentById(agentId).name, laadManagerChat(agentId), tekst)}`;
  startAxeJobs([{
    text: goal,
    titel: tekst.slice(0, 60),
    device: (opts?.device as 'mac-mini' | 'imac' | 'vps' | null | undefined) ?? null,
    tab: opts?.tab,
    repo,
    bron: 'followup',
    chat: agentId,
    route: managerChatRoute(agentId, tekst),
  }]);
}
