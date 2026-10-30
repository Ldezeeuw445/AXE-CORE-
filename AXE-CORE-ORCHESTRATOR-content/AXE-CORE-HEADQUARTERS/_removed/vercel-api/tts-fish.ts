/**
 * Vercel Serverless Function (Node runtime) — Fish Audio TTS proxy.
 *   POST /api/tts-fish -> synthesize speech, returns audio/mpeg bytes
 *
 * Same reason this exists as api/tts.ts (ElevenLabs): the key must live in a
 * server-side env var (FISH_AUDIO_API_KEY, not VITE_-prefixed) and never
 * reach the client bundle. This is a second, optional voice provider — not
 * a replacement for ElevenLabs, which stays the default.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Readable } from "node:stream";

const FISH_AUDIO_URL = "https://api.fish.audio/v1/tts";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const key = process.env.FISH_AUDIO_API_KEY || "";
  if (!key) {
    res.status(503).json({ error: "Fish Audio is not configured on the server. Set FISH_AUDIO_API_KEY in the Vercel project env vars and redeploy.", configured: false });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (typeof req.body === "object" && req.body ? req.body : {}) as {
    text?: string;
    voiceId?: string;
    model?: string;
    speed?: number;
  };
  const text = (body.text || "").slice(0, 4000);
  const voiceId = body.voiceId || process.env.FISH_AUDIO_VOICE_ID || "";
  if (!text || !voiceId) {
    res.status(400).json({ error: "Missing required fields: text, voiceId (or set FISH_AUDIO_VOICE_ID on the server)" });
    return;
  }

  try {
    const upstream = await fetch(FISH_AUDIO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        model: body.model || "s2.1-pro-free",
      },
      body: JSON.stringify({
        text,
        reference_id: voiceId,
        format: "mp3",
        speed: body.speed ?? 1.0,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      res.status(upstream.status || 502).json({ error: errText || `Fish Audio HTTP ${upstream.status}` });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    Readable.fromWeb(upstream.body as import("stream/web").ReadableStream<Uint8Array>).pipe(res);
  } catch (err: unknown) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
