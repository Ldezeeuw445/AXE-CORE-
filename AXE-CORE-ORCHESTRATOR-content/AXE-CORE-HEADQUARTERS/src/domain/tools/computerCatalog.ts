import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';
import { OBSERVE_TOOLS, TOOL_TIERS } from '@/domain/tools/riskTiers';

/**
 * [COMPUTER:] and [COMPUTER_RUN:] — AXE's hands on the machine it is
 * actually about, rather than the VPS in Germany.
 *
 * ## Why two markers and not one
 *
 * The catalog's `gate` is per-entry, and it drives the UI: an `auto` entry
 * runs the moment the model emits it. So a single [COMPUTER:] marker covering
 * both `git.status` and `git.push` would have to be gated as `approval`, and
 * then reading a file would prompt — which trains you to click approve without
 * reading, and an approval you don't read is worse than no approval at all.
 *
 * Splitting on the read/change line keeps the prompts rare and therefore
 * meaningful. [COMPUTER:] is read-only and free; [COMPUTER_RUN:] always
 * pauses, and the card names the tier so a `pnpm test` and a `git push` never
 * look alike.
 *
 * ## Why the model does not choose the tier
 *
 * The marker carries a tool id, never a tier. `tierFor()` resolves it on our
 * side after parsing. A web page that talks AXE into emitting
 * `{"tool":"git.push","tier":"observe"}` gets a push approval card like
 * everyone else, because the `tier` field is not read.
 *
 * ## Why this is not the VPS [EXEC:]
 *
 * [EXEC:] runs on the Strato box, where the blast radius is a server you can
 * rebuild. This runs on the Mac, next to the vault and the SSH key, with
 * Luka's own privileges. The allowlist here is therefore not a convenience —
 * it is the actual boundary, and `terminal.free` (an arbitrary command) sits
 * on the consequential rung for that reason.
 */
export const COMPUTER_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'computer_read',
    marker: 'COMPUTER',
    shortForm: '[COMPUTER:]',
    gate: 'auto',
    pattern: /\[COMPUTER:\s*(\{[^\]]{1,2000}\})\s*\]/,
    stripPattern: /\[COMPUTER:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🖥️ **Look at the Mac** — read-only, runs immediately:
\`[COMPUTER: {"tool":"git.status","workspace":"AXE Core"}]\`

Tools: ${OBSERVE_TOOLS.join(' · ')}

\`files.read\` and \`files.list\` take a \`path\`; \`git.*\` take an optional
\`workspace\` (defaults to the one Luka has selected). \`files.search\` takes a
\`query\`.

Luka has more than one Mac. If the same workspace exists on two machines that
are both online, you will be told to pick one — add \`"device"\` and ask again.
Do not guess: the same repo on two machines is on two different branches
sooner or later, and the wrong machine answers confidently about the wrong
tree.

This is the real state of that machine right now — not a memory of it, not the
VPS. Use it before answering anything about where a repo stands, what is
uncommitted, or what a file currently says.

It cannot change anything. If you need to change something, that is
[COMPUTER_RUN:] and it will ask Luka first. Never claim you changed a file
through this marker.

If it comes back saying the worker is offline, say exactly that — the process
on the Mac is stopped. Do not fall back to guessing what the file said.`,
  },
  {
    id: 'computer_run',
    marker: 'COMPUTER_RUN',
    shortForm: '[COMPUTER_RUN:]',
    gate: 'approval',
    approvalKind: 'local_run',
    pattern: /\[COMPUTER_RUN:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[COMPUTER_RUN:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `⚙️ **Do something on the Mac** (always needs approval):
\`[COMPUTER_RUN: {"tool":"terminal.test","workspace":"AXE Core"}]\`
\`[COMPUTER_RUN: {"tool":"claude_code.run","workspace":"AXE Core","prompt":"..."}]\`

Tools by risk tier — the tier decides how the card looks, and you do not get
to pick it:

  safe          ${Object.keys(TOOL_TIERS).filter(t => TOOL_TIERS[t] === 'safe_execute').join(' · ')}
  write         ${Object.keys(TOOL_TIERS).filter(t => TOOL_TIERS[t] === 'write').join(' · ')}
  consequential ${Object.keys(TOOL_TIERS).filter(t => TOOL_TIERS[t] === 'consequential').join(' · ')}

Every one of these pauses and shows Luka the exact tool, workspace, branch and
effect before the Mac ever sees it. He approves or denies. If he denies, you
are told — accept it, say so plainly, and do not retry the same thing reworded.

Rules that are not yours to bend:
  • never edit on \`orchestrator\` — branch first (\`git.create_branch\`)
  • one agent per worktree; do not start Cursor while Claude holds it
  • commit, push, PR, merge and deploy are each a separate approval
  • the result you get back is the ONLY truth about what happened

Do not ask "zal ik de tests draaien?" in plain text and wait for a reply. Emit
the marker — the approval card IS the question, and it is the one Luka can
actually act on from his phone.`,
  },
];
