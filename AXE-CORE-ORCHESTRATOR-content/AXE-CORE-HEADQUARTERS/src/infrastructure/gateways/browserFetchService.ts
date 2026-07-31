/**
 * browserFetchService.ts
 * Server-side URL fetching + lightweight intel extraction.
 *
 * Priority:
 *  1. Local api-server /api/browse (Replit dev)
 *  2. VPS axecompanion.com/browse (production / Vercel)
 *  3. Direct browser fetch (CORS-permitting fallback)
 */
import { apiUrl } from '@/infrastructure/config/apiUrl';

export interface BrowseIntel {
  scriptSrcs: string[];
  apiCandidates: string[];
  jsonLdTypes: string[];
  meta: Record<string, string>;
}

export interface BrowseResult {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
  intel?: BrowseIntel;
  error?: string;
}

const MAX_TEXT = 6_000;

function extractFromHtml(html: string, pageUrl: string): {
  title: string;
  description: string;
  text: string;
  links: string[];
  intel: BrowseIntel;
} {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? (() => {
    try { return new URL(pageUrl).hostname; } catch { return pageUrl; }
  })();

  const meta: Record<string, string> = {};
  const metaRe = /<meta\s+[^>]*(?:name|property)=["']([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = metaRe.exec(html)) !== null) {
    const key = mm[1].toLowerCase();
    if (['description', 'og:description', 'og:title', 'og:type', 'twitter:description', 'application-name'].includes(key)) {
      meta[key] = mm[2].slice(0, 300);
    }
  }
  // alternate attribute order
  const metaRe2 = /<meta\s+[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']([^"']+)["'][^>]*>/gi;
  while ((mm = metaRe2.exec(html)) !== null) {
    const key = mm[2].toLowerCase();
    if (!meta[key] && ['description', 'og:description', 'og:title', 'og:type'].includes(key)) {
      meta[key] = mm[1].slice(0, 300);
    }
  }

  const scriptSrcs: string[] = [];
  const scriptSrcRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((mm = scriptSrcRe.exec(html)) !== null) {
    if (scriptSrcs.length < 40) scriptSrcs.push(mm[1]);
  }

  const links: string[] = [];
  const hrefRe = /href=["'](https?:\/\/[^"'#\s]+)["']/gi;
  while ((mm = hrefRe.exec(html)) !== null) {
    if (links.length < 30 && !links.includes(mm[1])) links.push(mm[1]);
  }

  // API / data-source candidates from inline JS and attributes
  const apiCandidates = new Set<string>();
  const patterns = [
    /fetch\s*\(\s*["'`](https?:\/\/[^"'`\s]+)["'`]/gi,
    /axios\.[a-z]+\s*\(\s*["'`](https?:\/\/[^"'`\s]+)["'`]/gi,
    /["'`](https?:\/\/[^"'`\s]*\/api\/[^"'`\s]*)["'`]/gi,
    /["'`](https?:\/\/[^"'`\s]*graphql[^"'`\s]*)["'`]/gi,
    /["'`](https?:\/\/[^"'`\s]*\/v[0-9]+\/[^"'`\s]*)["'`]/gi,
    /websocket|wss?:\/\/[^"'\s]+/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(html)) !== null) {
      const hit = (m[1] || m[0] || '').trim();
      if (hit && hit.length < 240) apiCandidates.add(hit);
      if (apiCandidates.size >= 25) break;
    }
  }
  // Known analytics / data CDNs from script srcs
  for (const src of scriptSrcs) {
    if (/\b(api|graphql|supabase|firebase|segment|mixpanel|amplitude|stripe|sentry|datadog|posthog|hubspot|intercom)\b/i.test(src)) {
      apiCandidates.add(src);
    }
  }

  const jsonLdTypes: string[] = [];
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((mm = ldRe.exec(html)) !== null) {
    try {
      const obj = JSON.parse(mm[1].trim()) as { '@type'?: string | string[] };
      const t = obj['@type'];
      if (typeof t === 'string') jsonLdTypes.push(t);
      else if (Array.isArray(t)) jsonLdTypes.push(...t.map(String));
    } catch { /* ignore bad json-ld */ }
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);

  return {
    title,
    description: meta['description'] || meta['og:description'] || '',
    text,
    links,
    intel: {
      scriptSrcs: scriptSrcs.slice(0, 30),
      apiCandidates: Array.from(apiCandidates).slice(0, 25),
      jsonLdTypes: jsonLdTypes.slice(0, 12),
      meta,
    },
  };
}

export async function browseFetch(url: string): Promise<BrowseResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { url, title: '', description: '', text: '', links: [], error: 'Invalid URL' };
  }

  // Prefer endpoints that return raw-ish HTML so we can extract intel client-side too.
  // When proxy already returns structured text, still attempt intel if html is present.

  // ── 1. Local api-server ─────────────────────────────────────────────────
  try {
    const res = await fetch(apiUrl(`/api/browse?url=${encodeURIComponent(url)}`), {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = await res.json() as BrowseResult & { html?: string };
      if (data.html) {
        const extracted = extractFromHtml(data.html, url);
        return {
          url: data.url || url,
          title: data.title || extracted.title,
          description: data.description || extracted.description,
          text: (data.text || extracted.text).slice(0, MAX_TEXT),
          links: data.links?.length ? data.links : extracted.links,
          intel: extracted.intel,
        };
      }
      return { ...data, text: (data.text ?? '').slice(0, MAX_TEXT) };
    }
  } catch { /* fall through */ }

  // ── 2. VPS proxy ────────────────────────────────────────────────────────
  try {
    const BASE = apiUrl(import.meta.env.DEV ? '/proxy/axecore' : '/api/proxy/axecore');
    const res = await fetch(`${BASE}/browse?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(18_000),
    });
    if (res.ok) {
      const data = await res.json() as BrowseResult & { html?: string };
      if (data.html) {
        const extracted = extractFromHtml(data.html, url);
        return {
          url: data.url || url,
          title: data.title || extracted.title,
          description: data.description || extracted.description,
          text: (data.text || extracted.text).slice(0, MAX_TEXT),
          links: data.links?.length ? data.links : extracted.links,
          intel: extracted.intel,
        };
      }
      return { ...data, text: (data.text ?? '').slice(0, MAX_TEXT) };
    }
  } catch { /* fall through */ }

  // ── 3. Direct browser fetch ─────────────────────────────────────────────
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'text/html,*/*;q=0.8' },
    });
    if (res.ok) {
      const html = await res.text();
      const extracted = extractFromHtml(html, url);
      return {
        url,
        title: extracted.title,
        description: extracted.description,
        text: extracted.text,
        links: extracted.links,
        intel: extracted.intel,
      };
    }
  } catch { /* fall through */ }

  return { url, title: url, description: '', text: '', links: [], error: 'Could not fetch URL — all methods failed' };
}

/** Format a browse result for injection into the LLM prompt */
export function formatBrowseResult(result: BrowseResult, requestedUrl: string): string {
  if (result.error && !result.text) {
    return `## 🌐 URL Fetch Failed\nURL: ${requestedUrl}\nReason: ${result.error}`;
  }
  const lines = [
    `## 🌐 URL Content: ${result.title || requestedUrl}`,
    `URL: ${result.url}`,
  ];
  if (result.description) lines.push(`Summary: ${result.description}`);
  if (result.intel) {
    const { apiCandidates, scriptSrcs, jsonLdTypes, meta } = result.intel;
    if (apiCandidates.length) {
      lines.push(`\n### Detected API / data endpoints`);
      for (const a of apiCandidates.slice(0, 15)) lines.push(`- ${a}`);
    }
    if (scriptSrcs.length) {
      lines.push(`\n### Script sources (${scriptSrcs.length})`);
      for (const s of scriptSrcs.slice(0, 12)) lines.push(`- ${s}`);
    }
    if (jsonLdTypes.length) lines.push(`\nJSON-LD types: ${jsonLdTypes.join(', ')}`);
    const og = meta['og:type'] || meta['application-name'];
    if (og) lines.push(`Page type signals: ${og}`);
  }
  if (result.links?.length) {
    lines.push(`\n### Notable links (${result.links.length})`);
    for (const l of result.links.slice(0, 10)) lines.push(`- ${l}`);
  }
  if (result.text) lines.push(`\n### Readable content\n${result.text}`);
  lines.push(`\n_Use the detected endpoints + content above for intel. Prefer citing real URLs found on the page over inventing APIs._`);
  return lines.join('\n');
}
