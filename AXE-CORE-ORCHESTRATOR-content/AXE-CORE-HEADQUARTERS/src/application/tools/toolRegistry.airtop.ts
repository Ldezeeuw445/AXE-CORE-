/**
 * toolRegistry.airtop — [AIRTOP:] and [AIRTOP_DO:] as chat tools.
 *
 * Every action opens the window if it is not open yet, so the model cannot
 * strand itself by asking a question before navigating. It also means the
 * Browser tab lights up with whatever AXE is looking at, which is the point:
 * the agent and the human are watching the same page.
 */
import { TOOL_CATALOG, type ToolCatalogEntry, type ApprovalKind } from '@/domain/tools/toolCatalog';
import '@/domain/tools/registerAirtopCatalog';
import {
  airtopOpen, airtopQuery, airtopScrape, airtopClick, airtopType,
  airtopCurrent, type AirtopWindow,
} from '@/infrastructure/gateways/airtopService';

export interface AirtopToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: { requestApproval: (kind: ApprovalKind, title: string, detail: string) => Promise<boolean> }) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.airtop: no catalog entry for '${id}'`);
  return entry;
}

function parseArgs<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/** Tell the Browser tab to show this window. */
function announce(win: AirtopWindow): void {
  window.dispatchEvent(new CustomEvent('axe-airtop-window', { detail: win }));
}

/** The open window, or a freshly opened one — never null. */
async function ensureWindow(url?: string): Promise<AirtopWindow> {
  const existing = airtopCurrent();
  if (existing && !url) return existing;
  const win = await airtopOpen(url ?? 'about:blank');
  announce(win);
  return win;
}

const MAX_TEXT = 6000;

export const AIRTOP_TOOL_RUNTIMES: AirtopToolRuntime[] = [
  {
    ...catalogEntry('airtop_read'),
    available: () => true,
    run: async (raw) => {
      const args = parseArgs<{ action?: string; url?: string; prompt?: string }>(raw);
      if (!args) return 'AIRTOP failed: malformed arguments.';
      const action = args.action ?? 'open';

      if (action === 'open') {
        if (!args.url) return 'AIRTOP open failed: "url" is required.';
        const win = await ensureWindow(args.url);
        const text = await airtopScrape(win).catch(() => '');
        return [
          `AIRTOP opened ${args.url}`,
          text ? `Page text (first ${Math.min(text.length, MAX_TEXT)} chars):\n${text.slice(0, MAX_TEXT)}` : '(no text extracted yet)',
        ].join('\n\n');
      }

      if (action === 'ask') {
        if (!args.prompt) return 'AIRTOP ask failed: "prompt" is required.';
        const win = airtopCurrent();
        if (!win) return 'AIRTOP ask failed: nothing is open — use {"action":"open","url":...} first.';
        return `AIRTOP answer:\n${await airtopQuery(win, args.prompt)}`;
      }

      if (action === 'read') {
        const win = airtopCurrent();
        if (!win) return 'AIRTOP read failed: nothing is open — use {"action":"open","url":...} first.';
        const text = await airtopScrape(win);
        return text
          ? `AIRTOP page text:\n${text.slice(0, MAX_TEXT)}`
          : 'AIRTOP read: the page returned no text.';
      }

      return `AIRTOP failed: unknown action "${action}". Use open, ask or read.`;
    },
    onError: (msg) => `Airtop failed: ${msg}`,
  },

  {
    ...catalogEntry('airtop_act'),
    available: () => true,
    run: async (raw, ctx) => {
      const args = parseArgs<{ action?: string; element?: string; text?: string; enter?: boolean }>(raw);
      if (!args) return 'AIRTOP_DO failed: malformed arguments.';
      const win = airtopCurrent();
      if (!win) return 'AIRTOP_DO failed: nothing is open — use [AIRTOP: {"action":"open","url":...}] first.';

      const action = args.action ?? '';
      const what = action === 'click'
        ? `click "${args.element ?? ''}"`
        : `type ${JSON.stringify(String(args.text ?? '').slice(0, 60))}${args.enter ? ' + Enter' : ''}${args.element ? ` into "${args.element}"` : ''}`;

      if (action !== 'click' && action !== 'type') {
        return `AIRTOP_DO failed: unknown action "${action}". Use click or type.`;
      }
      if (action === 'click' && !args.element) return 'AIRTOP_DO click failed: "element" is required.';
      if (action === 'type' && !args.text) return 'AIRTOP_DO type failed: "text" is required.';

      const approved = await ctx.requestApproval('exec', 'AXE wants to act in the cloud browser', what);
      if (!approved) return `AIRTOP_DO refused: Luka did not approve ${what}.`;

      if (action === 'click') {
        await airtopClick(win, args.element!);
      } else {
        await airtopType(win, args.text!, args.element, Boolean(args.enter));
      }

      // Say what the page looks like afterwards: an action that resolved to
      // the wrong element still returns 200, so the follow-up is the only
      // honest confirmation.
      const after = await airtopQuery(win, 'In one sentence, what does this page show now?').catch(() => '');
      return [`AIRTOP_DO ${what} -> ok`, after && `Now: ${after}`].filter(Boolean).join('\n');
    },
    onError: (msg) => `Airtop action failed: ${msg}`,
  },
];
