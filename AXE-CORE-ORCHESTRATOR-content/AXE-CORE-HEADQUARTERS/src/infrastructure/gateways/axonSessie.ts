/**
 * AXON-login in HQ, first-party. De iframe van app.axon-memory.com kan de
 * Supabase-sessie niet bewaren als de WebView third-party cookies weigert,
 * en een Custom Tab verlaat Device Manager. Daarom één keer inloggen hier,
 * tokens in HQ-localStorage, en de iframe opent daarna met de hash die
 * supabase-js herkent.
 *
 * Anon-sleutel is publiek: hij staat in AXON's eigen frontend-bundle.
 */
export const AXON_SITE = 'https://app.axon-memory.com/';
export const AXON_SUPABASE_URL = 'https://ktaditgtbubonrahyiig.supabase.co';
export const AXON_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0YWRpdGd0YnVib25yYWh5aWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MDU0NDksImV4cCI6MjEwMTA4MTQ0OX0.0T34yCT9Tgjk37AB6owkfphpmDgl5gRUKmAYgtl2VM0';

const OPSLAG = 'axe_axon_sessie';

export interface AxonSessie {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email?: string;
}

export function leesAxonSessie(): AxonSessie | null {
  try {
    const raw = JSON.parse(localStorage.getItem(OPSLAG) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Partial<AxonSessie>;
    if (!o.access_token || !o.refresh_token) return null;
    return {
      access_token: String(o.access_token),
      refresh_token: String(o.refresh_token),
      expires_at: Number(o.expires_at) || 0,
      email: o.email ? String(o.email) : undefined,
    };
  } catch {
    return null;
  }
}

export function schrijfAxonSessie(sessie: AxonSessie | null): void {
  try {
    if (!sessie) localStorage.removeItem(OPSLAG);
    else localStorage.setItem(OPSLAG, JSON.stringify(sessie));
  } catch { /* quota */ }
}

export function axonEmbedUrl(sessie: AxonSessie | null, basis = AXON_SITE): string {
  if (!sessie?.access_token || !sessie.refresh_token) return basis;
  const q = new URLSearchParams({
    access_token: sessie.access_token,
    refresh_token: sessie.refresh_token,
    expires_in: String(Math.max(60, sessie.expires_at - Math.floor(Date.now() / 1000))),
    token_type: 'bearer',
    type: 'recovery',
  });
  const wortel = basis.endsWith('/') ? basis : `${basis}/`;
  return `${wortel}#${q.toString()}`;
}

function uitTokenAntwoord(body: Record<string, unknown>, email?: string): AxonSessie | null {
  const access = typeof body.access_token === 'string' ? body.access_token : '';
  const refresh = typeof body.refresh_token === 'string' ? body.refresh_token : '';
  if (!access || !refresh) return null;
  const expiresIn = Number(body.expires_in) || 3600;
  const user = body.user && typeof body.user === 'object'
    ? (body.user as { email?: string }).email
    : undefined;
  return {
    access_token: access,
    refresh_token: refresh,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    email: email || user,
  };
}

async function axonAuth(pad: string, lichaam: Record<string, string>): Promise<{ sessie: AxonSessie | null; fout: string | null }> {
  try {
    const res = await fetch(`${AXON_SUPABASE_URL}/auth/v1/${pad}`, {
      method: 'POST',
      headers: {
        apikey: AXON_ANON_KEY,
        Authorization: `Bearer ${AXON_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lichaam),
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* niet JSON */ }
    if (!res.ok) {
      const msg = typeof json.error_description === 'string'
        ? json.error_description
        : typeof json.msg === 'string'
          ? json.msg
          : typeof json.error === 'string'
            ? json.error
            : `AXON sign-in failed (${res.status})`;
      return { sessie: null, fout: msg };
    }
    const sessie = uitTokenAntwoord(json, lichaam.email);
    if (!sessie) return { sessie: null, fout: 'AXON returned no session.' };
    schrijfAxonSessie(sessie);
    return { sessie, fout: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/load failed|failed to fetch|networkerror|timeout/i.test(msg)) {
      return { sessie: null, fout: 'No connection to AXON. Try again.' };
    }
    return { sessie: null, fout: msg || 'AXON unreachable' };
  }
}

export async function axonInloggen(email: string, password: string): Promise<{ sessie: AxonSessie | null; fout: string | null }> {
  return axonAuth('token?grant_type=password', { email: email.trim(), password });
}

export async function axonVervers(sessie: AxonSessie): Promise<AxonSessie | null> {
  const uit = await axonAuth('token?grant_type=refresh_token', { refresh_token: sessie.refresh_token });
  return uit.sessie;
}

/** Bestaande sessie, ververs als hij bijna om is. */
export async function axonSessieKlaar(): Promise<AxonSessie | null> {
  const nu = leesAxonSessie();
  if (!nu) return null;
  if (nu.expires_at - Math.floor(Date.now() / 1000) > 60) return nu;
  return (await axonVervers(nu)) ?? nu;
}
