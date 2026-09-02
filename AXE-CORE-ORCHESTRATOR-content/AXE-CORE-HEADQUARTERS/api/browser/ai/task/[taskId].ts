/**
 * Vercel Edge — poll Browser Use / Camofox task status.
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
  if (req.method !== "GET") return json({ error: "GET only" }, 405);

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const taskId = parts[parts.length - 1];

  const vpsBase = process.env.AXECORE_API_URL ?? process.env.VITE_AXECORE_API_URL;
  if (!vpsBase) return json({ detail: "VPS API not configured for task polling" }, 503);

  const res = await fetch(`${vpsBase}/browser/ai/task/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${process.env.AXECORE_API_TOKEN ?? ""}` },
  });
  const data = await res.json().catch(() => ({ error: res.statusText }));
  return json(data, res.status);
}
