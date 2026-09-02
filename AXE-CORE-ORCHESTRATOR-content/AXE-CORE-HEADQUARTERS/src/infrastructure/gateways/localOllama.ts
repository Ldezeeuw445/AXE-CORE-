import { loopbackVerdict } from '@/domain/loopback';
import { currentHostKind } from '@/infrastructure/config/apiUrl';
/**
 * localOllama — "always works when home" local model support.
 *
 * AXE Core runs as a Tauri desktop app on Luka's Mac Mini, where Ollama also
 * runs (http://localhost:11434). When home, that local server is the fastest,
 * most private, zero-cost path — and it works with no internet and no cloud
 * key. This module is the local-first half of the Ollama routing: a cheap,
 * cached reachability probe plus a warm-up call. The gateway uses isLocalOllamaUp()
 * to decide whether to send a real completion to localhost (with a proper
 * timeout) before falling back to the VPS / cloud. See llmGateway.ts.
 *
 * Why not just point the Ollama provider baseUrl at localhost? Because a
 * packaged build's provider baseUrl is also handed to the VPS proxy for the
 * fallback path, and the VPS can never reach *this* Mac's localhost. Local
 * dispatch has to originate from this machine, client-side — so it lives here.
 */

import { isAndroidShellRuntime } from '@/infrastructure/config/apiUrl';

export const LOCAL_OLLAMA_URL = 'http://localhost:11434';

/** Keep the local model resident so the first query of a session is fast
 *  (Ollama's own default unloads after 5 min idle). */
export const LOCAL_KEEP_ALIVE = '60m';

/** How long a probe result is trusted before we re-check. Long enough that a
 *  chat turn never pays for a probe twice, short enough that plugging back
 *  into the home network is noticed within a minute. */
const PROBE_TTL_MS = 45_000;
const PROBE_TIMEOUT_MS = 1_500;

let cached: { up: boolean; at: number } | null = null;
let inflight: Promise<boolean> | null = null;

async function probe(): Promise<boolean> {
  // On the phone this address is the HANDSET's own loopback, where nothing
  // listens and nothing ever will. Probing it can only ever cost a timeout, so
  // the shell answers "no local model" without asking.
  if (isAndroidShellRuntime()) return false;
  try {
    const r = await fetch(`${LOCAL_OLLAMA_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Cached, de-duplicated reachability check for the local Ollama server.
 *  Cheap (~tens of ms on the home network, fails fast otherwise). */
export async function isLocalOllamaUp(): Promise<boolean> {
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.up;
  if (inflight) return inflight;
  inflight = probe().then(up => {
    cached = { up, at: Date.now() };
    inflight = null;
    return up;
  });
  return inflight;
}

/** Force the next isLocalOllamaUp() to re-probe (e.g. after a network change). */
export function invalidateLocalOllamaProbe(): void {
  cached = null;
}

/** List models the local server currently has pulled. [] when unreachable. */
export async function listLocalOllamaModels(): Promise<string[]> {
  try {
    const r = await fetch(`${LOCAL_OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!r.ok) return [];
    const d = (await r.json()) as { models?: Array<{ name?: string }> };
    return (d.models ?? []).map(m => m.name ?? '').filter(Boolean);
  } catch {
    return [];
  }
}

/** Warm a model into memory (and pin it there for LOCAL_KEEP_ALIVE) so the
 *  first real user query doesn't pay the cold-load cost. Fire-and-forget from
 *  app boot — never throws, never blocks. */
export async function warmLocalOllama(model: string): Promise<void> {
  try {
    if (!(await isLocalOllamaUp())) return;
    await fetch(`${LOCAL_OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'ok', stream: false, keep_alive: LOCAL_KEEP_ALIVE, options: { num_predict: 1 } }),
      // Cold load of a 2–3GB model on an 8GB Mac Mini can take a while the very
      // first time; give it room but don't hang forever.
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    /* best-effort warm-up; the model still loads on first real use */
  }
}

/**
 * Any self-hosted Ollama that is actually reachable, and where it is.
 *
 * `isLocalOllamaUp()` only ever probed localhost — the Mac Mini. That is right
 * at home and wrong everywhere else: away from the desk it reports false, so
 * "local model first" quietly switches itself off exactly when the free models
 * matter most, while Hetzner sits there answering in 2.3s.
 *
 * Localhost first when it is up (faster, private, no egress), otherwise the
 * configured VPS Ollama. Returns null when neither answers, so the caller can
 * leave the cloud cascade alone rather than pointing a slot at a dead host.
 */
export async function resolveReachableOllama(): Promise<{ baseUrl: string; local: boolean } | null> {
  // The fall-through below already handles the phone correctly -- localhost is
  // down there, so it lands on the VPS. But it gets there by making a request
  // that cannot succeed, on every call. Asking the host first is free.
  const canReachLocal = loopbackVerdict(LOCAL_OLLAMA_URL, currentHostKind(), 'Ollama').reachable;
  if (canReachLocal && await isLocalOllamaUp()) return { baseUrl: LOCAL_OLLAMA_URL, local: true };

  const remote = remoteOllamaBaseUrl();
  if (!remote) return null;
  try {
    const r = await fetch(`${remote}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (r.ok) return { baseUrl: remote, local: false };
  } catch { /* unreachable */ }
  return null;
}

/** The VPS Ollama the user configured, if any. */
function remoteOllamaBaseUrl(): string | null {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<
      string, { baseUrl?: string } | undefined
    >;
    const url = conns.ollama?.baseUrl?.trim();
    if (url && !url.includes('localhost') && !url.includes('127.0.0.1')) return url.replace(/\/$/, '');
  } catch { /* ignore */ }
  return null;
}
