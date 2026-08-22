/**
 * macRelayService — one route to the Claude Code session on Luka's Mac.
 *
 * Used by both the chat's fast path and the [MAC:] tool, because the prefix
 * living in only one of them is exactly the bug this was written to fix: Luka
 * typed "mac: ..." into AXE CHAT three times and all three went to Gemini,
 * which cannot read files on his Mac and answered as if it could.
 *
 * The relay itself is a core_tasks row with capability 'claude_local' that
 * `infra/claude-local-worker` on the Mac claims and answers. Nothing is
 * exposed: no inbound port, no LAN, and it works wherever the phone has signal.
 */
import { sbInsertRow, sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';

/**
 * Prefixes that mean "send this to the Mac".
 *
 * Kept in step with LOCAL_PREFIXES in the Android app's AxeCoreRepository and
 * OfflineQueue. Three copies is two too many, but they are three different
 * runtimes that share no code; the comment in each says to change them
 * together.
 */
const PREFIXES = ['mac:', 'mac ', 'claude:', 'claude '];

export interface MacRoute {
  /** The prompt with the prefix stripped. */
  prompt: string;
}

/**
 * Does this message ask for the Mac? Returns the stripped prompt, or null.
 *
 * A bare "mac" with nothing after it is a typo, not a request, and is left to
 * the normal chat — sending it would spend a turn on the Mac being told there
 * was no question in it.
 */
export function detectMacRoute(text: string): MacRoute | null {
  const trimmed = text.trimStart();
  const hit = PREFIXES.find(p => trimmed.toLowerCase().startsWith(p));
  if (!hit) return null;
  const prompt = trimmed.slice(hit.length).trim();
  return prompt ? { prompt } : null;
}

interface TaskRow {
  id: string;
  status: string;
  result: { text?: string } | null;
  error: unknown;
}

const MAX_WAIT_MS = 180_000;
const POLL_MS = 3_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function errorText(err: unknown): string {
  if (!err) return 'no reason given';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; code?: string };
  return e.message ?? e.code ?? JSON.stringify(err).slice(0, 300);
}

export interface AskMacResult {
  ok: boolean;
  text: string;
}

/**
 * Send a prompt to the Mac and wait for the answer.
 *
 * The two timeout branches are the useful part: never claimed means the worker
 * is not running and says so with the command to start it, while claimed and
 * still going means the prompt is simply long and the answer will still land.
 * Collapsing them into one "timed out" throws away the only diagnosis there is.
 */
export async function askMac(prompt: string): Promise<AskMacResult> {
  const rows = await sbInsertRow('core_tasks', {
    title: prompt.slice(0, 80),
    goal: prompt,
    status: 'pending',
    capability: 'claude_local',
    source_app: 'axe_core',
    priority: 'medium',
  });
  const id = (rows as unknown as Array<{ id: string }>)[0]?.id;
  if (!id) return { ok: false, text: 'Could not create the task for the Mac.' };

  const deadline = Date.now() + MAX_WAIT_MS;
  let sawRunning = false;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const found = (await sbGetRows<TaskRow>('core_tasks', {
      limit: 1, filterCol: 'id', filterVal: id,
    }))[0];
    if (!found) continue;
    if (found.status === 'running') sawRunning = true;
    if (found.status === 'completed') {
      return { ok: true, text: found.result?.text?.trim() || '(the Mac returned no text)' };
    }
    if (found.status === 'failed' || found.status === 'cancelled') {
      return { ok: false, text: `The Mac could not do that: ${errorText(found.error)}` };
    }
  }

  return sawRunning
    ? { ok: false, text: 'The Mac is still working on it — the answer will appear in your task list.' }
    : {
      ok: false,
      text: 'The Mac never picked this up, which means claude-local-worker is not running on it. '
        + 'Start it with: node infra/claude-local-worker/worker.mjs',
    };
}
