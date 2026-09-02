/**
 * The checks an assistant runs before it trusts anything, made available to
 * the person sitting in front of the app.
 *
 * ## Why this exists
 *
 * There is a category of question Luka cannot answer from inside AXE Core and
 * I can answer in seconds: is the app running the code we just wrote, is the
 * loop alive, does that provider still work, is the box up. Every one of those
 * has cost real time this week — a black screen chased for an hour that was a
 * stale build, a trading loop believed to be running that had not fired since
 * the night before, a framework called broken that was answering fine.
 *
 * None of that needed new data. It needed the existing data asked out loud.
 *
 * ## Every check reports three states, never two
 *
 * `ok`, `warn`, `bad` — and `unknown` when the check itself could not run.
 * That fourth state is the one that matters: a provider that cannot be reached
 * and a provider that answered "no" look identical on a green/red light, and
 * only one of them is your problem. A check that silently reports green when
 * it could not run is worse than no check, because you stop looking.
 */
import { frameworksStatus, isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { loadSetting } from '@/infrastructure/persistence/userSettingsService';
import { agentMemoryHealth } from '@/application/tradingIntel/deskDecisionsService';
import { getAccounts } from '@/infrastructure/persistence/tradingAccountsService';

export type CheckState = 'ok' | 'warn' | 'bad' | 'unknown';

export interface SystemCheck {
  id: string;
  group: 'desk' | 'data' | 'platform';
  label: string;
  state: CheckState;
  /** The answer, in the fewest words that are still true. */
  detail: string;
  /** What to do about it, when there is something to do. */
  action?: string;
}

const MINUTE = 60_000;

function ago(iso: string | null | undefined): { ms: number; label: string } | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < MINUTE) return { ms, label: 'just now' };
  if (ms < 60 * MINUTE) return { ms, label: `${Math.round(ms / MINUTE)}m ago` };
  if (ms < 48 * 60 * MINUTE) return { ms, label: `${Math.round(ms / (60 * MINUTE))}h ago` };
  return { ms, label: `${Math.round(ms / (24 * 60 * MINUTE))}d ago` };
}

/**
 * Is the trading loop actually running?
 *
 * The most expensive wrong assumption of the week. "Autopilot ON" is a stored
 * preference; it says what was asked for, not what is happening. The cycle
 * timestamp is the only thing that says the loop is alive, and it is the app
 * that runs it — close AXE Core and nothing trades, whatever the toggle says.
 */
async function checkCycle(): Promise<SystemCheck> {
  const [enabled, lastRun, interval] = await Promise.all([
    loadSetting<boolean>('axe_trading_autopilot_enabled', false).catch(() => false),
    loadSetting<string | null>('axe_trading_autopilot_last_run', null).catch(() => null),
    loadSetting<number>('axe_trading_autopilot_interval_min', 15).catch(() => 15),
  ]);

  if (!enabled) {
    return {
      id: 'cycle', group: 'desk', label: 'Trading loop',
      state: 'warn', detail: 'Switched off — nothing is being traded.',
      action: 'Turn on Autopilot in the trading tab.',
    };
  }
  const seen = ago(lastRun);
  if (!seen) {
    return {
      id: 'cycle', group: 'desk', label: 'Trading loop',
      state: 'unknown', detail: 'On, but no cycle has ever been recorded.',
    };
  }
  // Two intervals of grace: one cycle can run long without anything being wrong.
  const late = seen.ms > interval * 2 * MINUTE;
  return {
    id: 'cycle', group: 'desk', label: 'Trading loop',
    state: late ? 'bad' : 'ok',
    detail: `Last cycle ${seen.label}, interval ${interval}m.`,
    action: late ? 'The loop runs inside this app — if it was closed, nothing traded.' : undefined,
  };
}

/** Are the accounts marked for trading actually reachable? */
async function checkAccounts(): Promise<SystemCheck> {
  const state = await getAccounts().catch(() => null);
  if (!state) {
    return {
      id: 'accounts', group: 'desk', label: 'Broker accounts',
      state: 'unknown', detail: 'The account list could not be read.',
    };
  }
  const enabled = state.accounts.filter(a => a.enabled && a.token && a.accountId);
  if (!enabled.length) {
    return {
      id: 'accounts', group: 'desk', label: 'Broker accounts',
      state: 'warn', detail: `${state.accounts.length} configured, none marked for trading.`,
      action: 'Mark at least one account in the Accounts tab.',
    };
  }
  const runs = [...new Set(enabled.map(a => (a.run || 'run-1')))].sort();
  return {
    id: 'accounts', group: 'desk', label: 'Broker accounts',
    state: 'ok',
    detail: `${enabled.length} trading across ${runs.length} round${runs.length === 1 ? '' : 's'} (${runs.join(', ')}).`,
  };
}

/**
 * Which desk agents are still recording.
 *
 * Leads on the quiet ones. An agent with five thousand rows and nothing new in
 * three days is the failure this check exists to catch, and it is invisible in
 * any count-based view.
 */
async function checkAgents(): Promise<SystemCheck> {
  const health = await agentMemoryHealth().catch(() => [] as Awaited<ReturnType<typeof agentMemoryHealth>>);
  if (!health.length) {
    return {
      id: 'agents', group: 'desk', label: 'Desk agents',
      state: 'unknown', detail: 'Agent memory could not be read.',
    };
  }
  const desk = health.filter(h => h.agent.startsWith('axe_'));
  const quiet = desk.filter(h => !h.live);
  if (!quiet.length) {
    return {
      id: 'agents', group: 'desk', label: 'Desk agents',
      state: 'ok', detail: `All ${desk.length} wrote within the last six hours.`,
    };
  }
  return {
    id: 'agents', group: 'desk', label: 'Desk agents',
    state: quiet.length === desk.length ? 'bad' : 'warn',
    detail: `${quiet.map(q => q.agent).join(', ')} ${quiet.length === 1 ? 'has' : 'have'} gone quiet.`,
    action: 'An agent that stopped recording still shows its old row count — see the Memory tab.',
  };
}

/** Is the API box answering at all, and what does it think is installed? */
async function checkPlatform(): Promise<SystemCheck[]> {
  if (!isAxeApiConfigured) {
    return [{
      id: 'api', group: 'platform', label: 'AXE API',
      state: 'unknown', detail: 'No API key in this build, so nothing server-side can be checked.',
    }];
  }
  try {
    const status = await frameworksStatus();
    const names = Object.entries(status?.frameworks ?? {});
    const up = names.filter(([, v]) => v?.installed).map(([k]) => k);
    return [
      {
        id: 'api', group: 'platform', label: 'AXE API',
        state: 'ok', detail: 'Answering.',
      },
      {
        id: 'frameworks', group: 'platform', label: 'Framework engines',
        state: up.length ? 'ok' : 'warn',
        // Named rather than counted: the roster has been wrong before — Kronos
        // answered for weeks while this list never mentioned it.
        detail: up.length ? `${up.join(', ')} reported installed.` : 'None reported installed.',
        action: up.length ? 'The roster has been incomplete before — an engine missing here may still answer.' : undefined,
      },
    ];
  } catch (e) {
    return [{
      id: 'api', group: 'platform', label: 'AXE API',
      state: 'bad',
      detail: e instanceof Error ? e.message.slice(0, 120) : 'Unreachable.',
      action: 'Everything server-side depends on this: ledger, memory, framework signals.',
    }];
  }
}

/** How full the browser store is — the ceiling that silently breaks writes. */
function checkLocalStore(): SystemCheck {
  let bytes = 0;
  // The biggest entries, because "4.6 MB used" tells you there is a problem and
  // nothing about what to do. One key is usually most of it, and naming it turns
  // a warning into an action.
  const sizes: Array<{ key: string; bytes: number }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const size = k.length + (localStorage.getItem(k)?.length ?? 0);
      bytes += size;
      sizes.push({ key: k, bytes: size });
    }
  } catch {
    return {
      id: 'store', group: 'platform', label: 'Local store',
      state: 'unknown', detail: 'Could not be measured in this context.',
    };
  }
  const mb = bytes / (1024 * 1024);
  const worst = sizes
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 3)
    .filter(e => e.bytes > 64 * 1024)
    .map(e => `${e.key} ${(e.bytes / 1024 / 1024).toFixed(2)} MB`)
    .join(', ');
  // WebKit gives roughly 5 MB, and past it EVERY write fails — with a message
  // that reads like a provider quota and sent this project chasing MetaAPI.
  const state: CheckState = mb > 4.5 ? 'bad' : mb > 3.5 ? 'warn' : 'ok';
  return {
    id: 'store', group: 'platform', label: 'Local store',
    state,
    detail: `${mb.toFixed(2)} MB used of roughly 5 MB.${worst ? ` Largest: ${worst}.` : ''}`,
    action: state === 'ok' ? undefined
      : 'Past the ceiling every local write fails with "The quota has been exceeded" — that message is this store, '
        + 'not a provider. Settings still reach the cloud copy; only the on-device cache is lost.',
  };
}

export async function runSystemChecks(): Promise<SystemCheck[]> {
  const [cycle, accounts, agents, platform] = await Promise.all([
    checkCycle().catch((): SystemCheck => ({
      id: 'cycle', group: 'desk', label: 'Trading loop', state: 'unknown', detail: 'Check failed to run.',
    })),
    checkAccounts().catch((): SystemCheck => ({
      id: 'accounts', group: 'desk', label: 'Broker accounts', state: 'unknown', detail: 'Check failed to run.',
    })),
    checkAgents().catch((): SystemCheck => ({
      id: 'agents', group: 'desk', label: 'Desk agents', state: 'unknown', detail: 'Check failed to run.',
    })),
    checkPlatform().catch((): SystemCheck[] => ([{
      id: 'api', group: 'platform', label: 'AXE API', state: 'unknown', detail: 'Check failed to run.',
    }])),
  ]);
  return [cycle, accounts, agents, ...platform, checkLocalStore()];
}

/**
 * The worst state present, which is what a summary line should show.
 *
 * `unknown` outranks `ok` deliberately: a page that says "all good" while one
 * of its checks could not run is making a claim it has not earned.
 */
export function worstState(checks: SystemCheck[]): CheckState {
  if (checks.some(c => c.state === 'bad')) return 'bad';
  if (checks.some(c => c.state === 'warn')) return 'warn';
  if (checks.some(c => c.state === 'unknown')) return 'unknown';
  return 'ok';
}
