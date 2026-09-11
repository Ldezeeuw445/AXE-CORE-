/**
 * Welke modellen de chat van AXE Core mag gebruiken, en hoe je ze noemt.
 *
 * ## Waarom dit niet gewoon catalogPairs is
 *
 * De modelcatalogus kent alleen providers die met een API-sleutel werken. De
 * abonnementsweg (Claude Code, Codex) staat daar niet in en hoort er ook niet
 * in: daar is "het model" de naam van een CLI, niet een model-id. Maar op het
 * scherm is het wél dezelfde keuze -- "waar denkt AXE mee" -- en dus hoort het
 * in dezelfde lijst.
 *
 * ## Waarom een provider zonder sleutel niet in de lijst staat
 *
 * Een keuze aanbieden die geen sleutel heeft, valt stil door de cascade heen
 * naar iets anders. Dan zegt het scherm het ene en antwoordt het andere -- en
 * dat is precies het soort fout dat je niet ziet omdat er gewoon een antwoord
 * komt. De abonnementsweg is de uitzondering: die hééft geen sleutel, dus die
 * kan er ook niet een missen.
 */

import type { ProviderId } from '@/domain/providers';
import { catalogPairs } from '@/domain/modelCatalog';
import { ABONNEMENT_PROVIDER, ABONNEMENT_MOTOREN } from '@/domain/abonnementChat';

export interface ChatModelKeuze {
  provider: ProviderId;
  model: string;
  /** Wat er op de knop staat. Kort genoeg voor een chatbalk. */
  label: string;
  /** Eén regel eronder: waarom je deze zou kiezen. */
  toelichting: string;
  /** True voor de abonnementsweg -- die kost je niets per token. */
  opAbonnement?: boolean;
}

/** Welke providers een sleutel hebben. Ollama telt mee: die heeft er geen nodig. */
export function providersMetSleutel(
  connecties: Record<string, { key?: string }> | null | undefined,
  alleProviders: readonly ProviderId[],
): ProviderId[] {
  const c = connecties ?? {};
  return alleProviders.filter(id => !!c[id]?.key || id === 'ollama');
}

/** Een nette naam voor een model-id. `claude-sonnet-5` leest niet als een naam. */
export function modelLabel(provider: ProviderId, model: string): string {
  if (provider === ABONNEMENT_PROVIDER) {
    return model === 'codex' ? 'ChatGPT (abonnement)'
      : model === 'claude' ? 'Claude (abonnement)'
      : `${model} (abonnement)`;
  }
  return model;
}

/**
 * De hele lijst, abonnement eerst.
 *
 * Eerst omdat het de enige weg is die niets per token kost -- en als er één
 * ding bovenaan hoort te staan bij een keuze die je vaak maakt, is het degene
 * die je niets kost.
 */
export function chatModelKeuzes(
  connecties: Record<string, { key?: string }> | null | undefined,
  alleProviders: readonly ProviderId[],
): ChatModelKeuze[] {
  const uit: ChatModelKeuze[] = ABONNEMENT_MOTOREN.map(motor => ({
    provider: ABONNEMENT_PROVIDER as ProviderId,
    model: motor,
    label: modelLabel(ABONNEMENT_PROVIDER as ProviderId, motor),
    toelichting: 'Via je abonnement, leest de repo mee, alleen-lezen',
    opAbonnement: true,
  }));

  for (const p of catalogPairs(providersMetSleutel(connecties, alleProviders))) {
    uit.push({
      provider: p.provider,
      model: p.model,
      label: p.model,
      toelichting: p.note,
    });
  }
  return uit;
}

/** Of deze keuze nu actief is. Provider én model, want hetzelfde model-id kan
 *  bij twee providers voorkomen (openrouter draagt er veel van anderen). */
export function isActief(
  keuze: ChatModelKeuze,
  huidig: { provider?: string | null; model?: string | null } | null | undefined,
): boolean {
  if (!huidig) return false;
  return huidig.provider === keuze.provider && (huidig.model || '') === keuze.model;
}
