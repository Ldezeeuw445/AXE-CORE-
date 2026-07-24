#!/usr/bin/env node
/**
 * AXE Terminal Server
 * Run: node terminal-server.cjs
 * WebSocket shell on ws://localhost:4022 (local) or behind nginx on /terminal
 * Each browser connection gets its own persistent zsh session.
 */

const { WebSocketServer, WebSocket } = require('ws');

const { spawn } = require('child_process');
const { createServer } = require('http');
const os = require('os');

const PORT = Number(process.env.AXE_TERMINAL_PORT || 4022);
const HOST = process.env.AXE_TERMINAL_BIND_HOST || '127.0.0.1';
const ALLOWED_ORIGINS = (process.env.AXE_TERMINAL_ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes('*')) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.vercel.app')) return true;
    if (host.endsWith('.axecompanion.com')) return true;
    // The live production domain (www.axeheadquarters.com and apex) — without
    // this the browser's Origin is rejected and the terminal shows
    // "Connection failed" even though the server is up.
    if (host === 'axeheadquarters.com' || host.endsWith('.axeheadquarters.com')) return true;
    return ALLOWED_ORIGINS.some(entry => entry === origin || entry === host || entry === `https://${host}` || entry === `http://${host}`);
  } catch {
    return false;
  }
}

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'ok', port: PORT, time: new Date().toISOString() }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({
  server: httpServer,
  // Allow connections from localhost and the live AXE domains.
  verifyClient: ({ origin }) => {
    return isAllowedOrigin(origin);
  },
});

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2, 7);
  console.log(`[${id}] client connected`);

  // Spawn a new login shell. Default to bash (always present on Ubuntu);
  // override with AXE_TERMINAL_SHELL (e.g. zsh) if you've installed one.
  // `-l` is a login shell for both bash and zsh.
  const SHELL_BIN = process.env.AXE_TERMINAL_SHELL || process.env.SHELL || 'bash';
  const shell = spawn(SHELL_BIN, ['-l'], {
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
    cwd: process.env.WORKSPACE_DIR || os.homedir(),
  });

  const send = (type, data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }));
    }
  };

  shell.stdout.on('data', (buf) => send('output', buf.toString()));
  shell.stderr.on('data', (buf) => send('output', buf.toString()));

  shell.on('exit', (code, signal) => {
    console.log(`[${id}] shell exited code=${code} signal=${signal}`);
    send('exit', code ?? -1);
    try { ws.close(); } catch { /* ignore */ }
  });

  shell.on('error', (err) => {
    send('output', `\r\n[Shell error: ${err.message}]\r\n`);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input' && shell.stdin.writable) {
        shell.stdin.write(msg.data);
      }
    } catch { /* ignore malformed */ }
  });

  ws.on('close', () => {
    console.log(`[${id}] client disconnected`);
    try { shell.kill(); } catch { /* ignore */ }
  });

  ws.on('error', () => {
    try { shell.kill(); } catch { /* ignore */ }
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │   AXE Terminal Server                   │
  │   ws://${HOST}:${PORT}                  │
  │   http://${HOST}:${PORT}/health          │
  └─────────────────────────────────────────┘
`);
});

process.on('SIGINT', () => {
  console.log('\n[terminal] shutting down...');
  wss.close();
  httpServer.close();
  process.exit(0);
});
