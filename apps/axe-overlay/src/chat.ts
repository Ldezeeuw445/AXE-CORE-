import { DEFAULT_API_ORIGIN, authHeaders, loadLocalConfig, type OverlayConfig } from "./config";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

async function cfg(): Promise<OverlayConfig> {
  return loadLocalConfig();
}

export async function pingBackend(): Promise<{ ok: boolean; origin: string }> {
  const c = await cfg();
  const origin = (c.apiOrigin || DEFAULT_API_ORIGIN).replace(/\/$/, "");
  try {
    const r = await fetch(`${origin}/health`, {
      method: "GET",
      headers: authHeaders(c.apiKey),
    });
    return { ok: r.ok, origin };
  } catch {
    return { ok: false, origin };
  }
}

/** Chat → AXE /proxy/ai. Key only from local config file (never in bundle). */
export async function sendChat(messages: ChatMessage[]): Promise<string> {
  const c = await cfg();
  const origin = (c.apiOrigin || DEFAULT_API_ORIGIN).replace(/\/$/, "");
  const url = `${origin}/proxy/ai`;
  const body = {
    provider: "xai",
    model: "grok-4-1-fast-non-reasoning",
    messages,
    stream: false,
    temperature: 0.4,
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(c.apiKey),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Backend ${r.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
  }
  const data = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
    content?: string;
    reply?: string;
  };
  return (
    data.choices?.[0]?.message?.content ||
    data.content ||
    data.reply ||
    "(lege reply)"
  );
}
