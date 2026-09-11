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


/* ══════════════════════════════════════════════════════════════════════════
   Merken — eerst WIE, dan WELK model
   ══════════════════════════════════════════════════════════════════════════

   Eén platte lijst van twintig regels is een zoekopdracht, geen keuze. In de
   praktijk denk je "even Claude" of "even ChatGPT", en pas daarna aan welk
   model. Het Code Agent-paneel doet het al zo; dit trekt de chat gelijk.

   'native' is geen provider maar de afwezigheid van een keuze: de cascade van
   de app beslist dan zelf, op basis van wat je vraagt. Dat was altijd al het
   gedrag zonder primair slot -- het had alleen geen naam en geen knop. */

export type Merk = 'native' | 'claude' | 'chatgpt' | 'overig';

export const MERK_LABEL: Record<Merk, string> = {
  native: 'AXE Native',
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  overig: 'Overig',
};

export const MERK_UITLEG: Record<Merk, string> = {
  native: 'AXE kiest zelf, op wat je vraagt',
  claude: 'Anthropic — abonnement of API',
  chatgpt: 'OpenAI — abonnement of API',
  overig: 'Gemini, Groq, Ollama en de rest',
};

/** Onder welk merk een keuze valt.
 *
 *  Op provider én model, want de abonnementsweg draagt beide merken: één
 *  provider ('abonnement') met 'claude' en 'codex' als modellen. */
export function merkVan(keuze: ChatModelKeuze): Merk {
  if (keuze.provider === ABONNEMENT_PROVIDER) {
    return keuze.model === 'codex' ? 'chatgpt' : 'claude';
  }
  if (keuze.provider === 'anthropic') return 'claude';
  if (keuze.provider === 'openai') return 'chatgpt';
  return 'overig';
}

/** De merken die iets te kiezen hebben, in vaste volgorde.
 *
 *  'native' staat er altijd bij -- die heeft niets nodig. Een merk zonder
 *  bruikbare modellen wordt weggelaten in plaats van leeg getoond: een knop die
 *  niets oplevert is een knop die je één keer probeert en daarna wantrouwt. */
export function merkenMetKeuzes(keuzes: ChatModelKeuze[]): Merk[] {
  const aanwezig = new Set(keuzes.map(merkVan));
  return (['native', 'claude', 'chatgpt', 'overig'] as Merk[])
    .filter(m => m === 'native' || aanwezig.has(m));
}

/** De keuzes binnen één merk, abonnement eerst. */
export function keuzesVanMerk(keuzes: ChatModelKeuze[], merk: Merk): ChatModelKeuze[] {
  return keuzes
    .filter(k => merkVan(k) === merk)
    .sort((a, b) => Number(!!b.opAbonnement) - Number(!!a.opAbonnement));
}

/** Welk merk nu actief is. Zonder primair slot is dat 'native' -- dat IS de
 *  betekenis van geen keuze, en het hoort zo op het scherm te staan. */
export function actiefMerk(
  huidig: { provider?: string | null; model?: string | null } | null | undefined,
): Merk {
  if (!huidig?.provider) return 'native';
  return merkVan({
    provider: huidig.provider as ProviderId,
    model: huidig.model || '',
    label: '', toelichting: '',
  });
}
