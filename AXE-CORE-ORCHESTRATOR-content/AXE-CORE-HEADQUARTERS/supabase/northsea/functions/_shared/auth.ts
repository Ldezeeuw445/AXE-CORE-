// P0.1 Autorisatie voor northsea-command-center.
//
// Authenticatie alleen is onvoldoende: de functie leest met service-role-rechten.
// Toegestaan:
//   - een geldige sessie van een EXPLICIETE NorthSea-eigenaar (AXE Companion Auth,
//     dezelfde identiteit als de NorthSea MCP-allowlist), online gecontroleerd;
//   - een service-credential (x-northsea-service-key) waarvan alleen de SHA-256-hash
//     in de omgeving staat, scope: command_center.read.
// Geweigerd: geen credential (401), anon/publishable key, service-role JWT, een
// sessie uit dit project, een andere gebruiker, een onbekende sleutel (403).

export interface CommandCenterAuthEnv {
  serviceKeySha256: string | null;
  ownerUserIds: string[];
  ownerAuthUrl: string | null;
  ownerAuthApiKey: string | null;
}

export interface AuthDecision {
  allowed: boolean;
  status: 200 | 401 | 403 | 503;
  reason: string;
  principal?: string;
  kind?: "owner" | "service";
  scope?: string;
}

export async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function jwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "="));
    const c = JSON.parse(json);
    return c && typeof c === "object" ? c : null;
  } catch {
    return null;
  }
}

export function envFromDeno(get: (k: string) => string | undefined): CommandCenterAuthEnv {
  const ids = (get("NORTHSEA_OWNER_USER_IDS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  return {
    serviceKeySha256: (get("NORTHSEA_COMMAND_CENTER_SERVICE_KEY_SHA256") ?? "").trim().toLowerCase() || null,
    ownerUserIds: ids,
    ownerAuthUrl: (get("NORTHSEA_OWNER_AUTH_URL") ?? "").trim().replace(/\/$/, "") || null,
    ownerAuthApiKey: (get("NORTHSEA_OWNER_AUTH_APIKEY") ?? "").trim() || null,
  };
}

export async function authorizeCommandCenter(req: Request, env: CommandCenterAuthEnv, fetchImpl: typeof fetch = fetch): Promise<AuthDecision> {
  const serviceKey = req.headers.get("x-northsea-service-key");
  if (serviceKey !== null) {
    if (!env.serviceKeySha256) return { allowed: false, status: 403, reason: "service_credential_not_configured" };
    const ok = constantTimeEqual(await sha256Hex(serviceKey.trim()), env.serviceKeySha256);
    return ok
      ? { allowed: true, status: 200, reason: "service_credential", principal: "service:command-center", kind: "service", scope: "command_center.read" }
      : { allowed: false, status: 403, reason: "invalid_service_credential" };
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { allowed: false, status: 401, reason: "credential_required" };
  if (token.startsWith("sb_publishable_") || token.startsWith("sb_secret_")) return { allowed: false, status: 403, reason: "project_api_key_not_accepted" };

  const claims = jwtClaims(token);
  if (!claims) return { allowed: false, status: 403, reason: "unrecognized_credential" };
  const role = String(claims.role ?? "");
  if (role === "anon") return { allowed: false, status: 403, reason: "anon_not_accepted" };
  if (role === "service_role") return { allowed: false, status: 403, reason: "service_role_not_accepted" };
  if (role !== "authenticated") return { allowed: false, status: 403, reason: "role_not_accepted" };
  const sub = String(claims.sub ?? "").toLowerCase();
  if (!env.ownerUserIds.includes(sub)) return { allowed: false, status: 403, reason: "not_an_authorized_owner" };
  if (!env.ownerAuthUrl || !env.ownerAuthApiKey) return { allowed: false, status: 503, reason: "owner_auth_not_configured" };

  // De claims zijn nog niet vertrouwd: de identiteitsprovider moet de sessie bevestigen.
  let r: Response;
  try {
    r = await fetchImpl(`${env.ownerAuthUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: env.ownerAuthApiKey } });
  } catch {
    return { allowed: false, status: 503, reason: "owner_auth_unreachable" };
  }
  if (r.status !== 200) return { allowed: false, status: 401, reason: "owner_session_invalid" };
  const user = await r.json().catch(() => null) as { id?: string } | null;
  const id = String(user?.id ?? "").toLowerCase();
  if (!id || id !== sub || !env.ownerUserIds.includes(id)) return { allowed: false, status: 403, reason: "not_an_authorized_owner" };
  return { allowed: true, status: 200, reason: "owner_session", principal: `owner:${id}`, kind: "owner", scope: "command_center.read" };
}
