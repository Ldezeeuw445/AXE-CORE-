#!/usr/bin/env node
/**
 * axe-mac-agent — a shell on the Mac, reachable from the phone.
 *
 * Dials OUT to the relay on the VPS and stays connected, so the phone can
 * reach a shell here without this machine ever opening a port. The relay is
 * only a letterbox; the work happens in this process, in the worktree that is
 * actually being edited rather than the copy the VPS keeps.
 *
 * ## Why a bootstrap runs on every session
 *
 * Luka's question was "how do we make sure it always does a git pull so it is
 * always the right one". Doing it by hand fails the way all by-hand steps
 * fail: fine for a week, then one session is quietly a commit behind and you
 * debug a bug that was fixed yesterday.
 *
 * So each new shell runs AXE_AGENT_BOOTSTRAP before handing over, and the
 * output is shown rather than hidden — if the pull refuses because of local
 * changes, that has to be visible, not swallowed into a prompt that looks
 * normal. It is `--ff-only` by default: a pull that could rewrite local work
 * is not something a terminal should do on your behalf while you watch.
 *
 * Run:  AXE_TUNNEL_TOKEN=... node infra/axe-mac-tunnel/agent.cjs
 */
const WebSocket = require('ws');
const { spawn } = require('child_process');
const os = require('os');

const RELAY = process.env.AXE_TUNNEL_URL
  ?? 'wss://api.axecompanion.com/mac-terminal/agent';
const TOKEN = process.env.AXE_TUNNEL_TOKEN ?? '';
const CWD = process.env.AXE_AGENT_CWD
  ?? '/Volumes/EagetSSD/AXE-CORE-/.kilo/worktrees/unequaled-louse/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS';
const SHELL_BIN = process.env.AXE_AGENT_SHELL || process.env.SHELL || 'zsh';

/**
 * Run before every session. `--ff-only` so it can never rewrite local work,
 * and `git status -sb` after it so the first thing on screen is the truth
 * about where this checkout stands.
 */
const BOOTSTRAP = process.env.AXE_AGENT_BOOTSTRAP
  ?? 'git pull --ff-only 2>&1 | tail -3; git status -sb | head -1';

if (!TOKEN) {
  console.error('refusing to start: AXE_TUNNEL_TOKEN is not set');
  process.exit(1);
}

/** sessionId -> child process */
const shells = new Map();
let ws = null;
let backoff = 1000;

function connect() {
  const url = `${RELAY}?token=${encodeURIComponent(TOKEN)}`;
  ws = new WebSocket(url);

  ws.on('open', () => {
    backoff = 1000;
    console.log(`[agent] connected to relay as ${os.hostname()}`);
    console.log(`[agent] shell: ${SHELL_BIN}   cwd: ${CWD}`);
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const { session, type, data } = msg;

    if (type === 'open') return openSession(session);
    if (type === 'input') {
      const sh = shells.get(session);
      if (sh?.stdin.writable) sh.stdin.write(data);
      return;
    }
    if (type === 'close') {
      const sh = shells.get(session);
      shells.delete(session);
      try { sh?.kill(); } catch { /* ignore */ }
    }
  });

  const retry = () => {
    for (const [, sh] of shells) { try { sh.kill(); } catch { /* ignore */ } }
    shells.clear();
    // Backing off rather than hammering: the relay being down usually means
    // the VPS is restarting, and a tight loop turns that into a second
    // problem.
    console.log(`[agent] disconnected — retrying in ${backoff / 1000}s`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  };
  ws.on('close', retry);
  ws.on('error', (e) => console.log(`[agent] socket error: ${e.message}`));
}

function send(session, type, data) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ session, type, data }));
  }
}

function openSession(session) {
  const sh = spawn(SHELL_BIN, ['-l'], {
    cwd: CWD,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
  });
  shells.set(session, sh);

  sh.stdout.on('data', (b) => send(session, 'output', b.toString()));
  sh.stderr.on('data', (b) => send(session, 'output', b.toString()));
  sh.on('exit', (code) => {
    shells.delete(session);
    send(session, 'exit', code ?? -1);
  });
  sh.on('error', (e) => send(session, 'output', `\r\n[shell error: ${e.message}]\r\n`));

  // Announce where this is, then bring the checkout up to date. Written into
  // the shell rather than run separately so its output lands in the same
  // stream the user is watching.
  send(session, 'output', `\r\n[AXE mac agent — ${os.hostname()}]\r\n`);
  if (BOOTSTRAP && sh.stdin.writable) sh.stdin.write(`${BOOTSTRAP}\n`);
}

connect();

process.on('SIGINT', () => {
  console.log('\n[agent] shutting down');
  for (const [, sh] of shells) { try { sh.kill(); } catch { /* ignore */ } }
  try { ws?.close(); } catch { /* ignore */ }
  process.exit(0);
});
