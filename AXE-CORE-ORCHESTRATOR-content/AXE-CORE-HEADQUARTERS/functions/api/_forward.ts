/**
 * One forwarder, used by every /api route this app has.
 *
 * The web build calls `/api/proxy/ai` and `/api/exa`. On Vercel those were
 * edge functions that reimplemented the whole provider fan-out; the same
 * logic also lives on the VPS at /proxy/ai, which is the copy that gets
 * maintained -- it is where the tool-block passthrough was added on 2 Sep.
 * Two implementations of one contract is how they drift, and the browser
 * cannot tell you which one it reached.
 *
 * So these are thin: same origin for the browser (no CORS to arrange), one
 * hop to the VPS, and no second copy of anything that can rot.
 */
const VPS = 'https://api.axecompanion.com';

export async function forward(request: Request, path: string): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const upstream = await fetch(`${VPS}${path}`, {
      method: request.method,
      headers: { 'Content-Type': 'application/json' },
      body: request.method === 'POST' ? await request.text() : undefined,
    });

    // Pass the body through untouched, including the status. A proxy that
    // turns an upstream 502 into its own 200 with an error in the body is
    // exactly the failure this whole codebase has been cleaning up.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    // Say it is the hop that failed, not the model. Those need different fixes
    // and "Proxy HTTP 502" has already cost hours on this project once.
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: `could not reach the AXE API: ${message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
    );
  }
}
