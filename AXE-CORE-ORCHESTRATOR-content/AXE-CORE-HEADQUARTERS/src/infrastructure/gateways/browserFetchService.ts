/**
 * browserFetchService.ts
 * Server-side URL fetching — no CORS, no iframe limits.
 *
 * Priority:
 *  1. Local api-server /api/browse (Replit dev)
 *  2. VPS axecompanion.com/browse (production / Vercel)
 *  3. Direct browser fetch (CORS-permitting fallback)
 */

export interface BrowseResult {
  url: string;
  title: string;
  description: string;
  text: string;   // readable text, up to 10 000 chars
  links: string[];
  error?: string;
}

/** Truncate result text so it fits in a prompt context window */
const MAX_TEXT = 6_000;

export async function browseFetch(url: string): Promise<BrowseResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { url, title: '', description: '', text: '', links: [], error: 'Invalid URL' };
  }

  // ── 1. Local api-server (Replit dev) ─────────────────────────────────────
  try {
    const res = await fetch(`/api/browse?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = await res.json() as BrowseResult;
      return { ...data, text: (data.text ?? '').slice(0, MAX_TEXT) };
    }
  } catch { /* fall through */ }

  // ── 2. VPS proxy (production / Vercel) ───────────────────────────────────
  try {
    const BASE = (import.meta.env.VITE_AXE_CORE_API_URL ?? '').replace(/\/$/, '');
    const KEY  = import.meta.env.VITE_AXE_CORE_API_KEY ?? '';
    if (BASE && KEY) {
      const res = await fetch(`${BASE}/browse?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${KEY}` },
        signal: AbortSignal.timeout(18_000),
      });
      if (res.ok) {
        const data = await res.json() as BrowseResult;
        return { ...data, text: (data.text ?? '').slice(0, MAX_TEXT) };
      }
    }
  } catch { /* fall through */ }

  // ── 3. Direct browser fetch (last resort, CORS-dependent) ────────────────
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'text/html,*/*;q=0.8' },
    });
    if (res.ok) {
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch?.[1]?.trim() ?? new URL(url).hostname;
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TEXT);
      return { url, title, description: '', text, links: [] };
    }
  } catch { /* fall through */ }

  return { url, title: url, description: '', text: '', links: [], error: 'Could not fetch URL — all methods failed' };
}

/** Format a browse result for injection into the LLM system prompt */
export function formatBrowseResult(result: BrowseResult, requestedUrl: string): string {
  if (result.error && !result.text) {
    return `## 🌐 URL Fetch Failed\nURL: ${requestedUrl}\nReason: ${result.error}`;
  }
  const lines = [
    `## 🌐 URL Content: ${result.title || requestedUrl}`,
    `URL: ${result.url}`,
  ];
  if (result.description) lines.push(`Summary: ${result.description}`);
  if (result.text) lines.push(`\nContent:\n${result.text}`);
  return lines.join('\n');
}
