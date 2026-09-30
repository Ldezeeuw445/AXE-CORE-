/**
 * Wat een agent mag draaien, en wat hij werkelijk draait — uit één regel.
 *
 * `roster.ts` declareert per agent een `dropdownScope`: `fast-smart` voor AXE,
 * `subscription` voor de tier-1 managers, `auto-route` voor de tier-2 workers,
 * `paid-api` voor de tier-3 app-agents. Dat veld werd door niets gehandhaafd.
 * Alleen `roster.test.ts` controleerde dát het er stond en de agentlade toonde
 * de regel als tekst; de echte keuzes werden op drie andere plekken gemaakt:
 *
 * - Settings (`AgentMotorenSection.tsx`) had drie handgeschreven secties, elk
 *   met zijn eigen lijstfunctie.
 * - AXE's chat (`installStableChat.ts`) bouwde een cascade en haalde er
 *   `zonderAbonnement()` overheen.
 * - De tier-router (`installTierRouter.ts`) had in `snelSlot()` een eigen
 *   `['abonnement','ollama']` staan.
 *
 * Diezelfde regel -- "AXE is nooit een abonnement en nooit Ollama" -- stond
 * daarmee drie keer los opgeschreven. Verandert hij, dan moet je hem op drie
 * plekken vinden, en een nieuwe agent in de roster kreeg helemaal niets.
 *
 * Dit bestand is de enige plek die weet wat een scope betekent. Twee vragen,
 * één antwoord per scope:
 *
 * - `keuzesVoorAgent` — wat mag je in Settings uit het menu kiezen?
 * - `slotsVoorAgent`  — wat mag er werkelijk antwoorden, in welke volgorde?
 *
 * Geen I/O: de aanroeper levert de verbindingen en de verzamelde slots aan.
 */
import type { AxeAgent, AxeAgentId, DropdownScope } from '@/domain/agents/roster';
import { agentById } from '@/domain/agents/roster';
import { NOOIT_AXE_BREIN, type ProviderId } from '@/domain/providers';
import {
  chatModelKeuzes, workerKeuzes, paidApiKeuzes,
  type ChatModelKeuze,
} from '@/domain/chatModelKeuzes';
import { zonderAbonnement, type AgentEngine } from '@/domain/abonnementChat';
import { cascadeVoorAgent, HOOFD_AGENTS, abonnementVan, type MotorToewijzing } from '@/domain/agentMotoren';


/** In één zin, voor op het scherm. Engels: dit staat in de UI. */
export const SCOPE_TEKST: Record<DropdownScope, string> = {
  'fast-smart': 'Fast/smart chat models only — never a subscription, never Ollama.',
  subscription: 'One of the subscription CLIs, or your API keys.',
  'auto-route': 'Capable engines race by default, Ollama included; an optional pin overrides it.',
  'paid-api': 'Paid OpenAI/Anthropic keys only.',
};

/* ── Wat je mag kiezen ───────────────────────────────────────────────────── */

/**
 * De lijst voor het menu van deze agent.
 *
 * Een tier-1 manager kiest geen model maar een abonnement; die rij wordt
 * daarom door `agentMotoren.ts` bediend en geeft hier `null` terug. Zo blijft
 * het verschil zichtbaar in plaats van weggemoffeld in één lijsttype dat voor
 * geen van beide klopt.
 */
export function keuzesVoorAgent(
  agent: AxeAgent | AxeAgentId,
  verbindingen: Record<string, { key?: string }> | null | undefined,
  providers: readonly ProviderId[],
): ChatModelKeuze[] | null {
  const a = typeof agent === 'string' ? agentById(agent) : agent;
  switch (a.dropdownScope) {
    case 'fast-smart':
      return chatModelKeuzes(verbindingen, providers);
    case 'auto-route':
      return workerKeuzes(verbindingen, providers);
    case 'paid-api':
      return paidApiKeuzes(verbindingen, providers);
    case 'subscription':
      // De abonnementenrij; zie kiesbaar() in agentMotoren.ts.
      return null;
  }
}

/** Kiest deze agent een abonnement in plaats van een model? */
export function kiestAbonnement(agent: AxeAgent | AxeAgentId): boolean {
  const a = typeof agent === 'string' ? agentById(agent) : agent;
  return a.dropdownScope === 'subscription';
}

/* ── Wat er werkelijk antwoordt ──────────────────────────────────────────── */

export interface SlotAchtig {
  provider: string;
  model?: string;
  key?: string;
}

/**
 * De cascade van deze agent: uit alles wat er aan sleutels ligt, in volgorde,
 * wat zijn scope toestaat.
 *
 * `alleSlots` komt van de aanroeper (application/chat/slots.ts) en is al
 * geordend op voorkeur. Deze functie filtert en zet vooraan wat vooraan hoort;
 * hij verzint zelf geen volgorde en praat niet met localStorage.
 */
export function slotsVoorAgent<T extends SlotAchtig>(
  agent: AxeAgent | AxeAgentId,
  alleSlots: readonly T[],
  /** Alleen nodig voor tier 1: welk abonnement van wie is. */
  toewijzing?: MotorToewijzing,
): T[] {
  const a = typeof agent === 'string' ? agentById(agent) : agent;
  switch (a.dropdownScope) {
    case 'fast-smart':
      return alleSlots.filter((s) => !(NOOIT_AXE_BREIN as readonly string[]).includes(s.provider));

    case 'auto-route':
      // Ollama mag hier wél: voor een cron-tik of een task-check is een gratis
      // lokaal model precies goed genoeg. Een abonnement niet -- dat is van
      // een manager, en twee agents op één abonnement is het gevecht dat
      // agentMotoren.ts juist voorkomt.
      return zonderAbonnement(alleSlots);

    case 'paid-api':
      return alleSlots.filter((s) => s.provider === 'anthropic' || s.provider === 'openai');

    case 'subscription': {
      const abonnement = abonnementVoor(a.id, toewijzing);
      return cascadeVoorAgent(alleSlots, abonnement);
    }
  }
}

/**
 * Het abonnement van deze tier-1 manager, of null als hij op sleutels draait.
 * Zonder toewijzing (die komt uit opslag) ook null: dan is "sleutels" het
 * eerlijke antwoord, niet een geraden abonnement.
 */
function abonnementVoor(id: AxeAgentId, toewijzing?: MotorToewijzing): AgentEngine | null {
  if (!toewijzing) return null;
  const hoofd = HOOFD_AGENTS.find((h) => h === id);
  return hoofd ? abonnementVan(toewijzing, hoofd) : null;
}
