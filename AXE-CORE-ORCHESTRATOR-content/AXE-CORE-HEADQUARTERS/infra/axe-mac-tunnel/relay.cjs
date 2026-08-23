#!/usr/bin/env node
/**
 * axe-tunnel-relay — the VPS as a letterbox between the phone and the Mac.
 *
 * The Mac holds the real worktree; the VPS holds a copy of the API. So the
 * terminal people actually want is a shell on the Mac — but the Mac sits
 * behind a router with no inbound port, and the bridge it does have is
 * loopback-only on purpose.
 *
 * Polling Supabase, which is how `claude-local-worker` reaches the Mac, is
 * fine for "read that file and answer" and useless for a shell: at a five
 * second tick you type `ls` and wait five seconds per line. A terminal needs a
 * stream.
 *
 * So the Mac dials OUT to this relay and keeps the socket open. The phone
 * dials in. This pipes the two together. No inbound port on the Mac, no LAN
 * dependency, and the latency of a WebSocket rather than a poll.
 *
 *   Mac   --outbound-->  VPS relay  <--inbound--  phone / browser
 *
 * ## Multiplexing
 *
 * One agent socket carries every session, so each frame is tagged with a
 * session id. Without that a second terminal tab would receive the first
 * tab's output — which is worse than not working, because it looks like it
 * works until two things are open.
 *
 * Run: AXE_TUNNEL_TOKEN=... node relay.cjs
 */
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.AXE_TUNNEL_PORT ?? 4023);
const TOKEN = process.env.AXE_TUNNEL_TOKEN ?? '';

if (!TOKEN) {
  console.error('refusing to start: AXE_TUNNEL_TOKEN is not set');
  process.exit(1);
}

/** The single Mac agent, when one is connected. */
let agent = null;
/** sessionId -> client socket. */
const sessions = new Map();

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // Says whether the Mac is actually there. "Configured" is not "answering",
    // and a terminal that silently goes nowhere is the worst version of this.
    res.end(JSON.stringify({ ok: true, agent: !!agent, sessions: sessions.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');

  // Timing-safe: a plain !== leaks the token one character at a time to
  // anyone patient enough to measure, and this one opens a shell.
  const given = Buffer.from(token ?? '');
  const want = Buffer.from(TOKEN);
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
  if (!ok) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (url.pathname.endsWith('/agent')) attachAgent(ws);
    else attachClient(ws);
  });
});

function attachAgent(ws) {
  // Only one Mac. A second connection replaces the first rather than running
  // beside it: two agents would both answer every session and interleave
  // their output into nonsense.
  if (agent) { try { agent.close(4000, 'replaced'); } catch { /* ignore */ } }
  agent = ws;
  console.log('[relay] agent connected');

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const client = sessions.get(msg.session);
    if (!client || client.readyState !== WebSocket.OPEN) return;
    // Unwrapped on the way out, so the browser speaks the same protocol it
    // already speaks to the VPS terminal — the app needs no new client.
    client.send(JSON.stringify({ type: msg.type, data: msg.data }));
    if (msg.type === 'exit') { try { client.close(); } catch { /* ignore */ } }
  });

  const drop = () => {
    if (agent === ws) agent = null;
    console.log('[relay] agent gone');
    for (const [, client] of sessions) {
      try {
        client.send(JSON.stringify({ type: 'output', data: '\r\n[the Mac went away]\r\n' }));
        client.close();
      } catch { /* ignore */ }
    }
    sessions.clear();
  };
  ws.on('close', drop);
  ws.on('error', drop);
}

function attachClient(ws) {
  if (!agent || agent.readyState !== WebSocket.OPEN) {
    // Said plainly rather than hanging: an empty black terminal is
    // indistinguishable from a slow one, and people wait a long time at it.
    ws.send(JSON.stringify({
      type: 'output',
      data: '\r\n[No Mac connected. Start the agent there: node infra/axe-mac-tunnel/agent.cjs]\r\n',
    }));
    setTimeout(() => { try { ws.close(); } catch { /* ignore */ } }, 50);
    return;
  }

  const session = crypto.randomUUID();
  sessions.set(session, ws);
  console.log(`[relay] client ${session.slice(0, 8)} opened`);
  agent.send(JSON.stringify({ session, type: 'open' }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (agent?.readyState === WebSocket.OPEN) {
      agent.send(JSON.stringify({ session, type: msg.type, data: msg.data }));
    }
  });

  const close = () => {
    if (!sessions.delete(session)) return;
    console.log(`[relay] client ${session.slice(0, 8)} closed`);
    if (agent?.readyState === WebSocket.OPEN) {
      agent.send(JSON.stringify({ session, type: 'close' }));
    }
  };
  ws.on('close', close);
  ws.on('error', close);
}

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`axe-tunnel-relay on 127.0.0.1:${PORT} (nginx fronts it)`);
});
