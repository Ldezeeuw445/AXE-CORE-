/**
 * The reason a proxied provider call failed, out of whatever shape it arrived in.
 *
 * ## Why this exists
 *
 * The VPS proxy is FastAPI, and FastAPI reports errors as `{"detail": "..."}`.
 * Both gateways read `e.error` and fell back to `Proxy HTTP <status>` when it
 * was absent — which is always, for every failure the proxy itself raises. So
 * the one field carrying the answer was the one field nobody read.
 *
 * Measured 2026-08-27 against /proxy/ai with a deliberately wrong key:
 *
 *     {"detail":"Invalid token (request id: 2026...)"}
 *
 * and the app showed "Proxy HTTP 502". That message says a proxy returned a
 * status; it does not say the upstream rejected the credential, which is a
 * different problem with a different fix. Two rounds of this conversation went
 * into base URLs and doubled paths — both of which were real bugs, and neither
 * of which was what the server had been saying all along.
 *
 * ## Shapes it has to handle
 *
 * `detail` — FastAPI's HTTPException, which is every error the proxy raises.
 * `error` as a string — the shape the code already expected.
 * `error.message` — OpenAI-compatible upstreams nest it, and some proxies pass
 * the body straight through.
 * `message` — plainer variants of the same.
 *
 * Anything else falls back to naming the status, because an unhelpful message
 * is still better than an empty one.
 */

export function proxyErrorMessage(body: unknown, status: number): string {
  const fallback = `Proxy HTTP ${status}`;
  if (!body || typeof body !== 'object') return fallback;

  const b = body as Record<string, unknown>;

  // FastAPI. Its detail can also be a list of validation objects, which is not
  // a sentence and should not be shown as one.
  if (typeof b.detail === 'string' && b.detail.trim()) return b.detail.trim();

  if (typeof b.error === 'string' && b.error.trim()) return b.error.trim();

  if (b.error && typeof b.error === 'object') {
    const m = (b.error as Record<string, unknown>).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }

  if (typeof b.message === 'string' && b.message.trim()) return b.message.trim();

  return fallback;
}
