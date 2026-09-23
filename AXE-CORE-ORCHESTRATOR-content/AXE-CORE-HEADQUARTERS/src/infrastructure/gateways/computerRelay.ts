/**
 * computerRelay — the transport between AXE and the Mac.
 *
 * Deliberately the same trick macRelayService already uses: both ends reach
 * Supabase, so a task is a row, and nothing on the Mac ever listens on a
 * port. That is what makes this work from Safari on the phone in a café
 * rather than only on the home wifi — and it is why the Mac's attack surface
 * for this feature is zero inbound.
 *
 * Reuses `core_tasks` rather than adding a queue. It already has leases,
 * attempts, checkpoints and an event stream; a second table would be a worse
 * copy of it, and the durable-kernel migration already taught the VPS how to
 * recover abandoned rows.
 *
 * The awkward part is the waiting. There is no push channel to the browser
 * here, so this polls. Every branch below exists because a silent wrong
 * answer is worse than a slow right one.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { beschikbaar as tauriBeschikbaar, workerDienstStand, workerDienstHerstart } from '@/infrastructure/gateways/launchdWorkers';
import { buildStamp } from '@/domain/buildStamp';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

/**
 * The repo hands out its client through getSupabase(), which returns null when
 * the app is not signed in. Throwing here rather than returning a silent empty
 * result: a relay that quietly does nothing is the failure this whole session
 * has been about.
 */
function sb() {
  const client = getSupabase();
  if (!client) throw new Error('not signed in — cannot reach the computer relay');
  return client;
}
import type { RiskTier } from '@/domain/tools/riskTiers';

export const COMPUTER_CAPABILITY = 'computer_use';

/** Poll cadence and ceiling. A coding agent turn can legitimately take minutes. */
const POLL_MS = 1_200;
const TIMEOUT_MS = 6 * 60_000;
/** A worker that has not checked in this recently is treated as gone. */
const HEARTBEAT_STALE_MS = 45_000;

export interface Workspace {
  name: string;
  /** Protected branches AXE may never edit on directly. */
  protectedBranches: string[];
}

export interface Device {
  /** Stable id the worker registers itself under. */
  id: string;
  label: string;
  /** Workspace names this machine actually has a checkout of. */
  workspaces: string[];
}

/**
 * The workspaces AXE may touch — names only, deliberately no paths.
 *
 * Paths used to live here. They cannot any more, and the reason is the whole
 * two-machine problem: 'AXE Core' is a kilo worktree on the EagetSSD when the
 * Mac Mini answers, and an ordinary clone under ~/Projects when the iMac
 * does. A single hardcoded root would be wrong on one of them, and wrong in
 * the worst way — it resolves, it just describes a tree nobody is editing.
 *
 * So the app sends a NAME and the worker resolves it against its own local
 * map. That also happens to be the safer arrangement: no path ever travels
 * from the model, or from the browser, to the machine.
 */
export const WORKSPACES: Workspace[] = [
  { name: 'AXE Core',      protectedBranches: ['orchestrator', 'main'] },
  { name: 'AXE Companion', protectedBranches: ['main'] },
  { name: 'Trading OS',    protectedBranches: ['main'] },
];

/**
 * Axon Memory is deliberately absent. ECOSYSTEM.md: it is a standalone
 * product with its own customers on its own Supabase project
 * (ktaditgtbubonrahyiig), and does not belong in the shared database the
 * other three use. It is not a workspace AXE Core operates on.
 */

export function resolveWorkspace(name: unknown): Workspace | null {
  if (name == null || name === '') return WORKSPACES[0];
  const wanted = String(name).trim().toLowerCase();
  return WORKSPACES.find(w => w.name.toLowerCase() === wanted) ?? null;
}

export interface ComputerCall {
  tool: string;
  tier: RiskTier;
  workspace: string;
  /** Which machine must run this. Never left to whoever polls first. */
  device: string;
  args: Record<string, unknown>;
}

export interface ComputerResult {
  ok: boolean;
  text: string;
}

/**
 * Which machines are currently answering.
 *
 * Checked BEFORE queueing, not after, because the failure mode otherwise is
 * the bad one: the row sits pending, the wait times out six minutes later,
 * and the model — having waited — is tempted to answer from memory. Failing
 * in one second with "that Mac is off" keeps that from being tempting.
 *
 * Returns a LIST, not a boolean. With a Mac Mini and an iMac both able to
 * run a worker, "is a worker online" is the wrong question — 'AXE Core' means
 * a different checkout on each, so the answer has to name the machine.
 */
export async function onlineDevices(): Promise<Device[]> {
  const { data, error } = await sb()
    .from('core_computer_workers')
    .select('device_id, host, workspaces, heartbeat_at')
    .gt('heartbeat_at', new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString());

  if (error || !data?.length) return [];
  return data.map(r => ({
    id: r.device_id as string,
    label: (r.host as string) ?? (r.device_id as string),
    workspaces: (r.workspaces as string[]) ?? [],
  }));
}

/** How long to wait for a heartbeat after asking launchd to kickstart the worker. */
const RECOVERY_POLL_MS = 4_000;
const RECOVERY_ATTEMPTS = 5;

export interface RecoveryOutcome {
  recovered: boolean;
  detail: string;
}

/**
 * One bounded attempt to bring the local computer-worker back, via the
 * launchd agent that already manages it — never a second, ad-hoc spawn.
 *
 * Called only from the one place that already knows nobody answered
 * (`onlineDevices()` came back empty). Exactly one kickstart, exactly one
 * poll window: a worker that is fundamentally broken must fail loudly here
 * rather than have this retry forever and hide the problem behind a chat
 * turn that "eventually" answers.
 */
export async function attemptLocalWorkerRecovery(): Promise<RecoveryOutcome> {
  if (!tauriBeschikbaar()) {
    return { recovered: false, detail: 'this build has no local service control (not the desktop app) — cannot self-heal from here.' };
  }

  const before = await workerDienstStand('computer-worker');
  if (before === null) {
    return {
      recovered: false,
      detail: 'could not read the computer-worker launchd status on this machine — either it is not registered here (the worker may live on a different machine), or this is an older build.',
    };
  }

  try {
    await workerDienstHerstart('computer-worker');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { recovered: false, detail: `launchd kickstart failed: ${msg} — this needs a human look, not another automatic retry.` };
  }

  for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, RECOVERY_POLL_MS));
    const devices = await onlineDevices();
    if (devices.length > 0) {
      return { recovered: true, detail: `launchd restarted com.axe.computer-worker and its heartbeat is back (after ~${(attempt + 1) * RECOVERY_POLL_MS / 1000}s).` };
    }
  }

  return {
    recovered: false,
    detail: `launchd kickstart ran (was ${before.running ? 'already reporting running' : 'not running'}) but no heartbeat appeared within ${RECOVERY_ATTEMPTS * RECOVERY_POLL_MS / 1000}s. This is a real failure, not a timing fluke — say so plainly and stop, do not kickstart again.`,
  };
}

/**
 * Cancel a task that has not been claimed yet.
 *
 * The update is conditional on `status=eq.pending`, the same guard
 * worker.mjs's own claim() uses — so this can never race a worker that just
 * picked the row up: either this write lands first and the worker's claim
 * then matches zero rows, or the claim already landed and this matches zero
 * rows instead. Cancelling a task already being executed is out of scope
 * here; that needs the worker itself to poll `cancelled_at`, which it does
 * not do today. Say so via the return value rather than pretending it
 * happened.
 */
export async function cancelTask(id: string): Promise<{ cancelled: boolean; detail: string }> {
  const { data, error } = await sb()
    .from('core_tasks')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) return { cancelled: false, detail: `cancel failed: ${error.message}` };
  if (!data) return { cancelled: false, detail: 'task was no longer pending (already claimed, done, or already cancelled) — nothing changed.' };
  return { cancelled: true, detail: 'task cancelled before any worker claimed it.' };
}

/** Can this device run this workspace right now? */
export async function deviceCanRun(device: string, workspace: string): Promise<boolean> {
  const devices = await onlineDevices();
  const d = devices.find(x => x.id === device);
  return !!d && d.workspaces.includes(workspace);
}

/**
 * Has Luka granted standing permission for this tier in this workspace?
 *
 * Only ever consulted for tiers whose spec allows it; `needsApproval()` is
 * the gate, this is only the lookup. Returns false on any error — a database
 * hiccup must never widen permissions.
 */
export async function isTierRemembered(tier: RiskTier, workspace: string): Promise<boolean> {
  const { data, error } = await sb()
    .from('core_trust_levels')
    .select('auto_approve')
    .eq('category', `computer:${tier}`)
    .eq('workspace', workspace)
    .maybeSingle();

  if (error || !data) return false;
  return data.auto_approve === true;
}

/**
 * Queue one call and wait for the worker to answer it.
 *
 * `execution_mode` mirrors the tier so the VPS's own claim function and the
 * audit log can reason about the row without parsing the payload.
 */
export async function dispatchComputerTask(call: ComputerCall): Promise<ComputerResult> {
  const { data, error } = await sb()
    .from('core_tasks')
    .insert({
      capability: COMPUTER_CAPABILITY,
      status: 'pending',
      source_app: 'axe_core',
      // ECOSYSTEM.md: the shared project holds TWO user ids, and mixing them
      // returns a bare 500 that tells you nothing. core_tasks.requested_by is
      // a uuid column, so it takes AXE_USER_UUID — never the `-axe-core`
      // suffixed AXE_USER_ID, which belongs only to global_memory's text column.
      requested_by: import.meta.env.VITE_AXE_USER_UUID,
          title: `${call.tool} · ${call.workspace} · ${call.device}`,
      goal: call.tool,
      execution_mode: call.tier === 'observe' ? 'read' : 'write',
      // device is a top-level column, not payload, so the worker can filter
      // on it in the poll query instead of claiming a row and then handing
      // it back — a claim-then-release race is exactly how a task ends up
      // bouncing between two machines forever.
      target_device: call.device,
      payload: {
        tool: call.tool,
        tier: call.tier,
        workspace: call.workspace,
        args: call.args,
        // A local packaged AXE app and its local launchd worker are one native
        // runtime contract. The worker fail-closes when these commits differ.
        // Remote web/phone clients deliberately do not require equality.
        client_runtime: isTauriRuntime() ? 'tauri' : 'remote',
        client_build: buildStamp()?.commit ?? null,
      },
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, text: `could not queue the task: ${error?.message ?? 'unknown error'}` };
  }

  return waitFor(data.id as string);
}

async function waitFor(id: string): Promise<ComputerResult> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));

    const { data, error } = await sb()
      .from('core_tasks')
      .select('status, result, error')
      .eq('id', id)
      .maybeSingle();

    // A transient read failure is not an answer. Keep polling; the deadline
    // is the only thing that ends this loop unhappily.
    if (error || !data) continue;

    if (data.status === 'completed' || data.status === 'done') {
      const r = data.result as { output?: string } | null;
      return { ok: true, text: r?.output ?? '(the worker returned nothing)' };
    }
    if (data.status === 'failed' || data.status === 'cancelled') {
      const e = data.error as { message?: string } | null;
      return { ok: false, text: `the Mac reported: ${e?.message ?? data.status}` };
    }
  }

  // Say "unknown", never "failed". The worker may well have finished the work
  // and lost the write; claiming nothing happened would be a guess.
  return {
    ok: false,
    text: 'no answer from the Mac within six minutes — the outcome is unknown. '
        + 'Do not assume it did or did not run; check before retrying.',
  };
}
