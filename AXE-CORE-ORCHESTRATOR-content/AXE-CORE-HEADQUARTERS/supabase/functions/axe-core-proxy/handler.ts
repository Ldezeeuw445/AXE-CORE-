/**
 * axe-core-proxy: de web-app (axeheadquarters.com) naar axe-core-api op de VPS.
 *
 * Waarom hier en niet op Cloudflare: de Pages-functies draaiden tot 27 sep
 * rond 16:00 (911 verzoeken, 0 fouten) en daarna niet meer, ook niet met een
 * verse _worker.js die aantoonbaar geüpload en gecompileerd werd. Waarom is
 * vanuit de repo niet te zien. Deze functie staat in hetzelfde Supabase-
 * project als de login en de data, dus één partij minder in de keten.
 *
 * En hij is dicht, wat de Pages-proxy niet was: die zette de sleutel op elk
 * verzoek van wie dan ook, dus iedereen op internet kon via axeheadquarters.com
 * /internal/exec en de GitHub-schrijfrechten gebruiken. Hier moet je ingelogd
 * zijn als de eigenaar. De Supabase-gateway controleert handtekening en
 * verloop van het JWT (verify_jwt); deze code kijkt wie het is.
 *
 * Geen Deno-API's in dit bestand, zodat vitest het kan testen; index.ts geeft
 * de omgeving mee.
 */

export interface ProxyOmgeving {
  /** De VPS-sleutel; pas opgehaald nadat de beller de eigenaar blijkt (zie index.ts). */
  sleutel: () => Promise<string | undefined>;
  /** https://api.axecompanion.com, zonder slash aan het eind. */
  vps: string;
  /** Supabase-gebruikers die erdoor mogen. */
  eigenaren: readonly string[];
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-axe-repo',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

/** Wie er in het JWT staat. Alleen lezen: de gateway heeft het al gecontroleerd. */
export function jwtInhoud(authorization: string | null): { sub?: string; role?: string } | null {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const deel = token?.split('.')[1];
  if (!deel) return null;
  try {
    const b64 = deel.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
  } catch {
    return null;
  }
}

/**
 * Een fout van boven in het functielog: welk pad, welke provider en welk
 * model, en wat de VPS zei. Nooit de sleutel: uit de body komen alleen
 * provider en model mee (de client kan er een providersleutel in zetten).
 *
 * Bestaat sinds 28 sep: /proxy/ai gaf 502 en "all providers failed", en
 * nergens stond waarom.
 */
async function logFout(pad: string, upstream: Response, body: ArrayBuffer | undefined): Promise<void> {
  let provider: unknown;
  let model: unknown;
  try {
    const verzoek = body ? JSON.parse(new TextDecoder().decode(body)) : null;
    provider = verzoek?.provider;
    model = verzoek?.model;
  } catch { /* geen JSON */ }
  const fout = await upstream.clone().text().catch(() => '');
  console.warn(JSON.stringify({ axeProxyFout: pad, status: upstream.status, provider, model, fout: fout.slice(0, 300) }));
}

export async function behandel(req: Request, omg: ProxyOmgeving, doeFetch: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // De anon-sleutel is ook een geldig JWT; die heeft role "anon" en komt hier niet door.
  const wie = jwtInhoud(req.headers.get('authorization'));
  if (wie?.role !== 'authenticated' || !wie.sub || !omg.eigenaren.includes(wie.sub)) {
    return json({ detail: 'only the AXE CORE owner may use this proxy' }, 403);
  }

  // Een ontbrekende sleutel is een instelling, geen mislukte aanroep: zeg dat,
  // in plaats van een 401 van boven door te geven die op "geen toegang" lijkt.
  const sleutel = await omg.sleutel();
  if (!sleutel) {
    return json({ detail: 'no VPS key: app_secrets.axe_core_api_key and the AXE_CORE_API_KEY secret are both empty' }, 503);
  }

  const url = new URL(req.url);
  const pad = url.pathname.replace(/^.*?\/axe-core-proxy/, '') || '/';
  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') ?? 'application/json',
    Authorization: `Bearer ${sleutel}`,
  };
  const accept = req.headers.get('accept');
  if (accept) headers.Accept = accept;
  const repo = req.headers.get('x-axe-repo');
  if (repo) headers['X-AXE-Repo'] = repo;

  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
    const upstream = await doeFetch(`${omg.vps}${pad}${url.search}`, { method: req.method, headers, body });
    if (!upstream.ok) await logFout(pad, upstream, body);
    // Status en body ongewijzigd door, ook een stream (/proxy/ai).
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', ...CORS },
    });
  } catch (err) {
    // De hop faalde, niet de API: dat vraagt een andere oplossing.
    const bericht = err instanceof Error ? err.message : String(err);
    return json({ detail: `could not reach the AXE Core API: ${bericht}` }, 502);
  }
}
