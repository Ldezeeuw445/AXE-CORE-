/**
 * Resolves same-origin `/api/*` (and `/proxy/axecore`) paths so they work in
 * all three places AXE CORE runs:
 *  - Vercel production (the real web app) — the path IS the server, leave it
 *    relative.
 *  - `npm run dev` / `npm run tauri:dev` — the Vite dev server proxies these
 *    paths to the deployed Vercel host (see vite.config.ts), so relative
 *    still works.
 *  - A PACKAGED Tauri app (`tauri:build`) — there is no server behind the
 *    static bundle at all. A relative `fetch('/api/...')` 404s. This is the
 *    one case that needs an absolute URL.
 *
 * `isTauriRuntime()` detects the Tauri webview (it injects `__TAURI__` /
 * `__TAURI_INTERNALS__` globals); combined with `import.meta.env.PROD` this
 * only rewrites for the packaged-build case, never for tauri:dev.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return w.__TAURI__ !== undefined || w.__TAURI_INTERNALS__ !== undefined;
}

// The deployed Vercel host every `/api/*` function actually lives on.
// Override with VITE_PROD_ORIGIN if you ever deploy to a different domain.
const PROD_ORIGIN = (import.meta.env.VITE_PROD_ORIGIN as string | undefined) ?? 'https://www.axeheadquarters.com';

export function apiUrl(path: string): string {
  if (import.meta.env.PROD && isTauriRuntime()) {
    return `${PROD_ORIGIN}${path}`;
  }
  return path;
}

// The VPS's own FastAPI backend, reachable directly (no Vercel in the path).
// Only the packaged Tauri app uses this — the public web app keeps going
// through Vercel's /api/proxy/ai + /api/exa as before. Two routes exist
// specifically for this: they're open (no AXE_API_KEY), same security model
// as the Vercel versions they mirror — the caller's own provider key rides
// in the request body, this just dodges browser CORS. That means the
// packaged app works even while the Vercel deployment is billing-disabled,
// without embedding the master backend key (Supabase service_role, GitHub
// write, /internal/exec) into a distributed app bundle.
const VPS_API_ORIGIN = (import.meta.env.VITE_VPS_API_ORIGIN as string | undefined) ?? 'https://api.axecompanion.com';

/** Resolves the AI-provider proxy: VPS directly when packaged, else the
 *  normal apiUrl('/api/proxy/ai') (Vercel prod, or the dev proxy). */
export function aiProxyUrl(): string {
  if (import.meta.env.PROD && isTauriRuntime()) return `${VPS_API_ORIGIN}/proxy/ai`;
  return apiUrl('/api/proxy/ai');
}

/** Resolves the Exa search proxy the same way. */
export function exaProxyUrl(): string {
  if (import.meta.env.PROD && isTauriRuntime()) return `${VPS_API_ORIGIN}/proxy/exa`;
  return apiUrl('/api/exa');
}
