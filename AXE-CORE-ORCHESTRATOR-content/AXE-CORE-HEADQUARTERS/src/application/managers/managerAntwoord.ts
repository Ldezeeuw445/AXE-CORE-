/**
 * Een bericht aan een manager: antwoord via Luka's Claude-abonnement
 * (alleen-lezen), acties als gewone taken. Zie domain/agents/managerAntwoord.ts.
 */
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import { ABONNEMENT_PROVIDER } from '@/domain/abonnementChat';
import { agentById, type AxeAgentId } from '@/domain/agents/roster';
import { bewaarManagerChat, laadManagerChat, nieuwMsg } from '@/domain/agents/managerChatOpslag';
import { bouwManagerBerichten, splitsAntwoord } from '@/domain/agents/managerAntwoord';
import { MANAGER_DRAAD_EVT } from '@/infrastructure/persistence/managerDraadSync';

export const MANAGER_DENKT_EVT = 'axe-manager-denkt';

function meld(naam: string, detail: unknown) {
  try { globalThis.dispatchEvent?.(new CustomEvent(naam, { detail })); } catch { /* */ }
}

/**
 * Geeft true als de manager zelf antwoordde; false betekent: val terug op de
 * oude weg (een taak voor de agent-lus), bijvoorbeeld als de Mac met de CLI
 * niet bereikbaar is of elk abonnement op zijn limiet zit.
 */
export async function laatManagerAntwoorden(
  agentId: AxeAgentId,
  vraag: string,
  startTaak: (tekst: string) => void,
): Promise<boolean> {
  const agent = agentById(agentId);
  meld(MANAGER_DENKT_EVT, { agent: agentId, aan: true });
  try {
    const berichten = bouwManagerBerichten({ naam: agent.name, rol: agent.role }, laadManagerChat(agentId), vraag);
    const ruw = await callProvider({ provider: ABONNEMENT_PROVIDER, key: '', model: 'claude' }, berichten);
    const { tekst, acties } = splitsAntwoord(ruw);
    if (!tekst) return false;
    bewaarManagerChat(agentId, [...laadManagerChat(agentId), nieuwMsg('assistant', tekst)]);
    meld(MANAGER_DRAAD_EVT, 1);
    for (const actie of acties) startTaak(actie);
    return true;
  } catch (e) {
    console.warn('[AXE] manager via abonnement lukte niet, terug naar de agent-lus:', e);
    return false;
  } finally {
    meld(MANAGER_DENKT_EVT, { agent: agentId, aan: false });
  }
}
