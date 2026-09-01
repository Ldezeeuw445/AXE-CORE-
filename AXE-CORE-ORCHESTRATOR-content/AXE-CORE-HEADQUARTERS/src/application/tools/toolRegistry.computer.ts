/**
 * toolRegistry.computer — [COMPUTER:] and [COMPUTER_RUN:] as chat tools.
 *
 * Same shape as toolRegistry.mac: a runtime per catalog entry, with
 * `available()` and `run(raw, ctx)`. The interesting part is the order of
 * checks inside `run`, and each one exists because skipping it produces a
 * specific, quiet failure:
 *
 *   1. parse            — malformed JSON must fail loudly, not run a default
 *   2. tierFor()        — an unclassified tool is refused, never assumed safe
 *   3. workspace        — resolved from OUR list, never from the model's string
 *   4. needsApproval()  — trust is read from the DB, not from the arguments
 *   5. requestApproval  — the card shows the resolved tier, not a claimed one
 *   6. dispatch         — only now does the Mac hear about it
 *
 * The recurring theme: nothing the model writes is trusted as a decision.
 * It picks a tool and some arguments; everything that determines whether the
 * thing is allowed to happen is looked up on this side.
 */
import { TOOL_CATALOG, type ToolCatalogEntry, type ApprovalKind } from '@/domain/tools/toolCatalog';
import '@/domain/tools/registerComputerCatalog';
import {
  RISK_TIERS,
  tierFor,
  needsApproval,
  UnknownToolError,
  type RiskTier,
} from '@/domain/tools/riskTiers';
import {
  dispatchComputerTask,
  resolveWorkspace,
  onlineDevices,
  isTierRemembered,
  type ComputerCall,
} from '@/infrastructure/gateways/computerRelay';

export interface ComputerToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (
    raw: string,
    ctx: { requestApproval: (kind: ApprovalKind, title: string, detail: string) => Promise<boolean> },
  ) => Promise<string>;
  onError?: (msg: string) => string;
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry.computer: no catalog entry for '${id}'`);
  return entry;
}

interface ParsedCall {
  tool: string;
  tier: RiskTier;
  args: Record<string, unknown>;
}

/**
 * Parse and classify. Returns a string on failure so the caller can hand the
 * model a readable reason instead of throwing into the chat loop.
 */
function parse(raw: string): ParsedCall | string {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return 'COMPUTER failed: malformed arguments — send valid JSON.';
  }

  const tool = String(obj.tool ?? '').trim();
  if (!tool) return 'COMPUTER failed: no "tool" given.';

  try {
    // Note the deliberate discard of any `tier` the model may have supplied.
    return { tool, tier: tierFor(tool), args: obj };
  } catch (e) {
    if (e instanceof UnknownToolError) return `COMPUTER refused: ${e.message}`;
    throw e;
  }
}

/** The human-readable body of the approval card. */
function describe(call: ParsedCall, workspace: { name: string }, device: { label: string }): string {
  const spec = RISK_TIERS[call.tier];
  const lines = [
    `Tool       ${call.tool}`,
    `Tier       ${spec.label} — ${spec.blurb}`,
    `Machine    ${device.label}`,
    `Workspace  ${workspace.name}`,
  ];
  if (typeof call.args.path === 'string') lines.push(`File       ${call.args.path}`);
  if (typeof call.args.command === 'string') lines.push(`Command    ${call.args.command}`);
  if (typeof call.args.prompt === 'string') {
    lines.push(`Brief      ${call.args.prompt.slice(0, 200)}`);
  }
  if (call.tier === 'consequential') {
    lines.push('', 'This one leaves the machine or is hard to undo.');
  }
  return lines.join('\n');
}

async function execute(
  raw: string,
  readOnly: boolean,
  ctx: { requestApproval: (kind: ApprovalKind, title: string, detail: string) => Promise<boolean> },
): Promise<string> {
  const parsed = parse(raw);
  if (typeof parsed === 'string') return parsed;

  // A read-only marker may only carry a read-only tool. Emitting
  // [COMPUTER: {"tool":"git.push"}] is the exact shape a prompt injection
  // takes, so it is refused rather than quietly upgraded to an approval.
  if (readOnly && parsed.tier !== 'observe') {
    return `COMPUTER refused: '${parsed.tool}' is ${RISK_TIERS[parsed.tier].label}, not read-only. `
         + 'Use [COMPUTER_RUN:] — it will ask Luka first.';
  }

  const workspace = resolveWorkspace(parsed.args.workspace);
  if (!workspace) {
    return `COMPUTER refused: '${String(parsed.args.workspace ?? '')}' is not one of Luka's workspaces.`;
  }

  // Which machine. With a Mac Mini and an iMac both able to answer, this
  // cannot be left to whoever polls first: the same workspace name is a
  // different checkout on each, so the wrong machine gives a confidently
  // wrong answer rather than an error.
  const devices = await onlineDevices();
  if (!devices.length) {
    return 'COMPUTER failed: no computer worker is running on any of Luka\'s machines, '
         + 'so nothing was read or changed. Say exactly that — do not answer from memory.';
  }

  const asked = String(parsed.args.device ?? '').trim().toLowerCase();
  const able = devices.filter(d => d.workspaces.includes(workspace.name));

  if (!able.length) {
    return `COMPUTER failed: no machine that is currently online has a checkout of `
         + `'${workspace.name}'. Online now: ${devices.map(d => d.label).join(', ')}.`;
  }

  let device = able[0];
  if (asked) {
    const match = able.find(d => d.id.toLowerCase() === asked || d.label.toLowerCase() === asked);
    if (!match) {
      return `COMPUTER failed: '${asked}' is not online with '${workspace.name}'. `
           + `Available: ${able.map(d => d.label).join(', ')}.`;
    }
    device = match;
  } else if (able.length > 1) {
    // Ambiguity is not something to resolve by guessing. Two machines with
    // the same repo will be on different branches sooner or later, and
    // picking one silently is how you get an answer about the wrong tree.
    return `COMPUTER needs to know which machine: ${able.map(d => d.label).join(' or ')}. `
         + 'Add "device" to the arguments and ask again.';
  }

  if (!readOnly) {
    const remembered = await isTierRemembered(parsed.tier, workspace.name);
    if (needsApproval(parsed.tool, remembered)) {
      const spec = RISK_TIERS[parsed.tier];
      const approved = await ctx.requestApproval(
        parsed.tier === 'consequential' ? 'local_write' : 'local_run',
        `AXE wants to ${spec.label.toLowerCase()} on ${device.label}`,
        describe(parsed, workspace, device),
      );
      if (!approved) {
        return `COMPUTER refused: Luka denied '${parsed.tool}'. Nothing ran. `
             + 'Accept that and do not retry it reworded.';
      }
    }
  }

  const call: ComputerCall = {
    tool: parsed.tool,
    tier: parsed.tier,
    workspace: workspace.name,
    device: device.id,
    args: parsed.args,
  };

  const r = await dispatchComputerTask(call);
  return r.ok ? r.text : `COMPUTER: ${r.text}`;
}

export const COMPUTER_TOOL_RUNTIMES: ComputerToolRuntime[] = [
  {
    ...catalogEntry('computer_read'),
    available: () => true,
    run: (raw, ctx) => execute(raw, true, ctx),
    onError: msg => `Computer relay failed: ${msg}`,
  },
  {
    ...catalogEntry('computer_run'),
    available: () => true,
    run: (raw, ctx) => execute(raw, false, ctx),
    onError: msg => `Computer relay failed: ${msg}`,
  },
];
