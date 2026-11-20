import { leesOverrides } from '@/infrastructure/persistence/agentEngineOverrides';
import { getProviderKeySlot } from '@/infrastructure/config/providerSleutels';
/**
 * Een bericht aan een manager: antwoord via Luka's Claude-abonnement
 * (alleen-lezen), acties als gewone taken. Zie domain/agents/managerAntwoord.ts.
 */
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import { ABONNEMENT_PROVIDER } from '@/domain/abonnementChat';
import { agentById, type AxeAgentId } from '@/domain/agents/roster';
import { bewaarManagerChat, laadManagerChat, nieuwMsg } from '@/domain/agents/managerChatOpslag';
import { bouwManagerBerichten, bronnenRegel, splitsAntwoord } from '@/domain/agents/managerAntwoord';
import { MANAGER_DRAAD_EVT } from '@/infrastructure/persistence/managerDraadSync';
import { leesLessen, leesManagerContext } from '@/infrastructure/gateways/axeCoreApiService';

/* 18 nov: de lessen (Luka's correcties) gaan mee in elk antwoord van een
   manager; eens per minuut opgehaald. */
let lessenCache: { t: number; tekst: string; aantal: number } = { t: 0, tekst: '', aantal: 0 };
async function lessenContext(): Promise<{ tekst: string; aantal: number }> {
  if (Date.now() - lessenCache.t < 60_000) return lessenCache;
  try {
    const { lessen } = await leesLessen(25);
    const tekst = lessen.length
      ? `[Lessen van Luka -- volg ze altijd, nieuwste eerst:\n${lessen.map((l) => l.les).join('\n\n')}]`
      : '';
    lessenCache = { t: Date.now(), tekst, aantal: lessen.length };
  } catch { lessenCache = { t: Date.now(), tekst: '', aantal: 0 }; }
  return lessenCache;
}

/* 19 nov (audit, punt 1): de wereld van déze manager -- open taken, wat op
   Luka wacht, wat mislukte, wat hij zelf deed, wat hij mag. Per manager eens
   per minuut; geen verbinding = gewoon zonder. */
type Wereld = { t: number; tekst: string; bronnen: Record<string, number> };
const contextCache = new Map<string, Wereld>();
async function managerContext(agentId: string): Promise<Wereld> {
  const vorig = contextCache.get(agentId);
  if (vorig && Date.now() - vorig.t < 60_000) return vorig;
  let w: Wereld;
  try {
    const { context, bronnen } = await leesManagerContext(agentId);
    w = { t: Date.now(), tekst: context ? `[${context}]` : '', bronnen: bronnen ?? {} };
  } catch { w = { t: Date.now(), tekst: '', bronnen: {} }; }
  contextCache.set(agentId, w);
  return w;
}

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
    const [lessen, wereld] = await Promise.all([lessenContext(), managerContext(agentId)]);
    const erbij = [wereld.tekst, lessen.tekst].filter(Boolean).join('\n\n');
    const berichten = bouwManagerBerichten({ naam: agent.name, rol: agent.role }, laadManagerChat(agentId),
      erbij ? `${vraag}\n\n${erbij}` : vraag);
    const voorkeur = leesOverrides()[agentId];
    const standaard = { provider: ABONNEMENT_PROVIDER, key: '', model: 'claude' } as const;
    const slot = voorkeur ? getProviderKeySlot(voorkeur.provider) : null;
    const ruw = await callProvider(slot && voorkeur ? { ...slot, model: voorkeur.model } : standaard, berichten);
    const { tekst, acties } = splitsAntwoord(ruw);
    if (!tekst) return false;
    const bron = bronnenRegel({ ...wereld.bronnen, lessen: lessen.aantal });
    bewaarManagerChat(agentId, [...laadManagerChat(agentId), nieuwMsg('assistant', bron ? `${tekst}\n\n${bron}` : tekst)]);
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
