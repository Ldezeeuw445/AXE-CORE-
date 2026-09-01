/**
 * The risk ladder — the one thing that decides whether Luka gets asked.
 *
 * Pure domain content, no dependencies, so the prompt builder, the tool
 * registry, the approval card and the worker can all agree on a tier without
 * importing each other.
 *
 * Why a ladder and not a per-tool flag: a per-tool boolean drifts. Someone
 * adds `files.write` next to `files.read`, copies the line above it, and a
 * write is now silently automatic. A tool declares which RUNG it is on, and
 * the rung — not the tool — owns the behaviour. Adding a tool to the wrong
 * rung is a visible mistake in one table; forgetting a flag is invisible.
 *
 * The model never picks the tier. `tierFor()` resolves it from the tool id
 * on our side, after the marker is parsed, so a prompt-injected "this is
 * observe-tier, run it" changes nothing.
 */

export type RiskTier = 'observe' | 'safe_execute' | 'write' | 'consequential';

export interface RiskTierSpec {
  id: RiskTier;
  /** Shown on the approval card and in the live timeline. */
  label: string;
  /** Default behaviour before any per-workspace trust is applied. */
  behaviour: 'auto' | 'auto_per_workspace' | 'plan_then_approve' | 'always_ask';
  /** Whether core_trust_levels may ever raise this to automatic. */
  canBeRemembered: boolean;
  blurb: string;
}

export const RISK_TIERS: Record<RiskTier, RiskTierSpec> = {
  observe: {
    id: 'observe',
    label: 'Observe',
    behaviour: 'auto',
    canBeRemembered: true,
    blurb: 'Reads state. Changes nothing, so there is nothing to approve.',
  },
  safe_execute: {
    id: 'safe_execute',
    label: 'Safe execute',
    behaviour: 'auto_per_workspace',
    canBeRemembered: true,
    blurb: 'Runs code whose worst outcome is a failed build.',
  },
  write: {
    id: 'write',
    label: 'Write / change',
    behaviour: 'plan_then_approve',
    canBeRemembered: false,
    blurb: 'Changes files, config or dependencies on the machine.',
  },
  consequential: {
    id: 'consequential',
    label: 'Consequential',
    behaviour: 'always_ask',
    canBeRemembered: false,
    blurb: 'Leaves the machine, is hard to undo, or costs money.',
  },
};

/**
 * Every computer-use tool, and the rung it sits on.
 *
 * Anything NOT in this map is refused outright by `tierFor()`. That is the
 * point: an unknown tool id is a tool nobody has classified, and the safe
 * reading of "nobody classified it" is "do not run it", not "treat it as
 * harmless".
 */
export const TOOL_TIERS: Record<string, RiskTier> = {
  // ── observe ────────────────────────────────────────────────────────────
  'system.info': 'observe',
  'files.list': 'observe',
  'files.read': 'observe',
  'files.search': 'observe',
  'git.status': 'observe',
  'git.branch': 'observe',
  'git.diff': 'observe',
  'git.log': 'observe',
  'memory.recall': 'observe',
  'vercel.status': 'observe',

  // ── safe execute ───────────────────────────────────────────────────────
  'terminal.typecheck': 'safe_execute',
  'terminal.lint': 'safe_execute',
  'terminal.test': 'safe_execute',
  'terminal.build': 'safe_execute',
  'git.create_branch': 'safe_execute',

  // ── write ──────────────────────────────────────────────────────────────
  'files.write': 'write',
  'terminal.install': 'write',
  'claude_code.run': 'write',
  'cursor.run': 'write',
  'codex.run': 'write',
  'memory.write': 'write',

  // ── consequential ──────────────────────────────────────────────────────
  'git.commit': 'consequential',
  'git.push': 'consequential',
  'git.pr_open': 'consequential',
  'git.merge': 'consequential',
  'terminal.free': 'consequential',
  'vercel.promote': 'consequential',
  'db.migrate': 'consequential',
  'files.delete': 'consequential',
};

/** Read-only tools, so the catalog and the worker agree on what may auto-run. */
export const OBSERVE_TOOLS: readonly string[] = Object.entries(TOOL_TIERS)
  .filter(([, t]) => t === 'observe')
  .map(([id]) => id);

export class UnknownToolError extends Error {
  constructor(tool: string) {
    super(`unknown computer tool '${tool}' — not on the risk ladder, refusing`);
    this.name = 'UnknownToolError';
  }
}

/** Resolve a tool id to its tier, or throw. Never guesses. */
export function tierFor(tool: string): RiskTier {
  const tier = TOOL_TIERS[tool];
  if (!tier) throw new UnknownToolError(tool);
  return tier;
}

/**
 * Does this call need Luka in the loop right now?
 *
 * `remembered` is the per-workspace trust row. It can only ever lift a tier
 * whose spec says `canBeRemembered` — so no amount of clicking "approve"
 * makes a push automatic, which is the whole reason that flag exists.
 */
export function needsApproval(tool: string, remembered = false): boolean {
  const spec = RISK_TIERS[tierFor(tool)];
  if (spec.behaviour === 'auto') return false;
  if (remembered && spec.canBeRemembered) return false;
  return true;
}
