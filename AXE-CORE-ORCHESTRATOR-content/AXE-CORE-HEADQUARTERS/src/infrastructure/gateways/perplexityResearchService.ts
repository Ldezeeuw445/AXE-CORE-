/**
 * Onderzoek met actuele bronnen via Perplexity -- altijd via de VPS.
 *
 * ## Waarom niet via `call()` in axeCoreApiService
 *
 * Die helper gooit bij een fout alleen een tekst weg ("AXE API 429: ...") en
 * laat de `Retry-After`-header vallen. Precies die header stuurt Perplexity mee
 * als een model overbelast is, en precies dat onderscheid -- even wachten versus
 * budget op versus sleutel kapot -- is wat hier niet verloren mag gaan. Dus
 * dezelfde basis-URL en dezelfde auth-headers, maar met het hele antwoord in de
 * hand.
 *
 * ## Waarom nooit direct naar api.perplexity.ai
 *
 * De sleutel staat op de VPS en niet in de app (AGENTS.md val 5, SLEUTELS.md
 * plek 4). En het dagbudget staat daar ook: een directe aanroep zou dat budget
 * omzeilen, en deze API wordt per vraag afgerekend.
 */
import { axeCoreApiExtraHeaders, axeCoreApiUrl } from '@/infrastructure/config/apiUrl';
import {
  leesAgentAntwoord,
  leesPerplexityBudget,
  leesPerplexityFout,
  leesPerplexityStand,
  type PerplexityBudget,
  type PerplexityFout,
  type PerplexityOnderzoek,
} from '@/domain/perplexityAgent';

/** Alleen wat de server toelaat. xhigh en wide-research draaien finance_search,
 *  en dat dekt geen goud, forex of grondstoffen. */
export type PerplexityPreset = 'fast' | 'low' | 'medium' | 'high';

export type PerplexityUitkomst =
  | { ok: true; result: PerplexityOnderzoek }
  | ({ ok: false } & PerplexityFout);

const basis = () => axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore').replace(/\/$/, '');

export async function perplexityResearch(
  question: string,
  opts: { preset?: PerplexityPreset; instructions?: string } = {},
): Promise<PerplexityUitkomst> {
  const vraag = question.trim();
  if (!vraag) return { ok: false, reden: 'fout', status: 400, bericht: 'Empty question' };

  let res: Response;
  try {
    res = await fetch(`${basis()}/research/perplexity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...axeCoreApiExtraHeaders() },
      body: JSON.stringify({
        question: vraag,
        ...(opts.preset ? { preset: opts.preset } : {}),
        ...(opts.instructions ? { instructions: opts.instructions } : {}),
      }),
    });
  } catch (e) {
    return { ok: false, reden: 'fout', status: 0, bericht: e instanceof Error ? e.message : 'AXE API unreachable' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: unknown };
    const detail = typeof body.detail === 'string' ? body.detail : res.statusText;
    return { ok: false, ...leesPerplexityFout(res.status, detail, res.headers.get('Retry-After')) };
  }

  return { ok: true, result: leesAgentAntwoord(await res.json()) };
}

/**
 * Of de VPS een Perplexity-sleutel heeft, zonder een betaalde vraag te stellen.
 *
 * GET is de nette weg. Zolang de VPS die nog niet kent (405), is POST zonder
 * vraag hetzelfde bewijs: 400 Missing question komt ná de sleutelcheck.
 */
export async function testPerplexityOpServer(): Promise<{ ok: boolean; error?: string }> {
  const url = `${basis()}/research/perplexity`;
  const headers = { 'Content-Type': 'application/json', ...axeCoreApiExtraHeaders() };
  try {
    const get = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(10_000) });
    if (get.status !== 405) {
      const body = await get.json().catch(() => ({}));
      const detail = typeof (body as { detail?: unknown }).detail === 'string'
        ? (body as { detail: string }).detail
        : get.statusText;
      return leesPerplexityStand(get.status, detail, body);
    }
    const post = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: '' }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await post.json().catch(() => ({}));
    const detail = typeof (body as { detail?: unknown }).detail === 'string'
      ? (body as { detail: string }).detail
      : post.statusText;
    return leesPerplexityStand(post.status, detail, body);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'AXE API unreachable' };
  }
}

/**
 * Het gedeelde dagbudget zelf (dollars/vragen, gebruikt en over), niet alleen of de sleutel er is.
 *
 * Gebruikt door de NorthSea Desk om te laten zien hoeveel van het $3/dag-plafond de governed
 * discovery/research-poort vandaag al heeft opgemaakt -- hetzelfde budget als deze functie hierboven,
 * want beide gaan over dezelfde VPS-route.
 */
export async function perplexityBudgetStand(): Promise<{ ok: true; budget: PerplexityBudget } | { ok: false; error: string }> {
  const url = `${basis()}/research/perplexity`;
  try {
    const res = await fetch(url, { method: 'GET', headers: axeCoreApiExtraHeaders(), signal: AbortSignal.timeout(10_000) });
    const body = await res.json().catch(() => ({}));
    return leesPerplexityBudget(res.status, body);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'AXE API unreachable' };
  }
}
