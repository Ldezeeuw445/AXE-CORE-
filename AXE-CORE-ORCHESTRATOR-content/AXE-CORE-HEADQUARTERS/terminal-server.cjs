#!/usr/bin/env node
/**
 * AXE Terminal Server
 * Run: node terminal-server.cjs
 * WebSocket shell on ws://localhost:4022 (local) or behind nginx on /terminal
 * Each browser connection gets its own persistent zsh session.
 *
 * ## Wie hier binnen mag
 *
 * Dit is een login shell op de machine waar het draait. Wie hem opent leest
 * /opt/axe-core-api/.env en daarmee elke sleutel die de VPS heeft. Daar hoort
 * dus een slot op, en het slot is het Supabase-token dat de app al meestuurt.
 *
 * Gemeten 2026-09-10 tegen de live server, vóór dit bestand een token las:
 *
 *   curl wss://api.axecompanion.com/terminal   (geen Origin, geen token)
 *   -> HTTP/1.1 101 Switching Protocols
 *
 * De Origin-lijst hieronder was het enige slot, en die begon met "geen Origin
 * is goed". Origin is een header die alleen brówsers verplicht meesturen; curl
 * laat hem weg en loopt er zo omheen. Met een verzonnen origin kwam er keurig
 * 401 terug — het slot werkte, het zat op een deur waar je naast kon lopen.
 *
 * Daarom nu: het token beslist, de Origin is de tweede muur. Zonder geldig
 * token geen shell, ook niet zonder Origin, ook niet vanaf localhost achter een
 * proxy. En zonder SUPABASE_URL en een projectsleutel start hij niet op — dezelfde
 * keuze als infra/axe-mac-tunnel/relay.cjs, dat weigert te starten zonder
 * AXE_TUNNEL_TOKEN. Een beveiliging die je per ongeluk uit kunt laten staan is
 * er geen.
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

// AXE's own shells. They are not web pages, so they do not survive the URL
// parsing below.
//
// Measured 2026-08-19 against the live server:
//   (no Origin header)                    -> 101
//   tauri://localhost                     -> 400    the desktop app
//   https://appassets.androidplatform.net -> 400    the phone
//
// `new URL('tauri://localhost').hostname` is empty — a non-special scheme has
// no authority to parse — so the `host === 'localhost'` check below never
// matched, and both of Luka's own apps were refused while curl with no Origin
// header sailed straight through. That is the whole of the terminal's 1006:
// the service was up the entire time, and every check had been made from the
// one place that happened to be allowed.
const APP_ORIGINS = new Set([
  'tauri://localhost',                     // Tauri v1 (macOS, Linux)
  'https://tauri.localhost',               // Tauri v2 (macOS)
  'http://tauri.localhost',
  'https://appassets.androidplatform.net', // the Android WebView bundle
]);

function isAllowedOrigin(origin) {
  // Geen Origin is geen vrijbrief meer — dat was precies het gat. Een client
  // zonder Origin (curl, een script, de Tauri-shell in sommige versies) komt
  // hier langs op zijn token, niet op de afwezigheid van een header.
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes('*')) return true;
  if (APP_ORIGINS.has(origin)) return true;
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

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');

/**
 * De project-sleutel voor de `apikey`-header van /auth/v1/user.
 *
 * Bij voorkeur de anon key, maar die staat niet op elke machine — de VPS had
 * alleen SUPABASE_SERVICE_ROLE (gemeten 10 september). De service role mag hier
 * ook, want deze sleutel bepaalt niets over identiteit: hij zegt alleen tegen
 * Supabase welk project je bedoelt. Wíe je bent staat in het token dat de
 * gebruiker meestuurt, en dat gaat als Bearer mee.
 *
 * Zo hoeft er geen sleutel gekopieerd te worden naar een tweede bestand: de
 * unit hangt gewoon aan de .env die er al is.
 */
const SUPABASE_API_KEY =
  process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || process.env.SUPABASE_SERVICE_ROLE
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || '';

/**
 * Welke accounts een shell mogen. Leeg = elk geldig account van dit Supabase
 * project, en dat is voor AXE Core te ruim: één project bedient ook Companion
 * en Trading OS, dus elke betalende abonnee heeft daar een geldig token. Zet
 * hem, en zet er alleen jezelf in.
 */
const ALLOWED_USER_IDS = (process.env.AXE_TERMINAL_ALLOWED_USER_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  console.error(
    'refusing to start: SUPABASE_URL and a project key are required\n' +
    '(SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE as fallback).\n' +
    'Without them this process is an unauthenticated shell on a public port.',
  );
  process.exit(1);
}

if (typeof fetch !== 'function') {
  console.error('refusing to start: this Node has no global fetch (needs Node 18+)');
  process.exit(1);
}

if (!ALLOWED_USER_IDS.length) {
  console.warn(
    '[terminal] AXE_TERMINAL_ALLOWED_USER_IDS is empty — every account on this ' +
    'Supabase project can open a shell here. Set it to your own user id.',
  );
}

/**
 * Vraagt Supabase wie dit token is. Niet zelf de JWT ontleden: dan controleer
 * je een handtekening met code die je zelf schreef, en een ingetrokken sessie
 * blijft geldig tot hij verloopt. Supabase weet het echte antwoord.
 *
 * Eén netwerkaanroep per verbinding — een terminal open je een paar keer per
 * dag, dus dat is geen pad om te optimaliseren.
 */
async function verifieerToken(token) {
  if (!token || token === 'dev') return null;
  // De project-sleutel is geen inlog. Werd hij als service role meegegeven, dan
  // zou hem hier als Bearer terugsturen precies het slot openen dat we net
  // hebben gemonteerd.
  if (token === SUPABASE_API_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user?.id) return null;
    if (ALLOWED_USER_IDS.length && !ALLOWED_USER_IDS.includes(user.id)) return null;
    return user;
  } catch {
    // Supabase onbereikbaar betekent geen shell. Bij twijfel dicht: een
    // terminal die opengaat als de controle uitvalt is geen controle.
    return null;
  }
}

function tokenUit(req) {
  try {
    return new URL(req.url, 'http://localhost').searchParams.get('token');
  } catch {
    return null;
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
  // Twee muren, in deze volgorde: komt de aanvraag uit een browser, dan moet
  // die browser van een bekend adres komen; en altijd moet het token van een
  // toegelaten account zijn. De callback-vorm omdat de tokencontrole een
  // netwerkaanroep is.
  verifyClient: ({ origin, req }, cb) => {
    if (!isAllowedOrigin(origin)) {
      console.warn(`[terminal] geweigerd: origin ${origin}`);
      return cb(false, 401, 'Unauthorized');
    }
    verifieerToken(tokenUit(req)).then((user) => {
      if (!user) {
        console.warn(`[terminal] geweigerd: geen geldig token (origin ${origin || 'geen'})`);
        return cb(false, 401, 'Unauthorized');
      }
      req.axeUser = user;
      cb(true);
    });
  },
});

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2, 7);
  // Mét account erbij: een shell-sessie zonder naam is achteraf niet na te gaan.
  console.log(`[${id}] client connected (${req?.axeUser?.email || req?.axeUser?.id || 'onbekend'})`);

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
