import { createClient } from "@supabase/supabase-js";
import type { Request, RequestHandler } from "express";
import { logger } from "./logger";

// These are provisioned as workspace secrets and shared with every service in
// this repl (not just the Vite frontend), so we can read them directly here
// even though they carry the VITE_ prefix.
const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const SUPABASE_ANON_KEY = process.env["VITE_SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!supabase) {
  logger.warn(
    "Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing) — " +
    "terminal and file APIs will reject all requests.",
  );
}

export interface AuthedUser {
  id: string;
  email: string | null;
}

/**
 * Verifies a Supabase access token against the Supabase Auth server.
 * Returns the authenticated user, or null if the token is missing/invalid.
 */
export async function verifyAccessToken(token: string | null | undefined): Promise<AuthedUser | null> {
  if (!token || !supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch (err) {
    logger.error({ err }, "Failed to verify Supabase access token");
    return null;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

/**
 * Express middleware guarding privileged routes (file system + terminal APIs)
 * behind a valid, logged-in AXE Core Supabase session.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  verifyAccessToken(token)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      (req as Request & { user: AuthedUser }).user = user;
      next();
    })
    .catch(next);
};
