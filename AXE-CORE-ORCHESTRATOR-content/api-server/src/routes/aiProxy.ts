/**
 * aiProxy.ts — server-side AI proxy
 *
 * In production (Vercel), the browser cannot call Anthropic directly due to
 * CORS restrictions. This endpoint receives the full request from the frontend
 * and forwards it to the AI provider from Node.js (no CORS restrictions).
 *
 * POST /api/proxy/ai
 * Body: { provider, key, model, format, baseUrl, messages }
 * Returns: { text }
 */

import { Router, type Request, type Response } from "express";

const router = Router();

interface ProxyBody {
  provider: string;
  key: string;
  model: string;
  format: "anthropic" | "google" | "openai";
  baseUrl: string;
  messages: Array<{ role: string; content: string }>;
}

router.post("/proxy/ai", async (req: Request, res: Response) => {
  const { provider, key, model, format, baseUrl, messages } =
    (req.body ?? {}) as ProxyBody;

  if (!provider || !model || !format || !baseUrl || !Array.isArray(messages)) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    let text = "";
    const timeout = provider === "ollama" ? 90_000 : 25_000;

    // ── Anthropic ──────────────────────────────────────────────────────
    if (format === "anthropic") {
      const sys =
        messages.find((m) => m.role === "system")?.content ?? "";
      const r = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: sys || undefined,
          messages: messages.filter((m) => m.role !== "system"),
        }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(e.error?.message ?? `Anthropic HTTP ${r.status}`);
      }
      const d = (await r.json()) as {
        content?: Array<{ text?: string }>;
      };
      text = d.content?.[0]?.text ?? "";

    // ── Google Gemini ──────────────────────────────────────────────────
    } else if (format === "google") {
      const sys =
        messages.find((m) => m.role === "system")?.content ?? "";
      const r = await fetch(
        `${baseUrl}/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: messages
              .filter((m) => m.role !== "system")
              .map((m) => ({
                role: m.role === "user" ? "user" : "model",
                parts: [{ text: m.content }],
              })),
            ...(sys
              ? { systemInstruction: { parts: [{ text: sys }] } }
              : {}),
            generationConfig: { maxOutputTokens: 1024 },
          }),
          signal: AbortSignal.timeout(timeout),
        },
      );
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(e.error?.message ?? `Google HTTP ${r.status}`);
      }
      const d = (await r.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // ── OpenAI-compatible (OpenAI, OpenRouter, Groq, xAI, Krater, Ollama) ──
    } else {
      const isGroq = provider === "groq";
      const chatUrl = isGroq
        ? `${baseUrl}/chat/completions`
        : `${baseUrl}/v1/chat/completions`;
      const r = await fetch(chatUrl, {
        method: "POST",
        headers: {
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 1024,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(e.error?.message ?? `${provider} HTTP ${r.status}`);
      }
      const d = (await r.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      text = d.choices?.[0]?.message?.content ?? "";
    }

    res.json({ text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

export default router;
