/**
 * tavilyService.ts
 * ─────────────────────────────────────────────────────────────────────
 * Real-time web search via Tavily AI Search API.
 * Free tier: 1 000 searches / month — plenty for daily AXE usage.
 *
 * API docs: https://docs.tavily.com/docs/rest-api/api-reference
 * ─────────────────────────────────────────────────────────────────────
 */

const TAVILY_KEY = import.meta.env.VITE_TAVILY_API_KEY as string | undefined;
const TAVILY_BASE = 'https://api.tavily.com';

export interface TavilyResult {
  title: string;
  url: string;
  /** Short snippet of the page content (150-400 chars) */
  content: string;
  /** Relevance score 0-1 */
  score: number;
  published_date?: string;
}

export interface TavilySearchOptions {
  maxResults?: number;
  /** 'basic' (faster, free) or 'advanced' (deeper, uses more quota) */
  depth?: 'basic' | 'advanced';
  /** Include a short AI-generated answer summary above the results */
  includeAnswer?: boolean;
  /** Include raw page content (longer, uses more tokens) */
  includeRawContent?: boolean;
}

/**
 * Search the live web via Tavily.
 * Returns an empty array on any error so callers don't need try/catch.
 */
/**
 * A search that could not run, as distinct from a search that found nothing.
 *
 * `status` is the HTTP code where there was one: 432 means the plan's usage
 * limit is spent, 401 a bad key, 0 a network failure.
 */
export class TavilyError extends Error {
  // Written out rather than a parameter property: tsconfig has
  // erasableSyntaxOnly, which forbids the shorthand.
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'TavilyError';
    this.status = status;
  }
}

export async function tavilySearch(
  query: string,
  {
    maxResults = 5,
    depth = 'basic',
    includeAnswer = false,
    includeRawContent = false,
  }: TavilySearchOptions = {}
): Promise<TavilyResult[]> {
  if (!TAVILY_KEY || !query.trim()) return [];

  try {
    const resp = await fetch(`${TAVILY_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query: query.slice(0, 400),
        max_results: maxResults,
        search_depth: depth,
        include_answer: includeAnswer,
        include_raw_content: includeRawContent,
      }),
      signal: AbortSignal.timeout(9_000),
    });

    if (!resp.ok) {
      // Why, not just "nothing found".
      //
      // This used to return [] for every failure, so a 432 (plan limit
      // reached) reached the model as "no search results" — and the model
      // then told Luka it could not find the bitcoin price, when the real
      // answer was that the Tavily quota was spent. An empty result and a
      // refused request are different facts and must not look alike.
      let detail = '';
      try {
        const body = await resp.json() as { detail?: { error?: string } | string };
        detail = typeof body.detail === 'string' ? body.detail : (body.detail?.error ?? '');
      } catch { /* body was not JSON */ }
      console.warn(`[Tavily] HTTP ${resp.status}${detail ? ` — ${detail}` : ''}`);
      throw new TavilyError(resp.status, detail || `HTTP ${resp.status}`);
    }

    const data = await resp.json() as {
      results?: TavilyResult[];
      answer?: string;
    };

    return (data.results ?? []).slice(0, maxResults);
  } catch (err) {
    if (err instanceof TavilyError) throw err;
    // A network/abort failure is also not "nothing found".
    console.warn('[Tavily] search failed:', err);
    throw new TavilyError(0, err instanceof Error ? err.message : String(err));
  }
}

/** True when a Tavily API key is present. */
export function tavilyConfigured(): boolean {
  return !!TAVILY_KEY;
}

/** Real connectivity test for the Settings card — a real tiny search, not
 *  just a key-presence check. */
export async function testTavilyKey(key?: string): Promise<{ ok: boolean; error?: string }> {
  const k = key?.trim() || TAVILY_KEY;
  if (!k) return { ok: false, error: 'Geen key ingesteld' };
  try {
    const res = await fetch(`${TAVILY_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: k, query: 'axe core connectivity test', max_results: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body?.detail ?? body?.error ?? `Tavily HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Tavily unreachable' };
  }
}

/**
 * Format Tavily results into a concise markdown block for LLM injection.
 * Keeps tokens low while giving the model enough to cite accurately.
 */
export function formatTavilyResults(
  results: TavilyResult[],
  query: string
): string {
  if (results.length === 0) return '';
  const lines = results.slice(0, 5).map(r => {
    const date = r.published_date ? ` (${r.published_date.slice(0, 10)})` : '';
    return `• **${r.title}**${date}\n  ${r.content.slice(0, 350)}\n  <${r.url}>`;
  });
  return `## Live Web Search — "${query.slice(0, 80)}"\n${lines.join('\n')}\n\nCite source URLs when using these results.`;
}
