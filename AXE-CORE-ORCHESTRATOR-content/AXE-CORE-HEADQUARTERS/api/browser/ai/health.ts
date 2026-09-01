/**
 * Vercel Edge — Browser AI health check.
 */
export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: cors });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const vpsBase = process.env.AXECORE_API_URL ?? process.env.VITE_AXECORE_API_URL;
  if (vpsBase) {
    const res = await fetch(`${vpsBase}/browser/ai/health`, {
      headers: { Authorization: `Bearer ${process.env.AXECORE_API_TOKEN ?? ""}` },
    });
    const data = await res.json().catch(() => ({ error: res.statusText }));
    return json(data, res.status);
  }

  return json({
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    browser_use: false,
    camofox: false,
    note: "VPS not configured — only DeepSeek available via edge",
  });
}
