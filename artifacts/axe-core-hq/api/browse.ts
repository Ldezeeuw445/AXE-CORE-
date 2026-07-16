/**
 * Vercel Edge Function — server-side URL fetcher
 * GET /api/browse?url=<encoded-url>
 *
 * Fetches any URL from Vercel's edge network, bypassing CORS and
 * X-Frame-Options headers that block the browser. Returns title, text,
 * and extracted links.
 */

export const config = { runtime: "edge" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const target = new URL(request.url).searchParams.get("url");
  if (!target) return json({ error: "url parameter required" }, 400);

  let targetUrl: string;
  try {
    targetUrl = new URL(target).toString();
  } catch {
    return json({ error: "Invalid URL" }, 400);
  }

  try {
    const r = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(14_000),
    });

    const html = await r.text();

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? targetUrl;

    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})/i);
    const description = descMatch?.[1]?.trim() ?? "";

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8_000);

    const linkMatches = [...html.matchAll(/href="(https?:\/\/[^"]{4,200})"/gi)];
    const links = [...new Set(linkMatches.map((m) => m[1]))].slice(0, 15);

    return json({ title, description, text, links });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
}
