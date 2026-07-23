/**
 * Vercel Serverless Function (Node runtime) — ElevenLabs TTS proxy.
 *   GET  /api/tts            -> list voices for the configured account
 *   POST /api/tts            -> synthesize speech, returns audio/mpeg bytes
 *
 * Why this exists: the browser used to call api.elevenlabs.io directly with
 * VITE_ELEVENLABS_API_KEY. Two problems, identical to the ones the axecore
 * proxy fixed: (1) a VITE_ var is bundled into the public JS, so the key was
 * readable by anyone, and (2) it only took effect if that exact var name was
 * present at BUILD time — setting ELEVENLABS_API_KEY in Vercel after the fact
 * did nothing, which is exactly the "I put it in env vars but it didn't work"
 * symptom. Routing through this function means the key lives ONLY in a
 * server-side env var (ELEVENLABS_API_KEY, not VITE_-prefixed), is read at
 * request time, and never reaches the client bundle.
 *
 * Node runtime (not Edge) so the synthesized audio streams back as raw bytes.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Readable } from "node:stream";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

function apiKey(): string {
  // Prefer the server-side name; fall back to the VITE_ one so a key set
  // either way keeps working.
  return process.env.ELEVENLABS_API_KEY || process.env.VITE_ELEVENLABS_API_KEY || "";
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const key = apiKey();
  if (!key) {
    res.status(503).json({ error: "ElevenLabs is not configured on the server. Set ELEVENLABS_API_KEY in the Vercel project env vars (server-side, NOT VITE_-prefixed) and redeploy.", configured: false });
    return;
  }

  // ── List voices ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const r = await fetch(`${ELEVENLABS_BASE}/voices`, { headers: { "xi-api-key": key } });
      const body = await r.text();
      res.status(r.status);
      res.setHeader("Content-Type", "application/json");
      res.send(body);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // ── Synthesize ───────────────────────────────────────────────────────
  const body = (typeof req.body === "object" && req.body ? req.body : {}) as {
    text?: string;
    voiceId?: string;
    model_id?: string;
    voice_settings?: Record<string, unknown>;
  };
  const text = (body.text || "").slice(0, 4000);
  const voiceId = body.voiceId || "";
  if (!text || !voiceId) {
    res.status(400).json({ error: "Missing required fields: text, voiceId" });
    return;
  }

  try {
    const upstream = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}/stream`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: body.model_id || "eleven_turbo_v2_5",
        voice_settings: body.voice_settings || undefined,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      res.status(upstream.status || 502).json({ error: errText || `ElevenLabs HTTP ${upstream.status}` });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
    Readable.fromWeb(upstream.body as import("stream/web").ReadableStream<Uint8Array>).pipe(res);
  } catch (err: unknown) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
