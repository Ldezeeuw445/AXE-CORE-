import { loopbackVerdict } from '@/domain/loopback';
import { currentHostKind } from '@/infrastructure/config/apiUrl';
/**
 * localBridgeService — AXE's only route to the machine it is displayed on.
 *
 * Every other write path AXE has lands somewhere else: git_write commits to a
 * branch on GitHub, execCommand runs on the VPS in Germany. Neither touches
 * the worktree the running app is served from, so asking AXE to change the
 * app in front of you could not work however well it was phrased — the
 * channel did not exist.
 *
 * This talks to `infra/axe-local-bridge`, a loopback-only service on Luka's
 * Mac. That service holds the real safety rails (path jail, command
 * allowlist, shared token); this side just speaks to it and reports failures
 * honestly rather than pretending the write happened.
 *
 * The token is a dev-only value from VITE_AXE_BRIDGE_TOKEN. It is not a
 * secret in the usual sense — the bridge only listens on 127.0.0.1, so
 * holding it grants nothing unless you are already on the machine.
 */

const BRIDGE_URL =
  (import.meta.env.VITE_AXE_BRIDGE_URL as string | undefined) ?? 'http://127.0.0.1:4599';
const BRIDGE_TOKEN = (import.meta.env.VITE_AXE_BRIDGE_TOKEN as string | undefined) ?? '';

/** Commands the bridge will run. Mirrors its allowlist. */
export type BridgeCommand =
  | 'build' | 'typecheck' | 'test'
  | 'git.status' | 'git.pull' | 'git.diff'
  | 'tauri.build';

export interface BridgeRunResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export interface BridgeWriteResult {
  path: string;
  bytes: number;
  created: boolean;
  /** Previous contents, so a change can be shown as a diff and undone. */
  before: string | null;
}

/**
 * Whether this build even has a bridge to talk to.
 *
 * The token alone was the whole test, and a token is baked in at build time --
 * so the phone bundle, built from the same source on the same Mac, carried it
 * and happily dialled 127.0.0.1:4599 on a device where that is the phone. A
 * token says "a bridge was configured"; it says nothing about whether this
 * host can reach it.
 */
export const isLocalBridgeConfigured =
  Boolean(BRIDGE_TOKEN) && loopbackVerdict(BRIDGE_URL, currentHostKind(), 'the local bridge').reachable;

/** Why the bridge is unavailable here, when it is. Null when it works. */
export function localBridgeUnavailableReason(): string | null {
  if (!BRIDGE_TOKEN) return 'No bridge token in this build (VITE_AXE_BRIDGE_TOKEN).';
  return loopbackVerdict(BRIDGE_URL, currentHostKind(), 'the local bridge').because;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...(init?.headers ?? {}),
    },
    // A hung bridge must not hang the chat turn behind it.
    signal: AbortSignal.timeout(path === '/run' ? 900_000 : 15_000),
  });
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(body?.error ?? `bridge ${res.status}`);
  return body as T;
}

/**
 * Is the bridge running right now?
 *
 * Used to tell "not installed" apart from "broken", so AXE can say which —
 * the whole point of this work is that it stops guessing about its own reach.
 */
export async function isLocalBridgeUp(): Promise<boolean> {
  if (!BRIDGE_TOKEN) return false;
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function localRead(path: string): Promise<string> {
  const r = await call<{ content: string }>(`/read?path=${encodeURIComponent(path)}`);
  return r.content;
}

export async function localList(path: string): Promise<Array<{ name: string; dir: boolean }>> {
  const r = await call<{ entries: Array<{ name: string; dir: boolean }> }>(
    `/list?path=${encodeURIComponent(path)}`,
  );
  return r.entries;
}

export async function localWrite(path: string, content: string): Promise<BridgeWriteResult> {
  return call<BridgeWriteResult>('/write', {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  });
}

export async function localRun(command: BridgeCommand, cwd: string): Promise<BridgeRunResult> {
  return call<BridgeRunResult>('/run', {
    method: 'POST',
    body: JSON.stringify({ command, cwd }),
  });
}
