// Keys per app (Luka 20 nov: "raar dat AXE de terminals van de VPS'en heeft
// maar de secrets niet kan zien"). Geeft de NAMEN van de edge-geheimen van dit
// project terug, nooit een waarde. Alleen voor wie de eigen service-sleutel van
// dit project meestuurt (de AXE API voor Companion, de NorthSea MCP voor
// Commodities) -- er wordt dus geen sleutel naar een andere plek gekopieerd.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Is dit een service-sleutel van DIT project? Laat Supabase het zelf zeggen:
// alleen een service-/secret-sleutel mag de auth-beheer-API lezen. Werkt voor
// de oude JWT-vorm en de nieuwe sb_secret_-vorm.
async function toegestaan(req: Request): Promise<boolean> {
  const drager = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const url = Deno.env.get("SUPABASE_URL");
  if (!drager || !url) return false;
  const headers: Record<string, string> = { apikey: drager };
  if (!drager.startsWith("sb_")) headers.Authorization = `Bearer ${drager}`;
  try {
    const r = await fetch(`${url}/auth/v1/admin/users?per_page=1`, { headers, signal: AbortSignal.timeout(8000) });
    await r.body?.cancel();
    return r.ok;
  } catch {
    return false;
  }
}

// Wat Supabase zelf klaarzet is geen geheim van Luka.
const SYSTEEM = /^(SUPABASE_|DENO_|SB_|HOME$|PATH$|HOSTNAME$|PWD$|LANG$|TZ$|EDGE_|WORKER_)/;

Deno.serve(async (req) => {
  if (!(await toegestaan(req))) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  const namen = Object.keys(Deno.env.toObject()).filter((n) => !SYSTEEM.test(n)).sort();
  return new Response(JSON.stringify({ names: namen }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
