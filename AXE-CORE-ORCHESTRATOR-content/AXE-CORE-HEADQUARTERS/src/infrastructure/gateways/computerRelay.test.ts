import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Worker self-recovery must be genuinely bounded, and cancellation must be
 * genuinely conditional on the task still being pending.
 *
 * Both are new behaviour added so `[COMPUTER_RUN:]` can bring back a stopped
 * `com.axe.computer-worker` via its existing launchd agent instead of just
 * failing. The risk with "self-heal" code is always the same: does it retry
 * exactly once and stop, or does a broken worker make it loop silently and
 * eat a chat turn? These tests pin that down with fake timers rather than
 * waiting out the real ~20s bound.
 */

let workersRows: Array<{ device_id: string; host: string; workspaces: string[]; heartbeat_at: string }> = [];
let cancelRow: { id: string } | null = null;
let cancelError: { message: string } | null = null;

function builder(kind: 'workers' | 'tasks') {
  const result = () => {
    if (kind === 'workers') return Promise.resolve({ data: workersRows, error: null });
    return Promise.resolve({ data: cancelRow, error: cancelError });
  };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'gt', 'eq', 'update', 'insert']) {
    chain[m] = () => chain;
  }
  chain.maybeSingle = result;
  // onlineDevices() awaits the .gt(...) call directly (no .maybeSingle()),
  // so the chain itself must be thenable too.
  (chain as { then: PromiseLike<unknown>['then'] }).then = (...args) => result().then(...args);
  return chain;
}

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({
  getSupabase: () => ({
    from: (table: string) => builder(table === 'core_computer_workers' ? 'workers' : 'tasks'),
  }),
}));

const workerDienstStand = vi.fn();
const workerDienstHerstart = vi.fn();
vi.mock('@/infrastructure/gateways/launchdWorkers', () => ({
  beschikbaar: () => true,
  workerDienstStand: (...a: unknown[]) => workerDienstStand(...a),
  workerDienstHerstart: (...a: unknown[]) => workerDienstHerstart(...a),
}));

const { attemptLocalWorkerRecovery, cancelTask } = await import('@/infrastructure/gateways/computerRelay');

beforeEach(() => {
  workersRows = [];
  cancelRow = null;
  cancelError = null;
  workerDienstStand.mockReset().mockResolvedValue({ id: 'computer-worker', label: 'com.axe.computer-worker', running: false, detail: '' });
  workerDienstHerstart.mockReset().mockResolvedValue('com.axe.computer-worker herstart via launchd.');
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

describe('attemptLocalWorkerRecovery', () => {
  it('kickstarts exactly once and reports success once a heartbeat appears', async () => {
    const p = attemptLocalWorkerRecovery();
    // First poll finds nothing yet, second poll finds the worker back.
    await vi.advanceTimersByTimeAsync(4_000);
    workersRows = [{ device_id: 'mac-mini', host: 'mac-mini', workspaces: ['AXE Core'], heartbeat_at: new Date().toISOString() }];
    await vi.advanceTimersByTimeAsync(4_000);

    const outcome = await p;
    expect(outcome.recovered).toBe(true);
    expect(workerDienstHerstart).toHaveBeenCalledTimes(1);
  });

  it('gives up after the bounded window without ever kickstarting a second time', async () => {
    const p = attemptLocalWorkerRecovery();
    await vi.advanceTimersByTimeAsync(4_000 * 5);

    const outcome = await p;
    expect(outcome.recovered).toBe(false);
    expect(outcome.detail).toMatch(/real failure/);
    expect(workerDienstHerstart).toHaveBeenCalledTimes(1);
  });

  it('fails fast without polling when launchd itself refuses the kickstart', async () => {
    workerDienstHerstart.mockRejectedValue(new Error('label not loaded'));
    const outcome = await attemptLocalWorkerRecovery();
    expect(outcome.recovered).toBe(false);
    expect(outcome.detail).toMatch(/kickstart failed/);
  });

  it('never attempts a kickstart when the launchd label cannot be found on this machine', async () => {
    workerDienstStand.mockResolvedValue(null);
    const outcome = await attemptLocalWorkerRecovery();
    expect(outcome.recovered).toBe(false);
    expect(workerDienstHerstart).not.toHaveBeenCalled();
  });
});

describe('cancelTask', () => {
  it('cancels a task that is still pending', async () => {
    cancelRow = { id: 'task-1' };
    const outcome = await cancelTask('task-1');
    expect(outcome.cancelled).toBe(true);
  });

  it('reports nothing changed once a worker already claimed the task', async () => {
    cancelRow = null;
    const outcome = await cancelTask('task-1');
    expect(outcome.cancelled).toBe(false);
    expect(outcome.detail).toMatch(/no longer pending/);
  });
});
