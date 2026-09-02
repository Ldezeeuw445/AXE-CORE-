import type { HostKind } from '@/domain/loopback';
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

/**
 * The AXE Core Android shell serves this same build from inside the APK over
 * https://appassets.androidplatform.net. That is exactly the packaged-Tauri
 * case described above — a static bundle with no server behind it — so a
 * relative `fetch('/api/...')` 404s there too and needs the same rewrite.
 *
 * The shell injects `__AXE_ANDROID__` (see web/AxeWebView.kt in the Android
 * project); its presence is what distinguishes "running inside the shell" from
 * "running in a phone browser", where the relative paths are still correct.
 */
export function isAndroidShellRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as unknown as Record<string, unknown>).__AXE_ANDROID__ !== undefined;
}

/**
 * Which of the three hosts this is, for the purpose of reaching a local
 * service. See domain/loopback.ts for what the answer is used for.
 *
 * The Tauri app and a dev browser are both "this machine": the services in
 * question -- Ollama, the bridge, Companion's sidecar -- run on the Mac, and
 * both of those are displayed on it. A deployed web build is served from
 * somewhere else and reaches none of them, which is a different message than
 * the phone gets and worth keeping apart.
 */
export function currentHostKind(): HostKind {
  if (isAndroidShellRuntime()) return 'android-shell';
  if (isTauriRuntime() || import.meta.env.DEV) return 'this-machine';
  return 'remote';
}

/** True for any packaged host that has no server of its own behind it. */
function isPackagedShell(): boolean {
  return isTauriRuntime() || isAndroidShellRuntime();
}

// The deployed Vercel host every `/api/*` function actually lives on.
// Override with VITE_PROD_ORIGIN if you ever deploy to a different domain.
const PROD_ORIGIN = (import.meta.env.VITE_PROD_ORIGIN as string | undefined) ?? 'https://www.axeheadquarters.com';

export function apiUrl(path: string): string {
  if (import.meta.env.PROD && isPackagedShell()) {
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
export const VPS_API_ORIGIN = (import.meta.env.VITE_VPS_API_ORIGIN as string | undefined) ?? 'https://api.axecompanion.com';

/** Resolves the AI-provider proxy: VPS directly when packaged, else the
 *  normal apiUrl('/api/proxy/ai') (Vercel prod, or the dev proxy). */
export function aiProxyUrl(): string {
  if (import.meta.env.PROD && isPackagedShell()) return `${VPS_API_ORIGIN}/proxy/ai`;
  return apiUrl('/api/proxy/ai');
}

/** Resolves the Exa search proxy the same way. */
export function exaProxyUrl(): string {
  if (import.meta.env.PROD && isPackagedShell()) return `${VPS_API_ORIGIN}/proxy/exa`;
  return apiUrl('/api/exa');
}

// axe-core-api's *privileged* surface (Supabase service_role, GitHub write,
// n8n, /internal/exec, and the openhands/openclaw/crewai/... agent bridges)
// needs AXE_CORE_API_KEY on every call — unlike /proxy/ai and /proxy/exa
// above, this one can't be left open. On the web app that key never reaches
// the browser: Vercel's /api/proxy/axecore attaches it server-side from an
// env var. There's no server behind a packaged Tauri bundle to do that, so
// this build only embeds VITE_AXE_CORE_API_KEY at `tauri:build` time (set it
// in a local, gitignored .env — never in the Vercel project's env vars,
// which feed the public web build) and calls api.axecompanion.com directly.
// This is a deliberate, narrower trust boundary than it sounds: this build
// only ever runs on a machine that already holds root SSH to the same VPS
// (see LOCAL_DEV.md), so it grants no access beyond what that key already
// has right now.
const BUILT_IN_AXE_CORE_API_KEY = import.meta.env.VITE_AXE_CORE_API_KEY as string | undefined;

/**
 * The Android shell deliberately does NOT bake this key into its bundle. A
 * phone is not the "machine that already holds root SSH to the same VPS" the
 * comment above relies on — it gets lost. Instead the native side fetches the
 * key from Supabase *after* sign-in and the biometric gate, and hands it over
 * through the bridge, so a stolen locked phone carries nothing.
 *
 * Falls back to the build-time constant, which is what Tauri still uses.
 */
function axeCoreApiKey(): string | undefined {
  if (typeof window !== 'undefined') {
    const bridge = (window as unknown as Record<string, any>).__AXE_ANDROID__;
    const fromShell = bridge?.axeCoreApiKey?.();
    if (fromShell) return fromShell as string;
  }
  return BUILT_IN_AXE_CORE_API_KEY;
}

/** Resolves axe-core-api's base URL: VPS directly when packaged (only if
 *  VITE_AXE_CORE_API_KEY was baked in — the VPS has no `/proxy/axecore`
 *  prefix, that only exists on the Vercel hop this bypasses), else the
 *  normal Vercel-proxied path. */
export function axeCoreApiUrl(devPath: string, prodPath: string): string {
  if (import.meta.env.PROD && isPackagedShell() && axeCoreApiKey()) return VPS_API_ORIGIN;
  return apiUrl(import.meta.env.DEV ? devPath : prodPath);
}

/** Extra headers `axeCoreApiService` must send — the Bearer token, but only
 *  for the direct-to-VPS path (Vercel's proxy attaches its own copy). */
export function axeCoreApiExtraHeaders(): Record<string, string> {
  if (import.meta.env.PROD && isPackagedShell() && axeCoreApiKey()) {
    return { Authorization: `Bearer ${axeCoreApiKey()}` };
  }
  return {};
}
