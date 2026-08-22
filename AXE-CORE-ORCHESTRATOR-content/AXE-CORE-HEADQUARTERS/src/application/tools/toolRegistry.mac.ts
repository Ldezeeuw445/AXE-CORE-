/**
 * toolRegistry.mac — [MAC:] as a chat tool.
 *
 * Writes a core_tasks row the Mac's worker polls for, then waits for it to be
 * answered. The waiting is the awkward part and worth being explicit about:
 * there is no push channel here, so this polls, and every branch below exists
 * because a silent wrong answer is worse than a slow right one.
 */
import { TOOL_CATALOG, type ToolCatalogEntry, type ApprovalKind } from '@/domain/tools/toolCatalog';
import '@/domain/tools/registerMacCatalog';
import { sbInsertRow, sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';

export interface MacToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: { requestApproval: (kind: ApprovalKind, title: string, detail: string) => Promise<boolean> }) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.mac: no catalog entry for '${id}'`);
  return entry;
}

interface TaskRow {
  id: string;
  status: string;
  result: { text?: string } | null;
  error: unknown;
  worker_id: string | null;
}

/** How long to wait before giving up. A turn on the Mac is usually 20–40s. */
const MAX_WAIT_MS = 180_000;
const POLL_MS = 3_000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function errorText(err: unknown): string {
  if (!err) return 'no reason given';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; code?: string };
  return e.message ?? e.code ?? JSON.stringify(err).slice(0, 300);
}

export const MAC_TOOL_RUNTIMES: MacToolRuntime[] = [
  {
    ...catalogEntry('mac_run'),
    available: () => true,
    run: async (raw, ctx) => {
      let prompt: string;
      try {
        prompt = String((JSON.parse(raw) as { prompt?: string }).prompt ?? '').trim();
      } catch {
        return 'MAC failed: malformed arguments.';
      }
      if (!prompt) return 'MAC failed: no prompt given.';

      const approved = await ctx.requestApproval(
        'agent',
        'AXE wants to run this on your Mac',
        prompt.slice(0, 300),
      );
      if (!approved) return 'MAC refused: Luka did not approve running this on the Mac.';

      const rows = await sbInsertRow('core_tasks', {
        title: prompt.slice(0, 80),
        goal: prompt,
        status: 'pending',
        capability: 'claude_local',
        source_app: 'axe_core',
        priority: 'medium',
      });
      const id = (rows as unknown as Array<{ id: string }>)[0]?.id;
      if (!id) return 'MAC failed: the task was not created.';

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
          return found.result?.text?.trim() || 'MAC finished but returned no text.';
        }
        if (found.status === 'failed' || found.status === 'cancelled') {
          return `MAC failed on the Mac: ${errorText(found.error)}`;
        }
      }

      // Two very different silences, and the difference is the whole
      // diagnosis: never claimed means the worker is not running; claimed and
      // still going means the prompt is simply long.
      return sawRunning
        ? `MAC timed out after ${MAX_WAIT_MS / 1000}s. The Mac claimed the task and is still working on it — the answer will land in the task list.`
        : 'MAC timed out: the task was never claimed, which means claude-local-worker is not running on the Mac. Start it with `node infra/claude-local-worker/worker.mjs`.';
    },
    onError: (msg) => `Mac relay failed: ${msg}`,
  },
];
