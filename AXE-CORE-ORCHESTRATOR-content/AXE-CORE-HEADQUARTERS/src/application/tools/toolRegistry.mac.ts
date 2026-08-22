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
import { askMac } from '@/infrastructure/gateways/macRelayService';

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

      const r = await askMac(prompt);
      return r.ok ? r.text : `MAC: ${r.text}`;
    },
    onError: (msg) => `Mac relay failed: ${msg}`,
  },
];
