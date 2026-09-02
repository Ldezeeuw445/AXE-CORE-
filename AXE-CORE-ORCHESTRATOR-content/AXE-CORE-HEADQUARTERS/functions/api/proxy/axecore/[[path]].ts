/**
 * /api/proxy/axecore/* → api.axecompanion.com, met de sleutel erbij.
 *
 * Dit bestaat omdat de bevoorrechte kant van axe-core-api (Supabase
 * service_role, GitHub write, /internal/exec) een bearer-key eist die de
 * browser nooit mag zien. axeCoreApiService zegt dat ook met zoveel woorden:
 * "The browser never talks to api.axecompanion.com directly and never sees
 * the API key."
 *
 * Op Vercel deed een edge function dit. Op Cloudflare Pages doet deze het,
 * met dezelfde afspraak: de sleutel komt uit een server-only variabele
 * (AXE_CORE_API_KEY, ZONDER VITE_-voorvoegsel) die in de Pages-instellingen
 * staat en dus nooit in de bundel belandt.
 *
 * Op 2 sep 2026 is dit een keer misgegaan: een lokaal gebouwde bundel is
 * gepubliceerd met VITE_AXE_CORE_API_KEY erin gebakken. Vandaar dat het hier
 * expliciet staat -- de VITE_-variant hoort alleen in een Tauri-build, die
 * enkel draait op een machine die die toegang toch al heeft.
 */

interface Env {
  AXE_CORE_API_KEY?: string;
  AXE_CORE_API_URL?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export const onRequest = async (context: {
  request: Request;
  params: { path?: string | string[] };
  env: Env;
}): Promise<Response> => {
  const { request, params, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Een ontbrekende sleutel is een configuratiefout op de server, geen
  // mislukte aanroep. Zeg dat, in plaats van een 401 van bovenaf door te
  // geven die eruitziet alsof de gebruiker geen toegang heeft.
  if (!env.AXE_CORE_API_KEY) {
    return json(
      { detail: 'AXE_CORE_API_KEY staat niet ingesteld op deze Pages-omgeving' },
      503,
    );
  }

  const segments = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const suffix = segments.length ? `/${segments.join('/')}` : '';
  const base = (env.AXE_CORE_API_URL ?? 'https://api.axecompanion.com').replace(/\/$/, '');
  const search = new URL(request.url).search;

  try {
    const upstream = await fetch(`${base}${suffix}${search}`, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AXE_CORE_API_KEY}`,
      },
      body: request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.text(),
    });

    // Status ongewijzigd doorgeven. Een proxy die een 502 van boven in een
    // eigen 200 verandert is precies de fout die deze codebase aan het
    // opruimen is.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        ...CORS,
      },
    });
  } catch (err) {
    // Onderscheid tussen "de hop faalde" en "de API zei nee" -- dat zijn
    // verschillende problemen met verschillende oplossingen.
    const message = err instanceof Error ? err.message : String(err);
    return json({ detail: `kon de AXE Core API niet bereiken: ${message}` }, 502);
  }
};
