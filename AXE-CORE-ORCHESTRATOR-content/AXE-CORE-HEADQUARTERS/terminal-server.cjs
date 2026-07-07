#!/usr/bin/env node
/**
 * AXE Terminal Server
 * Run: node terminal-server.cjs
 * WebSocket shell on ws://localhost:4022
 * Each browser connection gets its own persistent zsh session.
 */

// Try local node_modules first (symlinked), then absolute TRADING-OS path
let WS;
try {
  WS = require('./node_modules/ws');
} catch {
  WS = require('/Volumes/EagetSSD/TRADING-OS/node_modules/ws');
}
const { WebSocketServer, WebSocket } = WS;

const { spawn } = require('child_process');
const { createServer } = require('http');
const os = require('os');

const PORT = 4022;

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
  // Allow connections from localhost Vite app
  verifyClient: ({ origin }) => {
    if (!origin) return true;
    try {
      const url = new URL(origin);
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    } catch { return false; }
  },
});

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2, 7);
  console.log(`[${id}] client connected`);

  // Spawn a new zsh shell session
  const shell = spawn('zsh', ['--login'], {
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    },
    cwd: os.homedir(),
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

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │   AXE Terminal Server                   │
  │   ws://localhost:${PORT}                  │
  │   http://localhost:${PORT}/health          │
  └─────────────────────────────────────────┘
`);
});

process.on('SIGINT', () => {
  console.log('\n[terminal] shutting down...');
  wss.close();
  httpServer.close();
  process.exit(0);
});
