/**
 * Welke modellen AXE's eigen brein mag gebruiken, en hoe je ze noemt.
 *
 * ## De regel (Luka, 17 sep 2026 — CONFIRMED ARCHITECTURE, HANDOFF_AXE_AGENT_FORCE.md)
 *
 * AXE's dropdown (hier én in Settings' "Motoren per agent" rij 1 — zelfde
 * lijst, zelfde opgeslagen keuze) toont ALLEEN snelle/slimme chat-modellen.
 * Nooit een abonnement, nooit Ollama. De abonnementen (Claude Code, Codex,
 * Cursor) horen bij de zes tier-1 managers (zie domain/agentMotoren.ts) — die
 * draaien een CLI-sessie, geen los model-antwoord, en horen dus niet in DEZE
 * lijst thuis. Ollama hoort er niet in omdat een lokaal model dat er niet
 * staat (zie axe-core-local-model in memory) AXE stil "unavailable" maakt
 * terwijl er drie werkende sleutels naast liggen — precies de fout die deze
 * lijst moet voorkomen (zie de sectie hieronder).
 *
 * Dit was eerder anders: de lijst zette de abonnementsweg er willens en
 * wetens bij (ooit terecht, vóór de tier-indeling bestond), en
 * `providersMetSleutel` liet Ollama altijd meedoen "want die heeft geen
 * sleutel nodig". Beide waren de weg naar precies het gedrag dat commit
 * `4a01aa70` op providers.ts moest repareren: AXE viel terug op een dode
 * Ollama-default terwijl Groq/Cerebras/Anthropic gewoon klaarstonden. Die
 * fallback-cascade (providers.ts) mag breed zijn als vangnet zonder pin; DEZE
 * lijst is de bewuste keuze, en blijft smal.
 *
 * ## Waarom een provider zonder sleutel niet in de lijst staat
 *
 * Een keuze aanbieden die geen sleutel heeft, valt stil door de cascade heen
 * naar iets anders. Dan zegt het scherm het ene en antwoordt het andere -- en
 * dat is precies het soort fout dat je niet ziet omdat er gewoon een antwoord
 * komt.
 */

import type { ProviderId } from '@/domain/providers';
import { catalogPairs } from '@/domain/modelCatalog';

export interface ChatModelKeuze {
  provider: ProviderId;
  model: string;
  /** Wat er op de knop staat. Kort genoeg voor een chatbalk. */
  label: string;
  /** Eén regel eronder: waarom je deze zou kiezen. */
  toelichting: string;
}

/**
 * Providers die nooit AXE's eigen brein mogen zijn, ook niet met een sleutel:
 * de abonnementsweg (die is voor de tier-1 managers, geen model-antwoord) en
 * Ollama (lokaal, en de dode-default-valkuil hierboven). Alles daarbuiten met
 * een sleutel telt mee.
 */
const NOOIT_AXE_BREIN = new Set<string>(['abonnement', 'ollama']);

/** Welke providers een sleutel hebben en AXE's brein mogen zijn. */
export function providersMetSleutel(
  connecties: Record<string, { key?: string }> | null | undefined,
  alleProviders: readonly ProviderId[],
): ProviderId[] {
  const c = connecties ?? {};
  return alleProviders.filter(id => !NOOIT_AXE_BREIN.has(id) && !!c[id]?.key);
}

/** Een nette naam voor een model-id. */
export function modelLabel(_provider: ProviderId, model: string): string {
  return model;
}

export interface Verbinding {
  key?: string;
  model?: string;
  lastTest?: 'ok' | 'fail' | 'testing';
  lastTestAt?: string;
}

/** Hoe de chat zijn opgeslagen connecties leest (`axe_llm_connections`) — het
 *  scherm en de composer lezen dezelfde plek, zodat een sleutel die je net in
 *  Settings intypte meteen in beide pickers verschijnt. Ook `lastTest`, zodat
 *  Instellingen-panelen elders (Motoren per agent) kunnen tonen of een
 *  provider niet alleen een sleutel heeft maar ook echt antwoordde. */
export function leesVerbindingen(): Record<string, Verbinding> {
  try { return JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}'); }
  catch { return {}; }
}

/** De hele lijst van modellen die AXE's brein mag zijn. */
export function chatModelKeuzes(
  connecties: Record<string, { key?: string }> | null | undefined,
  alleProviders: readonly ProviderId[],
): ChatModelKeuze[] {
  return catalogPairs(providersMetSleutel(connecties, alleProviders)).map(p => ({
    provider: p.provider,
    model: p.model,
    label: p.model,
    toelichting: p.note,
  }));
}

/**
 * De lijst voor een tier-3 cross-app agent (AXE Intel, AXE Companion):
 * uitsluitend betaalde Anthropic/OpenAI-modellen — Luka's eigen regel is
 * "minstens gpt-4o-mini of vergelijkbaar, nooit minder". `MODEL_CATALOG.openai`
 * bevat toevallig al niets zwakkers dan gpt-4o-mini, dus filteren op merk is
 * genoeg; een toekomstig zwakker OpenAI-model in die catalogus zou deze regel
 * wél moeten uitsluiten en doet dat nu niet automatisch — zie modelCatalog.ts
 * als je daar ooit iets aan toevoegt.
 */
export function paidApiKeuzes(
  connecties: Record<string, { key?: string }> | null | undefined,
  alleProviders: readonly ProviderId[],
): ChatModelKeuze[] {
  return chatModelKeuzes(connecties, alleProviders)
    .filter(k => k.provider === 'anthropic' || k.provider === 'openai');
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
   model.

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
  claude: 'Anthropic — API',
  chatgpt: 'OpenAI — API',
  overig: 'Gemini, Grok, OpenRouter en de rest',
};

/** Onder welk merk een keuze valt. */
export function merkVan(keuze: ChatModelKeuze): Merk {
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

/** De keuzes binnen één merk. */
export function keuzesVanMerk(keuzes: ChatModelKeuze[], merk: Merk): ChatModelKeuze[] {
  return keuzes.filter(k => merkVan(k) === merk);
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
