#!/usr/bin/env node
/**
 * claude-local-worker — a Claude Code session on the Mac, reachable from the phone.
 *
 * What Luka asked for: "een sessie die lokaal op me computer is maar waar ik
 * op me telefoon bij kan." The Claude app on Android cannot do that — it talks
 * to Anthropic, not to the Claude Code running on this Mac. And the Mac's
 * bridge is loopback-only by design, so the phone cannot reach it either.
 *
 * ## Why a relay instead of opening a port
 *
 * Both ends already reach Supabase. So the phone writes a row and this worker
 * picks it up: no inbound port on the Mac, nothing exposed to the LAN, works
 * from anywhere the phone has signal — a café, not just the home wifi. It also
 * reuses `core_tasks`, which already has leases, attempts and results; a second
 * queue would have been a worse copy of it.
 *
 *   phone → core_tasks(capability='claude_local', status='pending')
 *   here  ← claims it, runs `claude -p`, writes result back
 *   phone ← reads status='completed'
 *
 * ## Continuity
 *
 * `--continue` resumes the newest session in CWD, so consecutive prompts are
 * one conversation rather than a series of strangers. That is the "session"
 * half of the request; without it every message would start cold.
 *
 * ## What this deliberately does not do
 *
 * It runs Claude Code with Luka's own privileges. Anything able to write a row
 * to `core_tasks` can therefore make this Mac do work, so:
 *
 *   - it must be started by hand and stops with Ctrl-C
 *   - it runs only inside AXE_CLAUDE_DIR, one directory, not the whole disk
 *   - tools are allowlisted; no arbitrary Bash unless AXE_CLAUDE_ALLOW_BASH=1
 *   - a prompt has a hard timeout, so one bad turn cannot pin a CPU all night
 *
 * Run:
 *   node infra/claude-local-worker/worker.mjs
 */
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/** Read .env without a dependency — the repo has no dotenv at runtime. */
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
const CLAUDE_BIN = env.AXE_CLAUDE_BIN ?? '/opt/homebrew/bin/claude';
const WORK_DIR = resolve(env.AXE_CLAUDE_DIR ?? REPO);
const POLL_MS = Number(env.AXE_CLAUDE_POLL_MS ?? 5000);
const TURN_TIMEOUT_MS = Number(env.AXE_CLAUDE_TIMEOUT_MS ?? 10 * 60_000);
const CAPABILITY = 'claude_local';

/**
 * Tools Claude may use for a prompt that arrived from a phone.
 *
 * Read and search are safe and cover most of what "ask my machine" means.
 * Editing and shell are opt-in because a typo'd prompt from a phone should
 * not be able to rewrite the worktree while nobody is watching the screen.
 */
const ALLOWED_TOOLS = env.AXE_CLAUDE_ALLOW_BASH === '1'
  ? 'Read,Glob,Grep,Bash,Edit,Write'
  : 'Read,Glob,Grep';

const WORKER_ID = `mac-${process.pid}`;

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

/** Oldest pending prompt for this capability, or null. */
async function nextTask() {
  const q = `core_tasks?capability=eq.${CAPABILITY}&status=eq.pending`
    + '&order=created_at.asc&limit=1'
    + '&select=id,goal,title,payload,created_at';
  const res = await sb(q);
  if (!res.ok) throw new Error(`poll failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

/**
 * Claim by moving pending → running, but only if it is STILL pending.
 *
 * The filter is the lock: two workers (a second terminal, a leftover process)
 * race on the same row and exactly one PATCH matches. Without it both would
 * run the same prompt and the second would overwrite the first's answer.
 */
async function claim(id) {
  const res = await sb(`core_tasks?id=eq.${id}&status=eq.pending`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'running',
      worker_id: WORKER_ID,
      started_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) return false;
  return (await res.json()).length > 0;
}

async function finish(id, { ok, text }) {
  await sb(`core_tasks?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: ok ? 'completed' : 'failed',
      result: ok ? { text } : null,
      error: ok ? null : text.slice(0, 4000),
      completed_at: new Date().toISOString(),
    }),
  });
}

/**
 * One turn. `--continue` resumes the newest session in WORK_DIR, so this is a
 * conversation rather than a series of strangers.
 *
 * The first ever run has no session to continue and Claude errors; that is
 * detected and retried once without the flag rather than reported as a
 * failure, because "no previous session" is a normal first message.
 */
function runClaude(prompt, { fresh = false } = {}) {
  const args = [
    '-p', prompt,
    '--allowedTools', ALLOWED_TOOLS,
    ...(fresh ? [] : ['--continue']),
  ];
  return new Promise((res) => {
    execFile(CLAUDE_BIN, args, {
      cwd: WORK_DIR,
      timeout: TURN_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
      env: process.env,
    }, (err, stdout, stderr) => {
      res({
        ok: !err,
        text: String(stdout || '').trim() || String(stderr || err?.message || '').trim(),
        stderr: String(stderr || ''),
      });
    });
  });
}

async function handle(task) {
  const prompt = task.goal || task.title || task.payload?.prompt;
  if (!prompt) {
    await finish(task.id, { ok: false, text: 'task has no prompt (goal, title and payload.prompt all empty)' });
    return;
  }
  console.log(`→ ${String(prompt).slice(0, 80)}`);

  let out = await runClaude(prompt);
  if (!out.ok && /no conversation|no session|could not find/i.test(out.stderr)) {
    console.log('  (no session yet — starting a fresh one)');
    out = await runClaude(prompt, { fresh: true });
  }

  await finish(task.id, out);
  console.log(out.ok ? `← ${out.text.slice(0, 80)}` : `← FAILED: ${out.text.slice(0, 120)}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('refusing to start: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not found in .env');
    process.exit(1);
  }
  if (!existsSync(CLAUDE_BIN)) {
    console.error(`refusing to start: no claude CLI at ${CLAUDE_BIN} (set AXE_CLAUDE_BIN)`);
    process.exit(1);
  }

  console.log(`claude-local-worker as ${WORKER_ID}`);
  console.log(`  claude:   ${CLAUDE_BIN}`);
  console.log(`  dir:      ${WORK_DIR}`);
  console.log(`  tools:    ${ALLOWED_TOOLS}${ALLOWED_TOOLS.includes('Bash') ? '  (shell ENABLED)' : ''}`);
  console.log(`  polling every ${POLL_MS}ms for capability='${CAPABILITY}'`);

  for (;;) {
    try {
      const task = await nextTask();
      if (task && await claim(task.id)) await handle(task);
    } catch (e) {
      // Keep polling: a dropped wifi connection should not end the worker,
      // it should just mean this tick found nothing.
      console.error(`poll error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

main();
