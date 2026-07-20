/**
 * Vercel Edge Function — AI proxy
 * POST /api/proxy/ai
 *
 * Forwards AI calls from the browser to the real provider server-side,
 * bypassing CORS restrictions. Supports Anthropic, Google, and all
 * OpenAI-compatible providers (OpenRouter, Groq, Krater, xAI, Ollama).
 */

export const config = { runtime: "edge" };

interface ProxyBody {
  provider: string;
  key: string;
  model: string;
  format: "anthropic" | "google" | "openai";
  baseUrl: string;
  messages: Array<{ role: string; content: string }>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: ProxyBody;
  try {
    body = (await request.json()) as ProxyBody;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { provider, key, model, format, baseUrl, messages } = body;
  if (!provider || !model || !format || !baseUrl || !Array.isArray(messages)) {
    return json({ error: "Missing required fields: provider, model, format, baseUrl, messages" }, 400);
  }

  // ── Ollama: stream through, never buffer ────────────────────────────
  // Vercel Edge Functions must send *an* initial response within 25s or the
  // platform kills the invocation — no AbortSignal or await can extend that.
  // Local/VPS Ollama routinely takes longer than 25s to finish a full reply,
  // so this path used to die before Ollama ever got to respond. Streaming
  // the upstream body straight through means our Response object (headers +
  // first bytes) goes out the moment Ollama's connection opens — well under
  // 25s — while the body itself can keep flowing for as long as the client
  // is willing to wait (the caller sets its own longer AbortSignal).
  if (provider === "ollama") {
    try {
      const upstream = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: AbortSignal.timeout(25_000), // covers only "does Ollama start responding"
      });
      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => "");
        return json({ error: errText || `Ollama HTTP ${upstream.status}` }, 502);
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";
      // The client sets its own AbortSignal.timeout(90_000) for Ollama calls
      // (see llmGateway.ts) — match that here so a genuinely stuck upstream
      // stream ends on our terms with whatever content streamed so far,
      // instead of running until Vercel's platform-wide function ceiling
      // (five minutes) kills the invocation outright.
      const deadline = Date.now() + 90_000;

      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (Date.now() > deadline) {
            reader.cancel().catch(() => {});
            controller.close();
            return;
          }
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const j = JSON.parse(line) as { message?: { content?: string } };
              const tok = j?.message?.content ?? "";
              if (tok) controller.enqueue(encoder.encode(tok));
            } catch {
              // partial/garbled line — skip
            }
          }
        },
        cancel() {
          reader.cancel().catch(() => {});
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  }

  const timeout = 25_000;

  try {
    let text = "";

    // ── Anthropic ──────────────────────────────────────────────────────
    if (format === "anthropic") {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      const r = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
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
        const e = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
        return json({ error: e.error?.message ?? `Anthropic HTTP ${r.status}` }, 502);
      }
      const d = (await r.json()) as { content?: Array<{ text?: string }> };
      text = d.content?.[0]?.text ?? "";

    // ── Google Gemini ──────────────────────────────────────────────────
    } else if (format === "google") {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      const r = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
          ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
          generationConfig: { maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
        return json({ error: e.error?.message ?? `Google HTTP ${r.status}` }, 502);
      }
      const d = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // ── OpenAI-compatible (OpenAI, OpenRouter, Groq, xAI, Krater, Ollama) ──
    } else {
      const isGroq = provider === "groq";
      const chatUrl = isGroq ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
      const r = await fetch(chatUrl, {
        method: "POST",
        headers: {
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
        return json({ error: e.error?.message ?? `${provider} HTTP ${r.status}` }, 502);
      }
      const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      text = d.choices?.[0]?.message?.content ?? "";
    }

    return json({ text });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
}
