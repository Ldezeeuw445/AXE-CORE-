import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

/**
 * [MAC:] — hand a job to the Claude Code session on Luka's Mac Mini.
 *
 * The Claude app on iOS and Android talks to Anthropic, not to the Claude Code
 * installed on the Mac, and the Mac's bridge is loopback-only. So "a session on
 * my computer that I can reach from my phone" had no route from either phone.
 *
 * Both ends reach Supabase, so this writes a core_tasks row with capability
 * 'claude_local' and waits. `infra/claude-local-worker` on the Mac claims it,
 * runs the prompt there, and writes the answer back. Nothing is exposed: no
 * inbound port, nothing on the LAN, and it works from anywhere with signal.
 *
 * Being a chat tool rather than a phone feature is the point — it works from
 * every AXE CORE surface, including Safari on the iPhone, which cannot install
 * the Android app at all.
 */
export const MAC_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'mac_run',
    marker: 'MAC',
    shortForm: '[MAC:]',
    gate: 'approval',
    approvalKind: 'agent',
    pattern: /\[MAC:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[MAC:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `💻 **Ask the Mac** (needs approval):
\`[MAC: {"prompt":"read AXE_PROGRESS.md and tell me the last entry"}]\`

Runs in a real Claude Code session on Luka's Mac Mini, in the AXE CORE
worktree, so it can read the actual files on that machine — not a copy, not a
memory of them. Use it for anything that needs the state of the Mac itself.

It is read-only by default there (Read, Glob, Grep). Editing and shell are off
unless Luka started the worker with AXE_CLAUDE_ALLOW_BASH=1, so do not promise
a file change through this.

Takes 20–60 seconds. If it comes back saying the worker is not running, say
exactly that — it means the process on the Mac is stopped, not that the
request was wrong.`,
  },
];
