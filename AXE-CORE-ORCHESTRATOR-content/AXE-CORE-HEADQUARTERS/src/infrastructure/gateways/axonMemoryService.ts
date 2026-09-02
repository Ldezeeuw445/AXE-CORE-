/**
 * AXE Core writing into AXON Memory, so the desk's conclusions are available
 * to every other AI Luka uses.
 *
 * ## What AXON is, and what it is not
 *
 * AXON is a separate product with its own Supabase project
 * (`ktaditgtbubonrahyiig`) and its own customers — deliberately not the shared
 * database the other three apps live in. It stores only what an assistant
 * chooses to save; there is no conversation capture. So this writes
 * deliberately, and rarely.
 *
 * ## Not through mcp.axon-memory.com
 *
 * That host is a Cloudflare Worker that routes exactly five paths: the MCP root
 * and the OAuth well-knowns. `remember` and `context-pack` are not among them
 * and answer 404 there. The REST path goes straight to the functions host,
 * which is what the endpoints' own headers say they are for: "Plain REST write
 * path (Bearer <axon token>)".
 *
 * ## Two accounts
 *
 * Luka keeps a personal AXON account and one for the business. Which one this
 * feeds is decided entirely by which key is pasted in — there is nothing to
 * choose here, and nothing that could pick wrong on its own. That is the reason
 * for a key rather than the OAuth flow the MCP connector uses.
 */

const AXON_FUNCTIONS = 'https://ktaditgtbubonrahyiig.supabase.co/functions/v1';

/**
 * Who is writing, in AXON's own vocabulary.
 *
 * AXON draws a terrain per source, and the key it groups by is this label
 * slugified — "AXE Core" becomes `axe-core`, which is the column AXE Core gets
 * its own place under. Sent on every write rather than offered as an option,
 * because it is the app's identity and not a per-call decision; a memory that
 * arrives anonymous is filed as "manual" along with everything else that said
 * nothing, and there is no way to tell them apart afterwards.
 *
 * Measured 2026-08-27 against the AXON source: `remember` currently derives
 * the label from the API KEY's name (`resolved.clientLabel ?? "API"`) and does
 * not read this field. Sending it is harmless today and correct the moment
 * that changes; until then the same result comes from naming the developer key
 * "AXE Core" in AXON.
 */
const SOURCE_LABEL = 'AXE Core';

export interface AxonResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Keys are `axon_live_…`. Anything else is a paste error worth catching early. */
export function looksLikeAxonKey(key: string): boolean {
  return /^axon_(live|test)_[A-Za-z0-9_-]{8,}$/.test(key.trim());
}

/**
 * What a thrown fetch actually means, in the reader's terms.
 *
 * WebKit says "Load failed" for every request the page was not allowed to
 * make, which is indistinguishable from a bad key if you only read the card.
 * It cost a round of "but the key is right" on the very first connect: AXON's
 * functions answer `access-control-allow-origin: https://app.axon-memory.com`
 * and nothing else, so the browser discards the reply before this code sees
 * it — with a valid key, byte for byte the same failure.
 *
 * Naming it is the whole fix available on this side. The other side of it is
 * one header in AXON, and a developer key exists precisely for callers that
 * have no web origin at all.
 */
function describeFetchFailure(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  if (e instanceof Error && e.name === 'TimeoutError') {
    return 'AXON did not answer within 20s.';
  }
  if (/load failed|failed to fetch|networkerror/i.test(msg)) {
    return 'Blocked before it left the app (CORS) — AXON only allows app.axon-memory.com. Not a key problem.';
  }
  return msg || 'AXON unreachable';
}

async function call<T>(
  path: string,
  key: string,
  init: RequestInit = {},
): Promise<AxonResult<T>> {
  const token = key.trim();
  if (!token) return { ok: false, error: 'No AXON key set.' };
  try {
    const res = await fetch(`${AXON_FUNCTIONS}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) {
      // AXON answers with its own message where it has one; a bare status is
      // the fallback, and saying which is which saves guessing at a dead key.
      let detail = `HTTP ${res.status}`;
      try {
        const body = JSON.parse(text) as { error?: string; message?: string };
        detail = body.error ?? body.message ?? detail;
      } catch { /* not JSON */ }
      return { ok: false, error: detail };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: true, data: text as unknown as T };
    }
  } catch (e) {
    return { ok: false, error: describeFetchFailure(e) };
  }
}

/**
 * Save one memory.
 *
 * `content` is the whole point and the only required field. Title and tags make
 * it findable later; leaving them off is allowed because a memory with no title
 * still beats a memory that was never written.
 */
export async function axonRemember(input: {
  key: string;
  content: string;
  title?: string;
  tags?: string[];
}): Promise<AxonResult<{ id?: string }>> {
  const content = input.content.trim();
  if (!content) return { ok: false, error: 'Nothing to remember.' };
  return call<{ id?: string }>('/remember', input.key, {
    method: 'POST',
    body: JSON.stringify({
      content,
      source_label: SOURCE_LABEL,
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(input.tags?.length ? { tags: input.tags.filter(t => t.trim()) } : {}),
    }),
  });
}

/**
 * Pull back what AXON knows that is relevant to a question.
 *
 * The token budget is AXON's own idea and a good one: it returns a pack sized
 * to fit a prompt rather than everything matching, so the caller does not have
 * to decide what to truncate.
 */
export async function axonContextPack(input: {
  key: string;
  query?: string;
  limitTokens?: number;
}): Promise<AxonResult<unknown>> {
  const qs = new URLSearchParams();
  if (input.query?.trim()) qs.set('query', input.query.trim());
  qs.set('limit_tokens', String(input.limitTokens ?? 1500));
  return call(`/context-pack?${qs.toString()}`, input.key, { method: 'GET' });
}

/** Cheapest call that proves the key is accepted. */
export async function axonTestKey(key: string): Promise<AxonResult<unknown>> {
  if (!looksLikeAxonKey(key)) {
    return { ok: false, error: 'That does not look like an AXON key (expected axon_live_…).' };
  }
  return axonContextPack({ key, limitTokens: 1 });
}
