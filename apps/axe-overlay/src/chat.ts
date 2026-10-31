import { DEFAULT_API_ORIGIN, authHeaders, loadLocalConfig } from "./config";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  at?: number;
};

export type FileContext = {
  name: string;
  size: number;
  kind: string;
  /** Small text preview or note — never binary blobs in chat payload. */
  note: string;
};

/**
 * Chat via HQ /proxy/ai (OpenAI-compatible). Never logs the API key.
 */
export async function sendOverlayChat(
  text: string,
  history: ChatMessage[],
  files: FileContext[] = [],
  systemExtra = "",
): Promise<string> {
  const c = await loadLocalConfig();
  const origin = (c.apiOrigin || DEFAULT_API_ORIGIN).replace(/\/$/, "");
  const key = c.apiKey;
  if (!key) {
    throw new Error("Geen API key — zet ~/.axe/axe-api.key of overlay config.json");
  }

  const fileBlock =
    files.length === 0
      ? ""
      : `\n\n[Notch files dropped]\n${files
          .map((f) => `- ${f.name} (${f.kind}, ${f.size} B): ${f.note}`)
          .join("\n")}`;

  const system =
    "Je bent AXE Core in de notch-overlay. Kort, Nederlands, actiegericht. " +
    "Computer use en browser use zijn always-on. " +
    "Nooit secrets, trades, payments of mail-credentials tonen of uitvoeren." +
    (systemExtra ? ` ${systemExtra}` : "");

  const messages = [
    { role: "system", content: system },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text + fileBlock },
  ];

  const r = await fetch(`${origin}/proxy/ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(key),
    },
    body: JSON.stringify({
      provider: "openai",
      model: "gpt-4o-mini",
      format: "openai",
      baseUrl: "https://api.openai.com/v1",
      messages,
      source: "axe-overlay",
    }),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Chat ${r.status}: ${body.slice(0, 180)}`);
  }
  const data = (await r.json()) as {
    text?: string;
    reply?: string;
    message?: string;
    content?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  return (
    data.text ||
    data.reply ||
    data.message ||
    data.content ||
    data.choices?.[0]?.message?.content ||
    "(geen antwoord)"
  );
}
