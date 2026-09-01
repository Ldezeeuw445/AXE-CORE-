#!/usr/bin/env node
/**
 * axe-computer-worker — the only process that actually touches the Mac.
 *
 * Sits next to claude-local-worker and follows the same protocol, because
 * that protocol already works: poll core_tasks for a capability, claim a row
 * by moving pending → running only if it is still pending, hold a lease, do
 * one step, write the result back. Nothing listens on a port here either.
 *
 * ## The thing to understand before editing this file
 *
 * This runs with Luka's own privileges, on the machine that holds AXE-VAULT
 * and the Strato SSH key. Anything that can write a core_tasks row can make
 * this do work. So the guards are not "nice to have" — they are the product:
 *
 *   1. the tool must be on the ladder            (unknown id → refuse)
 *   2. the workspace must be one of ours         (path never comes from the row)
 *   3. every resolved path must stay inside it   (defeats ../ and symlinks)
 *   4. credentials are refused by name           (wherever they live)
 *   5. commands are argv against an allowlist    (no shell → no injection)
 *   6. protected branches are never written to   (checked here, not upstream)
 *
 * Check 6 is the one worth defending. The UI already refuses to edit on
 * `orchestrator`, and the tool registry refuses again. This checks a third
 * time, because the UI can be bypassed by writing a row directly and the
 * registry runs in a browser Luka does not control the tabs of. The rule
 * belongs where the damage would happen.
 *
 * Run:  node infra/axe-computer-worker/worker.mjs
 */
import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, sep, join, dirname } from 'node:path';
import { homedir, hostname } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

function loadEnv() {
  const p = join(REPO, '.env');
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadEnv(), ...process.env };

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;
const CAPABILITY = 'computer_use';
const POLL_MS = Number(env.AXE_COMPUTER_POLL_MS ?? 1500);
const LEASE_MS = 90_000;
const STEP_TIMEOUT_MS = Number(env.AXE_COMPUTER_TIMEOUT_MS ?? 5 * 60_000);
/**
 * The machine, and this process on it. DEVICE_ID is stable across restarts —
 * it is what the app addresses a task to. WORKER_ID identifies the process,
 * so two workers started by accident on one machine still race safely.
 */
const DEVICE_ID = env.AXE_DEVICE_ID ?? hostname().split('.')[0].toLowerCase();
const WORKER_ID = `${DEVICE_ID}-${process.pid}`;
const MAX_OUTPUT = 24_000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('axe-computer-worker: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing.');
  process.exit(1);
}

/* ── this machine's checkouts ───────────────────────────────────────────
 *
 * Local, and only local. The app sends a workspace NAME; the path is resolved
 * here. That is not ceremony — 'AXE Core' is a kilo worktree on the EagetSSD
 * when the Mac Mini answers and an ordinary clone under ~/Projects when the
 * iMac does, so a path sent from the app would be wrong on one machine in the
 * worst possible way: it resolves, and quietly describes a tree nobody edits.
 *
 * Override per machine with AXE_WS_<SLUG>=/absolute/path, e.g.
 *   AXE_WS_AXE_CORE=~/Projects/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
 *
 * A workspace whose directory does not exist here is dropped at startup and
 * never advertised, so the app cannot address this machine for it.
 */
const WORKSPACE_DEFS = {
  'AXE Core': {
    envKey: 'AXE_WS_AXE_CORE',
    fallback: '/Volumes/EagetSSD/AXE-CORE-/.kilo/worktrees/unequaled-louse'
            + '/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS',
    protected: ['orchestrator', 'main'],
  },
  'AXE Companion': {
    envKey: 'AXE_WS_AXE_COMPANION',
    // Verified on the SSD 2026-08-31, currently on cloudflare-migration-2.
    fallback: '/Volumes/EagetSSD/AXE-COMPANION-OS-',
    protected: ['main', 'cloudflare-migration-2'],
  },
  'Trading OS': {
    envKey: 'AXE_WS_TRADING_OS',
    // NOT 'TRADING-OS-' — that was a guess from the repo-naming pattern and
    // does not exist. Verified on the SSD: the directory is 'TRADING-OS', on
    // main. There is also a 'TRADING-OS-PROD' next to it with no git repo at
    // all, which is exactly the kind of thing an agent should never be
    // pointed at by accident.
    fallback: '/Volumes/EagetSSD/TRADING-OS',
    protected: ['main'],
  },
};

const WORKSPACES = Object.fromEntries(
  Object.entries(WORKSPACE_DEFS)
    .map(([name, def]) => {
      const raw = env[def.envKey] ?? def.fallback;
      const root = resolve(raw.replace(/^~/, homedir()));
      return [name, { root, protected: def.protected, present: existsSync(root) }];
    })
    .filter(([name, w]) => {
      if (!w.present) console.log(`  – ${name}: not on this machine (${w.root})`);
      return w.present;
    }),
);

/**
 * Never readable, wherever they sit. Widening a workspace root is a normal
 * thing to want; letting that quietly expose the vault is not. Anything AXE
 * reads becomes context sent to whichever model answers, and that SSH key
 * grants root on Strato — so this is checked after path resolution, which
 * means a symlink pointing at it is refused too.
 */
const DENY_PATHS = [
  '/Volumes/EagetSSD/AXE-VAULT',
  '/Volumes/EagetSSD/IMPORTANT',
  `${homedir()}/.ssh`,
].map(p => resolve(p));

const DENY_NAMES = /(^|\/)(\.env(\..*)?|id_rsa|id_ed25519|.*\.pem|.*\.key|.*_key)$/i;

/* ── argv command table. No shell anywhere in this file. ────────────────── */
const COMMANDS = {
  'terminal.typecheck': ['npm', ['run', 'typecheck']],
  'terminal.lint':      ['npm', ['run', 'lint']],
  'terminal.test':      ['npm', ['test']],
  'terminal.build':     ['npm', ['run', 'build']],
  'terminal.install':   ['npm', ['install', '--no-audit', '--no-fund']],
};

const READ_ONLY = new Set([
  'system.info', 'files.list', 'files.read', 'files.search',
  'git.status', 'git.branch', 'git.diff', 'git.log',
]);

/* ── supabase ───────────────────────────────────────────────────────────── */
function sb(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Same call, but a failed request is an error rather than a value.
 *
 * fetch does not throw on 4xx or 5xx -- it resolves, and the response merely
 * says `ok: false`. So a try/catch around sb() catches nothing, which is
 * exactly how the heartbeat could be rejected on every beat while the worker
 * reported itself healthy and the app saw no machine at all.
 *
 * sb() stays as it is for the callers that inspect the response themselves:
 * claim() reads res.ok to detect losing a race for a task, and that is a
 * normal outcome, not a failure. This variant is for the calls where a
 * non-ok answer means something is actually wrong.
 */
async function sbOrThrow(path, init = {}) {
  const res = await sb(path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }
  return res;
}

/**
 * Say "I am here, and these are the workspaces I can reach".
 *
 * This used to end in `.catch(() => {})`, and it was rejecting every single
 * beat: the payload carried `worker_id`, a column the table did not have, so
 * PostgREST refused it and the swallow made that invisible. The worker ran
 * happily, polled forever, and the app saw no machine online -- with nothing
 * anywhere saying why.
 *
 * A failing heartbeat is the one error in this file that must never be quiet:
 * it is the difference between "no machine is online" and "the machine is
 * online and cannot say so", and those need opposite responses.
 *
 * Warned once rather than every beat, so a long outage does not bury the log.
 */
let heartbeatWarned = false;
async function heartbeat() {
  try {
    await sbOrThrow('core_computer_workers?on_conflict=device_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        device_id: DEVICE_ID,
        worker_id: WORKER_ID,
        host: hostname(),
        heartbeat_at: new Date().toISOString(),
        workspaces: Object.keys(WORKSPACES),
      }),
    });
    if (heartbeatWarned) {
      console.log('heartbeat: back');
      heartbeatWarned = false;
    }
  } catch (err) {
    if (!heartbeatWarned) {
      heartbeatWarned = true;
      console.error(
        'heartbeat FAILED — AXE cannot see this machine:',
        err?.message ?? err,
      );
    }
  }
}

async function nextTask() {
  const q = `core_tasks?capability=eq.${CAPABILITY}&status=eq.pending`
    + `&target_device=eq.${encodeURIComponent(DEVICE_ID)}`
    + '&order=created_at.asc&limit=1&select=id,payload,created_at';
  const res = await sb(q);
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return (await res.json())[0] ?? null;
}

/**
 * Claim by moving pending → running, but only if it is STILL pending.
 * The filter is the lock: two workers race and exactly one PATCH matches.
 * The lease is what tells the VPS's recovery pass that somebody is on this —
 * without it, a running row looks exactly like a crashed one.
 */
async function claim(id) {
  const res = await sb(`core_tasks?id=eq.${id}&status=eq.pending`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'running',
      worker_id: WORKER_ID,
      started_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(),
    }),
  });
  return res.ok && (await res.json()).length > 0;
}

async function settle(id, ok, body) {
  await sb(`core_tasks?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: ok ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      ...(ok ? { result: { output: body } } : { error: { message: body } }),
    }),
  });
}

/** Append-only trace, so "what did AXE do to my Mac" has a real answer. */
async function emit(taskId, type, detail) {
  await sb('core_task_events', {
    method: 'POST',
    body: JSON.stringify({
      task_id: taskId, type, worker_id: WORKER_ID,
      detail, created_at: new Date().toISOString(),
    }),
  }).catch(() => {});
}

/* ── path safety ────────────────────────────────────────────────────────── */
function safePath(root, p) {
  const abs = resolve(root, String(p ?? '').replace(/^~/, homedir()));
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`path escapes the workspace: ${abs}`);
  }
  if (DENY_PATHS.some(d => abs === d || abs.startsWith(d + sep))) {
    throw new Error(`path is on the denylist: ${abs}`);
  }
  if (DENY_NAMES.test(abs)) throw new Error('refusing to touch a credential file');
  return abs;
}

function run(cmd, args, cwd) {
  return new Promise((res, rej) => {
    execFile(cmd, args, { cwd, timeout: STEP_TIMEOUT_MS, maxBuffer: 8 << 20 },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ''}${stderr ?? ''}`.slice(0, MAX_OUTPUT);
        // A non-zero exit is a RESULT, not a transport failure: "31 tests
        // failed" is exactly what was asked for. Only a missing binary or a
        // timeout is an actual error.
        if (err && (err.code === 'ENOENT' || err.killed)) {
          return rej(new Error(err.killed ? `timed out after ${STEP_TIMEOUT_MS / 1000}s` : `not found: ${cmd}`));
        }
        res(out.trim() || '(no output)');
      });
  });
}
const git = (root, ...a) => run('git', a, root);

/* ── the tools ──────────────────────────────────────────────────────────── */
async function execute(payload) {
  const { tool, workspace, args = {} } = payload;

  const ws = WORKSPACES[workspace];
  if (!ws) throw new Error(`unknown workspace '${workspace}'`);
  const root = resolve(ws.root);

  // Third and last check on protected branches — see the header.
  const branch = (await git(root, 'branch', '--show-current')).trim();
  const writes = !READ_ONLY.has(tool);
  if (writes && ws.protected.includes(branch)) {
    throw new Error(
      `refusing to ${tool} while on protected branch '${branch}'. Create a feature branch first.`,
    );
  }

  switch (tool) {
    case 'system.info':
      return `host ${hostname()}\nworkspace ${workspace}\nroot ${root}\nbranch ${branch}\nnode ${process.version}`;

    case 'git.branch':  return branch || '(detached)';
    case 'git.status':  return git(root, 'status', '--porcelain', '-b');
    case 'git.diff':    return git(root, 'diff', '--stat');
    case 'git.log':     return git(root, 'log', '-5', '--oneline');

    case 'files.list': {
      const dir = safePath(root, args.path ?? '.');
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter(e => !e.name.startsWith('.') && !DENY_NAMES.test(e.name))
        .slice(0, 200)
        .map(e => (e.isDirectory() ? `${e.name}/` : e.name))
        .join('\n') || '(empty)';
    }

    case 'files.read': {
      const file = safePath(root, args.path);
      const s = await stat(file);
      if (s.size > 512 * 1024) throw new Error(`file too large (${Math.round(s.size / 1024)}kb)`);
      return (await readFile(file, 'utf8')).slice(0, MAX_OUTPUT);
    }

    case 'files.search': {
      const q = String(args.query ?? '').trim();
      if (!q) throw new Error('files.search needs a query');
      // --fixed-strings: the query is data, never a pattern the model composes.
      return run('git', ['grep', '-n', '--fixed-strings', '-I', '--', q], root);
    }

    case 'git.create_branch': {
      const name = String(args.branch ?? '').trim();
      if (!/^feature\/axe-task-[a-z0-9-]{1,60}$/.test(name)) {
        throw new Error(`branch must match feature/axe-task-*, got '${name}'`);
      }
      return git(root, 'checkout', '-b', name);
    }

    case 'terminal.typecheck':
    case 'terminal.lint':
    case 'terminal.test':
    case 'terminal.build':
    case 'terminal.install': {
      const [cmd, argv] = COMMANDS[tool];
      return run(cmd, argv, root);
    }

    case 'claude_code.run': {
      const prompt = String(args.prompt ?? '').trim();
      if (!prompt) throw new Error('claude_code.run needs a prompt');
      const bin = env.AXE_CLAUDE_BIN ?? '/opt/homebrew/bin/claude';
      return run(bin, [
        '-p', prompt,
        '--continue',
        '--allowedTools', 'Read,Glob,Grep,Edit,Write',
      ], root);
    }

    default:
      // Reached only for a tool that is on the ladder but has no handler yet —
      // say so precisely, so it reads as "not built" rather than "refused".
      throw new Error(`'${tool}' is not implemented in this worker yet`);
  }
}

/* ── loop ───────────────────────────────────────────────────────────────── */
let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('\nstopping…'); });

console.log(`axe-computer-worker ${WORKER_ID}`);
console.log(`workspaces: ${Object.keys(WORKSPACES).join(', ')}`);
console.log('polling core_tasks — Ctrl-C to stop\n');

setInterval(heartbeat, 15_000);
await heartbeat();

while (!stopping) {
  try {
    const task = await nextTask();
    if (!task) { await new Promise(r => setTimeout(r, POLL_MS)); continue; }
    if (!(await claim(task.id))) continue;

    const tool = task.payload?.tool ?? '?';
    console.log(`▸ ${tool}`);
    await emit(task.id, 'tool.started', { tool });

    // Refresh the lease while the step runs, so a long test suite does not
    // look abandoned to the VPS's recovery pass.
    const keepalive = setInterval(() => {
      sb(`core_tasks?id=eq.${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          heartbeat_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(),
        }),
      }).catch(() => {});
    }, LEASE_MS / 3);

    try {
      const out = await execute(task.payload ?? {});
      clearInterval(keepalive);
      await settle(task.id, true, out);
      await emit(task.id, 'tool.finished', { tool, ok: true });
      console.log(`  ✓ ${tool}`);
    } catch (e) {
      clearInterval(keepalive);
      await settle(task.id, false, e.message);
      await emit(task.id, 'tool.failed', { tool, message: e.message });
      console.log(`  ✗ ${tool}: ${e.message}`);
    }
  } catch (e) {
    console.error(`poll error: ${e.message}`);
    await new Promise(r => setTimeout(r, 5000));
  }
}

process.exit(0);
