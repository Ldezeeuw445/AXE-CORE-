/**
 * Vercel Edge Function — Full-page proxy for AXE Browser
 * GET /api/proxy?url=<encoded-url>
 *
 * Fetches any URL and returns it with:
 * - X-Frame-Options removed
 * - Content-Security-Policy modified to allow framing
 * - Links rewritten to go through proxy
 * - Base URL injected so relative links work
 */

export const config = { runtime: "edge" };

const BLOCKED_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "x-content-type-options",
];

function rewriteHtml(html: string, targetUrl: string): string {
  const url = new URL(targetUrl);
  const baseOrigin = url.origin;

  // Inject base tag and proxy script right after <head>
  const proxyScript = `
<script data-axe-proxy>
(function() {
  const PROXY_BASE = '/api/proxy?url=';
  const ORIGIN = '${baseOrigin}';
  
  // Rewrite all links to go through proxy
  document.addEventListener('click', function(e) {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    
    e.preventDefault();
    let proxyUrl;
    if (href.startsWith('http')) {
      proxyUrl = PROXY_BASE + encodeURIComponent(href);
    } else if (href.startsWith('//')) {
      proxyUrl = PROXY_BASE + encodeURIComponent('https:' + href);
    } else if (href.startsWith('/')) {
      proxyUrl = PROXY_BASE + encodeURIComponent(ORIGIN + href);
    } else {
      proxyUrl = PROXY_BASE + encodeURIComponent(ORIGIN + '/' + href);
    }
    window.location.href = proxyUrl;
  }, true);
  
  // Handle form submissions
  document.addEventListener('submit', function(e) {
    const form = e.target;
    if (!form.action) return;
    e.preventDefault();
    // Forms are tricky - open externally for now
    window.open(form.action, '_blank');
  }, true);
  
  // Rewrite existing links on load
  document.querySelectorAll('a[href]').forEach(function(a) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('/')) return;
    // Relative links are fine with base tag
  });
})();
</script>`;

  const baseTag = `<base href="${baseOrigin}/" target="_self">`;

  // Insert base tag and script after <head>
  html = html.replace(/<head([^>]*)>/i, `<head$1>\n${baseTag}\n${proxyScript}`);

  // If no <head>, try to insert at the beginning
  if (!html.includes(baseTag)) {
    html = baseTag + '\n' + proxyScript + '\n' + html;
  }

  return html;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return new Response(JSON.stringify({ error: "url parameter required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let targetUrl: string;
  try {
    targetUrl = new URL(target).toString();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
      },
      signal: AbortSignal.timeout(20_000),
    });

    const contentType = response.headers.get("content-type") || "";

    // Only rewrite HTML responses
    if (!contentType.includes("text/html")) {
      // Pass through non-HTML content as-is
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      BLOCKED_HEADERS.forEach(h => headers.delete(h));
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    let html = await response.text();

    // Rewrite HTML to proxy links and inject navigation script
    html = rewriteHtml(html, targetUrl);

    // Build response headers
    const headers = new Headers();
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("X-AXE-Proxy", "true");

    return new Response(html, {
      status: 200,
      headers,
    });

  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
