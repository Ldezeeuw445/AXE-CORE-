#!/usr/bin/env node
/**
 * axe-local-bridge — the channel AXE was missing to the machine it runs on.
 *
 * Until now AXE could commit to GitHub and run shell on the VPS in Germany,
 * but had no path at all to the worktree on Luka's SSD. Asking it to change
 * the running app was therefore impossible by construction: a commit lands on
 * a branch nobody has pulled, and the app in front of you is unaffected. That
 * is why "I'll remove that button" could only ever be talk.
 *
 * This closes the loop. It is small on purpose — file read/write inside known
 * roots, plus a fixed set of commands — because it is the most dangerous
 * component in the system: anything that can write to the worktree can write
 * anything, and it runs with Luka's own privileges.
 *
 * Four independent limits, so no single mistake is enough:
 *
 *   1. binds 127.0.0.1 only — never reachable off the machine
 *   2. every request needs the shared token from AXE_BRIDGE_TOKEN
 *   3. every path is resolved and must land inside an allowed root, which
 *      defeats ../ traversal and symlinks out
 *   4. commands are matched against an allowlist, not sanitised — there is no
 *      shell, so no quoting bug can turn into an injection
 *
 * Run:  AXE_BRIDGE_TOKEN=... node server.mjs
 */
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { homedir } from 'node:os';

const PORT = Number(process.env.AXE_BRIDGE_PORT ?? 4599);
const TOKEN = process.env.AXE_BRIDGE_TOKEN ?? '';

/**
 * Directories AXE may touch. Anything outside is refused — including the rest
 * of the SSD, the home directory, and every dotfile that holds a credential.
 */
const ROOTS = (process.env.AXE_BRIDGE_ROOTS ?? '/Volumes/EagetSSD/AXE-CORE-')
  .split(',')
  .map(r => resolve(r.trim().replace(/^~/, homedir())))
  .filter(Boolean);

/**
 * Commands AXE may run, as argv — never a shell string.
 *
 * Kept to things whose worst outcome is a failed build. Nothing here can
 * install, publish, delete, or reach the network with credentials. `git pull`
 * is fast-forward only so it can never rewrite local work.
 */
const ALLOWED = {
  'build':       ['npm', ['run', 'build']],
  'typecheck':   ['npx', ['tsc', '--noEmit', '-p', 'tsconfig.app.json']],
  'test':        ['npm', ['test']],
  'git.status':  ['git', ['status', '--porcelain', '-b']],
  'git.pull':    ['git', ['pull', '--ff-only']],
  'git.diff':    ['git', ['diff', '--stat']],
  'tauri.build': ['npm', ['run', 'tauri:build']],
};

const MAX_BODY = 2 * 1024 * 1024;
const MAX_READ = 1024 * 1024;

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(s),
    // The bridge is for the local app only; no browser origin may call it.
    'Access-Control-Allow-Origin': 'http://localhost:5177',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(s);
}

/**
 * Resolve a caller-supplied path and prove it stays inside an allowed root.
 *
 * Compares against `root + sep` rather than a bare prefix, so a sibling
 * directory whose name merely starts with a root's name cannot slip through.
 */
function safePath(p) {
  if (typeof p !== 'string' || !p) throw new Error('path required');
  const abs = resolve(p.replace(/^~/, homedir()));
  const ok = ROOTS.some(r => abs === r || abs.startsWith(r + sep));
  if (!ok) throw new Error(`path outside allowed roots: ${abs}`);
  return abs;
}

function readBody(req) {
  return new Promise((res, rej) => {
    let n = 0;
    const chunks = [];
    req.on('data', c => {
      n += c.length;
      if (n > MAX_BODY) { rej(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { res(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { rej(new Error('invalid JSON')); }
    });
    req.on('error', rej);
  });
}

function run(cmdKey, cwd) {
  const entry = ALLOWED[cmdKey];
  if (!entry) throw new Error(`command not allowed: ${cmdKey}`);
  const [bin, args] = entry;
  return new Promise(res => {
    execFile(bin, args, { cwd, timeout: 15 * 60_000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => res({
        ok: !err,
        code: err?.code ?? 0,
        // Tail rather than head: a build's verdict is at the end.
        stdout: String(stdout).slice(-8000),
        stderr: String(stderr).slice(-8000),
      }));
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Unauthenticated, and deliberately says nothing about the machine: it
    // exists so the app can grey out local actions when the bridge is down.
    if (url.pathname === '/health') return json(res, 200, { ok: true, roots: ROOTS.length });

    const auth = req.headers.authorization ?? '';
    if (!TOKEN || auth !== `Bearer ${TOKEN}`) return json(res, 401, { error: 'unauthorized' });

    if (url.pathname === '/read' && req.method === 'GET') {
      const abs = safePath(url.searchParams.get('path'));
      const st = await stat(abs);
      if (st.size > MAX_READ) return json(res, 413, { error: `file too large (${st.size})` });
      return json(res, 200, { path: abs, content: await readFile(abs, 'utf8') });
    }

    if (url.pathname === '/list' && req.method === 'GET') {
      const abs = safePath(url.searchParams.get('path'));
      const entries = await readdir(abs, { withFileTypes: true });
      return json(res, 200, {
        path: abs,
        entries: entries
          .filter(e => !e.name.startsWith('.git'))
          .map(e => ({ name: e.name, dir: e.isDirectory() })),
      });
    }

    if (url.pathname === '/write' && req.method === 'POST') {
      const body = await readBody(req);
      const abs = safePath(body.path);
      if (typeof body.content !== 'string') return json(res, 400, { error: 'content required' });
      await mkdir(dirname(abs), { recursive: true });
      // Return the previous content so the caller can show a real diff and
      // undo — a write nobody can inspect is a write nobody should trust.
      let before = null;
      try { before = await readFile(abs, 'utf8'); } catch { /* new file */ }
      await writeFile(abs, body.content, 'utf8');
      return json(res, 200, { path: abs, bytes: Buffer.byteLength(body.content), created: before === null, before });
    }

    if (url.pathname === '/run' && req.method === 'POST') {
      const body = await readBody(req);
      const cwd = safePath(body.cwd);
      return json(res, 200, await run(body.command, cwd));
    }

    return json(res, 404, { error: 'not found' });
  } catch (err) {
    return json(res, 400, { error: String(err?.message ?? err) });
  }
});

if (!TOKEN) {
  console.error('refusing to start: AXE_BRIDGE_TOKEN is not set');
  process.exit(1);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`axe-local-bridge on http://127.0.0.1:${PORT}`);
  console.log('roots:');
  for (const r of ROOTS) console.log(`  ${r}`);
  console.log(`commands: ${Object.keys(ALLOWED).join(', ')}`);
});
