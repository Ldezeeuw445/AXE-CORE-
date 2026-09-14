/**
 * Een antwoord van de Perplexity Agent API lezen: de tekst, de bronnen, de kosten.
 *
 * ## Waarom dit een eigen functie is
 *
 * De SDK's hebben `response.output_text`, en de quickstart gebruikt dat. Maar
 * AXE praat via de VPS met de REST-route, en daar bestaat dat veld niet: het is
 * een gemak dat de SDK zelf samenstelt. De tekst staat verspreid over
 * `output[]` -- in items van type `message`, in hun `content[]`, als blokken van
 * type `output_text`. Wie `output_text` leest krijgt een lege string terug op
 * een antwoord dat gewoon gelukt is, en dat lijkt dan op "Perplexity wist het
 * niet".
 *
 * Bronnen staan op twee plekken: als `url_citation` in de tekstblokken (wat het
 * antwoord echt aanhaalt) en als `search_results` / `fetch_url_results` (wat er
 * gezocht is). Aangehaald eerst, want dat is waar een zin op steunt.
 *
 * Puur, zodat de vorm zonder netwerk en zonder tegoed te testen is.
 */

export interface PerplexityBron {
  url: string;
  title: string;
  /** Aangehaald in de tekst, of alleen gevonden tijdens het zoeken. */
  aangehaald: boolean;
}

export interface PerplexityOnderzoek {
  answer: string;
  sources: PerplexityBron[];
  /** Wat Perplexity zelf voor deze vraag rekende, in dollars. 0 als het ontbreekt. */
  costUsd: number;
  model: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function leesAgentAntwoord(antwoord: unknown): PerplexityOnderzoek {
  const root = isObj(antwoord) ? antwoord : {};
  const tekst: string[] = [];
  const bronnen = new Map<string, PerplexityBron>();

  const voegToe = (url: string, title: string, aangehaald: boolean) => {
    if (!url) return;
    const bestaand = bronnen.get(url);
    if (bestaand) {
      // Een bron die ook aangehaald wordt blijft aangehaald, en krijgt een
      // titel als hij die eerst niet had.
      bestaand.aangehaald ||= aangehaald;
      if (!bestaand.title && title) bestaand.title = title;
      return;
    }
    bronnen.set(url, { url, title, aangehaald });
  };

  for (const item of arr(root.output)) {
    if (!isObj(item)) continue;
    if (item.type === 'message') {
      for (const blok of arr(item.content)) {
        if (!isObj(blok) || blok.type !== 'output_text') continue;
        const t = str(blok.text);
        if (t) tekst.push(t);
        for (const a of arr(blok.annotations)) {
          if (isObj(a) && a.type === 'url_citation') voegToe(str(a.url), str(a.title), true);
        }
      }
    } else if (item.type === 'search_results' || item.type === 'fetch_url_results') {
      for (const r of arr(item.results)) {
        if (isObj(r)) voegToe(str(r.url), str(r.title), false);
      }
    }
  }

  const cost = isObj(root.usage) && isObj(root.usage.cost) ? Number(root.usage.cost.total_cost) : 0;

  return {
    answer: tekst.join('\n\n').trim(),
    // Aangehaald eerst; binnen elke groep de volgorde waarin ze voorkwamen.
    sources: [...bronnen.values()].sort((a, b) => Number(b.aangehaald) - Number(a.aangehaald)),
    costUsd: Number.isFinite(cost) && cost > 0 ? cost : 0,
    model: str(root.model),
  };
}

/**
 * Waarom een vraag niet doorging, in woorden die naar de juiste oplossing wijzen.
 *
 * Elke reden heeft een andere remedie, en dat is waarom ze niet op één hoop
 * "Perplexity failed" mogen: het eigen dagbudget komt om middernacht UTC terug,
 * op Perplexity-tegoed moet je zelf bijladen, overbelasting gaat na een paar
 * seconden vanzelf over, en een geweigerde sleutel moet geroteerd worden.
 */
export type PerplexityReden =
  | 'niet-ingesteld'
  | 'dagbudget-op'
  | 'tegoed-op'
  | 'overbelast'
  | 'sleutel-geweigerd'
  | 'fout';

export interface PerplexityFout {
  reden: PerplexityReden;
  status: number;
  bericht: string;
  retryAfterSec?: number;
}

export function leesPerplexityFout(status: number, detail: string, retryAfter?: string | null): PerplexityFout {
  const bericht = detail || `HTTP ${status}`;
  if (status === 503 && /not configured/i.test(detail)) return { reden: 'niet-ingesteld', status, bericht };
  // Twee soorten 402 met een andere oplossing. Het eigen budget van de server
  // zegt dat letterlijk (zie perplexity_agent.py); elke andere 402 komt van
  // Perplexity zelf en gaat over tegoed.
  if (status === 402) {
    return /daily perplexity budget/i.test(detail)
      ? { reden: 'dagbudget-op', status, bericht }
      : { reden: 'tegoed-op', status, bericht };
  }
  if (status === 429) {
    const sec = retryAfter != null && /^\s*\d+\s*$/.test(retryAfter) ? Number(retryAfter) : undefined;
    return { reden: 'overbelast', status, bericht, ...(sec !== undefined ? { retryAfterSec: sec } : {}) };
  }
  if (status === 502 && /rejected the server key/i.test(detail)) return { reden: 'sleutel-geweigerd', status, bericht };
  return { reden: 'fout', status, bericht };
}

/** Een fout als zin voor een model, zodat het de echte reden meldt en niet gokt. */
export function formatteerFout(f: PerplexityFout): string {
  switch (f.reden) {
    case 'niet-ingesteld':
      return 'Perplexity research is not set up on the server yet (no PERPLEXITY_API_KEY). Say so; do not answer as if it searched.';
    case 'dagbudget-op':
      return "Perplexity research is paused: today's spending limit is reached (resets 00:00 UTC). This is a budget stop, not an empty result — say so.";
    case 'tegoed-op':
      return 'Perplexity research failed: the Perplexity API credit is used up. Luka needs to top it up in the console. Say so.';
    case 'overbelast':
      return `Perplexity is temporarily overloaded${f.retryAfterSec !== undefined ? ` (retry after ${f.retryAfterSec}s)` : ''}. Say so rather than guessing.`;
    case 'sleutel-geweigerd':
      return 'Perplexity rejected the server key — it must be rotated in the Perplexity console. Say so.';
    default:
      return `Perplexity research failed (${f.status}): ${f.bericht}. Report this rather than answering as if it had searched.`;
  }
}

/** Het antwoord plus bronnen als tekst voor een model dat het verder gebruikt. */
export function formatteerOnderzoek(o: PerplexityOnderzoek, vraag: string, maxBronnen = 6): string {
  if (!o.answer) return `Perplexity returned no answer for "${vraag}".`;
  const regels = [`## Perplexity research: ${vraag}`, '', o.answer];
  const bronnen = o.sources.slice(0, maxBronnen);
  if (bronnen.length) {
    regels.push('', 'Sources:');
    for (const b of bronnen) regels.push(`- ${b.title || b.url} — ${b.url}`);
  }
  return regels.join('\n');
}
