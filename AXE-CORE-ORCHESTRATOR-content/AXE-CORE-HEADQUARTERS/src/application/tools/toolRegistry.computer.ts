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
  isDeviceScopedTool,
  type RiskTier,
} from '@/domain/tools/riskTiers';
import {
  dispatchComputerTask,
  resolveWorkspace,
  onlineDevices,
  isTierRemembered,
  attemptLocalWorkerRecovery,
  type ComputerCall,
} from '@/infrastructure/gateways/computerRelay';
import { kiesUit, voorkeurMachine } from '@/infrastructure/persistence/voorkeurMachineService';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { callVision, configuredVisionSlots } from '@/infrastructure/gateways/visionGateway';

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
function describe(call: ParsedCall, scopeName: string, device: { label: string }): string {
  const spec = RISK_TIERS[call.tier];
  const lines = [
    `Tool       ${call.tool}`,
    `Tier       ${spec.label} — ${spec.blurb}`,
    `Machine    ${device.label}`,
    `${isDeviceScopedTool(call.tool) ? 'Scope' : 'Workspace'}  ${scopeName}`,
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


async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read screen capture.'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.readAsDataURL(blob);
  });
}

async function inspectPrivateImage(
  meta: { bucket: string; path: string; mime?: string; width?: number; height?: number },
  prompt: unknown,
  systemPrompt: string,
  defaultQuestion: string,
  label: string,
  deleteAfter: boolean,
): Promise<string> {
  const sb = getSupabase();
  if (!sb) return `${label} capture succeeded, but AXE is not signed in so the private image cannot be inspected.`;
  try {
    const { data, error } = await sb.storage.from(meta.bucket).download(meta.path);
    if (error || !data) return `${label} capture could not be downloaded for vision: ${error?.message ?? 'missing image'}`;
    const imageBase64 = await blobToBase64(data);
    const slots = configuredVisionSlots();
    const question = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : defaultQuestion;
    const vision = await callVision(slots, {
      prompt: question,
      imageBase64,
      mimeType: meta.mime ?? 'image/jpeg',
      systemPrompt,
    });
    const size = meta.width && meta.height ? ` (${meta.width}×${meta.height})` : '';
    return `${label}${size}:\n${vision.text}`;
  } finally {
    if (deleteAfter) {
      // Screen captures are sensitive and transient. Best-effort delete as soon
      // as vision has consumed them; never leave a public URL or task-row blob.
      await sb.storage.from(meta.bucket).remove([meta.path]).catch(() => {});
    }
  }
}

async function groundScreenObservation(raw: string, prompt: unknown): Promise<string> {
  let meta: { bucket?: string; path?: string; mime?: string; width?: number; height?: number };
  try { meta = JSON.parse(raw); } catch { return `SCREEN capture returned invalid metadata: ${raw.slice(0, 300)}`; }
  if (!meta.bucket || !meta.path) return 'SCREEN capture returned no private storage location.';
  return inspectPrivateImage(
    { bucket: meta.bucket, path: meta.path, mime: meta.mime ?? 'image/png', width: meta.width, height: meta.height },
    prompt,
    'You are AXE observing Luka\'s CURRENT Mac screen from a newly captured image. Ground every claim in visible pixels. If something is not visible, say that plainly. Give actionable coordinates only when they are visually unambiguous.',
    'Describe the current screen precisely. Read visible text and name the frontmost app/window if clear. Do not infer anything not visible.',
    'CURRENT SCREEN',
    true,
  );
}

async function groundCameraSnapshot(raw: string, prompt: unknown): Promise<string> {
  const bucket = /^bucket\s+(.+)$/mi.exec(raw)?.[1]?.trim();
  const path = /^pad\s+(.+)$/mi.exec(raw)?.[1]?.trim();
  if (!bucket || !path) return raw;
  return inspectPrivateImage(
    { bucket, path, mime: 'image/jpeg' },
    prompt,
    'You are AXE looking through Luka\'s selected Mac camera at a newly captured image. Ground every claim in the actual image and do not infer off-camera details.',
    'Describe what the current Mac camera snapshot actually shows.',
    'CURRENT CAMERA',
    false,
  );
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

  const deviceScoped = isDeviceScopedTool(parsed.tool);
  const workspace = deviceScoped ? null : resolveWorkspace(parsed.args.workspace);
  if (!deviceScoped && !workspace) {
    return `COMPUTER refused: '${String(parsed.args.workspace ?? '')}' is not one of Luka's workspaces.`;
  }
  const scopeName = deviceScoped ? 'Personal Computer' : workspace!.name;

  // Which machine. With a Mac Mini and an iMac both able to answer, this
  // cannot be left to whoever polls first: the same workspace name is a
  // different checkout on each, so the wrong machine gives a confidently
  // wrong answer rather than an error.
  let devices = await onlineDevices();
  if (!devices.length) {
    // Bounded self-heal, once, before giving up: the worker is managed by
    // launchd (com.axe.computer-worker), so "not answering" is very often
    // "stopped, and nobody has looked" rather than a real outage. One
    // kickstart + one bounded wait; attemptLocalWorkerRecovery() itself
    // refuses to retry beyond that, so a genuinely broken worker still fails
    // loudly instead of stalling the chat turn.
    const recovery = await attemptLocalWorkerRecovery();
    if (recovery.recovered) {
      devices = await onlineDevices();
    } else {
      return 'COMPUTER failed: no computer worker is running on any of Luka\'s machines, '
           + `so nothing was read or changed. Self-recovery was attempted: ${recovery.detail} `
           + 'Report that outcome plainly — do not answer from memory, and do not retry silently.';
    }
  }
  if (!devices.length) {
    return 'COMPUTER failed: no computer worker is running on any of Luka\'s machines, even after a restart attempt. '
         + 'This needs Luka\'s attention — say so plainly.';
  }

  const asked = String(parsed.args.device ?? '').trim().toLowerCase();
  const able = deviceScoped ? devices : devices.filter(d => d.workspaces.includes(workspace!.name));

  if (!able.length) {
    return deviceScoped
      ? 'COMPUTER failed: no selected/online Mac is available for Personal Computer Use.'
      : `COMPUTER failed: no machine that is currently online has a checkout of '${workspace!.name}'. Online now: ${devices.map(d => d.label).join(', ')}.`;
  }

  let device = able[0];
  /* Luka's gekozen machine, als hij er een heeft en die nu ook online is.
     Zonder dit weigert de regel hieronder bij twee machines te kiezen -- wat
     klopt zolang niemand het antwoord gegeven heeft, maar het antwoord is
     gegeven: het staat in de instellingen. Een expliciete `device` in de
     aanroep wint er nog steeds van; dat is het model dat iets specifieks wil. */
  const voorkeur = kiesUit(able, await voorkeurMachine().catch(() => null));
  if (voorkeur) device = voorkeur;

  if (asked) {
    const match = able.find(d => d.id.toLowerCase() === asked || d.label.toLowerCase() === asked);
    if (!match) {
      return deviceScoped
        ? `COMPUTER failed: '${asked}' is not an online Mac. Available: ${able.map(d => d.label).join(', ')}.`
        : `COMPUTER failed: '${asked}' is not online with '${workspace!.name}'. Available: ${able.map(d => d.label).join(', ')}.`;
    }
    device = match;
  } else if (!voorkeur && able.length > 1) {
    // Ambiguity is not something to resolve by guessing. Two machines with
    // the same repo will be on different branches sooner or later, and
    // picking one silently is how you get an answer about the wrong tree.
    return `COMPUTER needs to know which machine: ${able.map(d => d.label).join(' or ')}. `
         + 'Add "device" to the arguments and ask again.';
  }

  if (!readOnly) {
    const trustScope = deviceScoped ? `@device:${device.id}` : workspace!.name;
    const remembered = await isTierRemembered(parsed.tier, trustScope);
    if (needsApproval(parsed.tool, remembered)) {
      const spec = RISK_TIERS[parsed.tier];
      const approved = await ctx.requestApproval(
        parsed.tier === 'consequential' ? 'local_write' : 'local_run',
        `AXE wants to ${spec.label.toLowerCase()} on ${device.label}`,
        describe(parsed, scopeName, device),
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
    workspace: deviceScoped ? '@device' : workspace!.name,
    device: device.id,
    args: parsed.args,
  };

  const r = await dispatchComputerTask(call);
  if (!r.ok) return `COMPUTER: ${r.text}`;
  if (parsed.tool === 'screen.observe') {
    return groundScreenObservation(r.text, parsed.args.prompt);
  }
  if (parsed.tool === 'camera.snapshot') {
    return groundCameraSnapshot(r.text, parsed.args.prompt);
  }
  return r.text;
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
