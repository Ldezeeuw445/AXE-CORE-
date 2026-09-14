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
  leesPerplexityFout,
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
