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
 * ## Twee dingen die de documentatie niet zegt
 *
 * Gemeten met een echte vraag op 14 september 2026, preset `low`:
 *
 * 1. **Citaten staan in de TEKST, als `[web:1]` en `[web:13]`.** Niet als
 *    `url_citation`-annotaties -- daar kwamen er nul van, ook met "cite
 *    sources" in de vraag. De N is het `id` van een zoekresultaat, en die ids
 *    lopen vanaf 1. Zonder die koppeling ziet een model `[web:13]` staan en
 *    weet het niet welke URL dat is; dan is een citaat niets waard. Annotaties
 *    worden nog steeds gelezen, voor het geval Perplexity ze wél stuurt.
 *
 * 2. **`fetch_url_results` gebruikt het veld `contents`, niet `results`.** De
 *    API-referentie noemt alleen `results`. Wie dat leest mist stilletjes elke
 *    pagina die Perplexity zelf opende: geen fout, gewoon niets.
 *
 * Aangehaald eerst, want daar steunt een zin op.
 *
 * Puur, zodat de vorm zonder netwerk en zonder tegoed te testen is.
 */

export interface PerplexityBron {
  url: string;
  title: string;
  /** Aangehaald in de tekst, of alleen gevonden tijdens het zoeken. */
  aangehaald: boolean;
  /** Het nummer waarmee de tekst ernaar verwijst, als `[web:N]`. Alleen bij zoekresultaten. */
  id?: number;
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

const WEB_VERWIJZING = /\[web:(\d+)\]/g;

export function leesAgentAntwoord(antwoord: unknown): PerplexityOnderzoek {
  const root = isObj(antwoord) ? antwoord : {};
  const tekst: string[] = [];
  const bronnen = new Map<string, PerplexityBron>();

  const voegToe = (url: string, title: string, aangehaald: boolean, id?: number) => {
    if (!url) return;
    const bestaand = bronnen.get(url);
    if (bestaand) {
      // Een bron die ook aangehaald wordt blijft aangehaald, en houdt het
      // eerste nummer en de eerste titel die hij kreeg.
      bestaand.aangehaald ||= aangehaald;
      if (!bestaand.title && title) bestaand.title = title;
      if (bestaand.id === undefined && id !== undefined) bestaand.id = id;
      return;
    }
    bronnen.set(url, { url, title, aangehaald, ...(id !== undefined ? { id } : {}) });
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
    } else if (item.type === 'search_results') {
      for (const r of arr(item.results)) {
        if (!isObj(r)) continue;
        const id = typeof r.id === 'number' && Number.isInteger(r.id) ? r.id : undefined;
        voegToe(str(r.url), str(r.title), false, id);
      }
    } else if (item.type === 'fetch_url_results') {
      // `contents` in het echte antwoord; `results` alleen omdat de referentie
      // dat noemt, voor als het ooit gelijkgetrokken wordt.
      for (const r of [...arr(item.contents), ...arr(item.results)]) {
        if (isObj(r)) voegToe(str(r.url), str(r.title), false);
      }
    }
  }

  const answer = tekst.join('\n\n').trim();

  // De verwijzingen in de tekst maken een zoekresultaat "aangehaald".
  const aangehaaldeIds = new Set([...answer.matchAll(WEB_VERWIJZING)].map(m => Number(m[1])));
  for (const b of bronnen.values()) {
    if (b.id !== undefined && aangehaaldeIds.has(b.id)) b.aangehaald = true;
  }

  const cost = isObj(root.usage) && isObj(root.usage.cost) ? Number(root.usage.cost.total_cost) : 0;
  const volgorde = [...bronnen.values()];

  return {
    answer,
    // Aangehaald eerst; binnen elke groep de volgorde waarin ze voorkwamen.
    sources: volgorde.sort((a, b) => Number(b.aangehaald) - Number(a.aangehaald)),
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

/**
 * Of de server-sleutel er is, gelezen uit een statusantwoord.
 *
 * Instellingen mag dit niet als chat-completion testen: dat brandt quota
 * en faalt op een goede sleutel. GET /research/perplexity geeft
 * `{ configured }` zonder Perplexity aan te roepen. Zolang de VPS die GET
 * nog niet kent (405), is POST zonder vraag hetzelfde bewijs: 400 Missing
 * question komt ná de sleutelcheck, 503 ervoor.
 */
export function leesPerplexityStand(status: number, detail: string, body?: unknown): { ok: boolean; error?: string } {
  if (status === 200 && body && typeof body === 'object' && body !== null && 'configured' in body) {
    return (body as { configured: unknown }).configured === true
      ? { ok: true }
      : { ok: false, error: 'Perplexity not configured (set PERPLEXITY_API_KEY on the server).' };
  }
  if (status === 405) return { ok: false, error: 'GET-niet-ondersteund' };
  if (status === 400 && /missing question/i.test(detail)) return { ok: true };
  if (status === 503 && /not configured/i.test(detail)) {
    return { ok: false, error: detail };
  }
  if (status === 404) {
    return { ok: false, error: 'Perplexity research is not set up on the server yet.' };
  }
  return { ok: false, error: detail || `HTTP ${status}` };
}

export function leesPerplexityFout(status: number, detail: string, retryAfter?: string | null): PerplexityFout {
  const bericht = detail || `HTTP ${status}`;
  if (status === 503 && /not configured/i.test(detail)) return { reden: 'niet-ingesteld', status, bericht };
  // Een 404 op deze route betekent dat de VPS hem nog niet kent: de app is
  // gebouwd voordat de backend gedeployd is. Dat is "nog niet ingesteld", niet
  // een mislukte vraag -- en zo gelezen zegt AXE het eerlijk in plaats van
  // "Perplexity failed (404)", wat naar Perplexity wijst in plaats van naar de VPS.
  if (status === 404) return { reden: 'niet-ingesteld', status, bericht: 'Research route not deployed on the server yet' };
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
      return 'Perplexity research is not set up on the server yet (the route is not deployed or PERPLEXITY_API_KEY is missing). Say so; do not answer as if it searched.';
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
    // Met het nummer erbij, zodat een model `[web:13]` in de tekst aan een URL
    // kan koppelen. Zonder dat nummer is het citaat niet te volgen.
    for (const b of bronnen) regels.push(`- ${b.id !== undefined ? `[web:${b.id}] ` : ''}${b.title || b.url} — ${b.url}`);
  }
  return regels.join('\n');
}
