/**
 * toolRegistry.browser.ts — [BROWSER_AGENT:] as a chat tool.
 * Same engine as the Browser page's own panel (runBrowserAgentLoop), now
 * reachable from the main AXE chat too, not just after navigating to a
 * separate tab.
 */
import { TOOL_CATALOG, type ToolCatalogEntry, type ApprovalKind } from '@/domain/tools/toolCatalog';
import type { KeySlot } from '@/domain/providers';
import { runBrowserAgentLoop } from '@/application/agents/browserAgentLoop';
import { browserAgentStart, browserAgentClose } from '@/infrastructure/gateways/axeCoreApiService';

export interface BrowserAgentToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: { requestApproval: (kind: ApprovalKind, title: string, detail: string) => Promise<boolean> }) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.browser: no catalog entry for '${id}'`);
  return entry;
}

// application/ doesn't import the presentation-layer voiceStore — read the
// same localStorage keys it persists to directly instead (same pattern as
// conversationReviewService.ts's loadKeySlot).
function loadKeySlot(name: string): KeySlot | null {
  try {
    const raw = localStorage.getItem(name);
    return raw ? (JSON.parse(raw) as KeySlot) : null;
  } catch {
    return null;
  }
}

function loadConfiguredSlots(): KeySlot[] {
  return [
    loadKeySlot('axe_slot_primary'),
    loadKeySlot('axe_slot_fallback1'),
    loadKeySlot('axe_slot_fallback2'),
    loadKeySlot('axe_slot_fallback3'),
  ].filter((s): s is KeySlot => !!s?.key);
}

export const BROWSER_AGENT_TOOL_RUNTIMES: BrowserAgentToolRuntime[] = [
  {
    ...catalogEntry('browser_agent'),
    available: () => true,
    run: async (instruction) => {
      const slots = loadConfiguredSlots();
      if (slots.length === 0) {
        return 'BROWSER_AGENT failed: no AI provider configured — go to Settings → Provider Keys first.';
      }

      let sessionId: string;
      try {
        ({ session_id: sessionId } = await browserAgentStart());
      } catch (err) {
        return `BROWSER_AGENT failed: could not start a browser session — ${err instanceof Error ? err.message : String(err)}`;
      }

      const log: string[] = [];
      try {
        await runBrowserAgentLoop(instruction, sessionId, slots, {
          onTurn: (turn) => {
            const line = turn.message || turn.reasoning;
            if (line) log.push(turn.result?.error ? `${line} (error: ${turn.result.error})` : line);
          },
        });
      } catch (err) {
        log.push(`Stopped early: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        try { await browserAgentClose(sessionId); } catch { /* best-effort cleanup */ }
      }

      return log.length ? log.join('\n') : 'BROWSER_AGENT finished with no reported steps.';
    },
    onError: (msg) => `BROWSER_AGENT failed: ${msg}`,
  },
];
