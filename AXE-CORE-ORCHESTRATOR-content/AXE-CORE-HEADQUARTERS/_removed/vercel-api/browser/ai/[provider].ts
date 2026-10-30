/**
 * Vercel Edge — Browser AI providers (DeepSeek, Browser Use, Camofox).
 * Proxies to VPS when AXECORE_API_URL is set, otherwise handles DeepSeek directly.
 */
export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: cors });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const provider = parts[parts.length - 1];
  const body = await req.json().catch(() => ({}));

  const vpsBase = process.env.AXECORE_API_URL ?? process.env.VITE_AXECORE_API_URL;
  if (vpsBase && provider !== "deepseek") {
    const res = await fetch(`${vpsBase}/browser/ai/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AXECORE_API_TOKEN ?? ""}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: res.statusText }));
    return json(data, res.status);
  }

  if (provider === "deepseek") {
    const apiKey = body.api_key ?? process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return json({ detail: "DeepSeek API key not configured" }, 503);

    const model = body.mode === "deepthink" ? "deepseek-reasoner" : "deepseek-chat";
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are DeepSeek in AXE Browser. Reply concisely in the user's language." },
          { role: "user", content: body.message },
        ],
        max_tokens: 2048,
      }),
    });
    if (!res.ok) return json({ detail: await res.text() }, res.status);
    const data = await res.json();
    return json({ message: data.choices[0].message.content, status: "ok" });
  }

  if (provider === "browser-use" || provider === "camofox") {
    if (vpsBase) {
      const res = await fetch(`${vpsBase}/browser/ai/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AXECORE_API_TOKEN ?? ""}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ error: res.statusText }));
      return json(data, res.status);
    }
    return json({
      message: `${provider} requires the VPS browser agent. Deploy backend/axe_api/browser_ai_agents.py first.`,
      status: "error",
    }, 503);
  }

  return json({ error: `Unknown provider: ${provider}` }, 404);
}
