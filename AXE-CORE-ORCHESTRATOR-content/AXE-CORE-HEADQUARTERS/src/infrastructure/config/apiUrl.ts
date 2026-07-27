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
