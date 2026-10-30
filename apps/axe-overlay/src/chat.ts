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
 * Lightweight chat via HQ /chat. Always-on: computer_use + browser_use hints
 * so the orchestrator can drive live device sessions from the notch.
 */
export async function sendOverlayChat(
  text: string,
  history: ChatMessage[],
  files: FileContext[] = [],
): Promise<string> {
  const c = await loadLocalConfig();
  const origin = (c.apiOrigin || DEFAULT_API_ORIGIN).replace(/\/$/, "");
  const key = c.apiKey;
  if (!key) {
    throw new Error("Geen AXE_CORE_API_KEY — zet apps/axe-overlay/.env of overlay.config.json");
  }

  const fileBlock =
    files.length === 0
      ? ""
      : `\n\n[Notch files dropped]\n${files
          .map((f) => `- ${f.name} (${f.kind}, ${f.size} B): ${f.note}`)
          .join("\n")}`;

  const messages = [
    {
      role: "system",
      content:
        "Je bent AXE Core in de notch-overlay. Kort, Nederlands, actiegericht. " +
        "Computer use en browser use zijn always-on: als de gebruiker iets wil doen " +
        "op het apparaat of in een browser, plan dat via de orchestrator/tasks. " +
        "Nooit secrets, trades, payments of mail-credentials tonen.",
    },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text + fileBlock },
  ];

  const r = await fetch(`${origin}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(key),
    },
    body: JSON.stringify({
      messages,
      source: "axe-overlay",
      capabilities_hint: ["computer_use", "browser_use", "chat"],
    }),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Chat ${r.status}: ${body.slice(0, 180)}`);
  }
  const data = (await r.json()) as { reply?: string; message?: string; content?: string };
  return data.reply || data.message || data.content || "(geen antwoord)";
}
