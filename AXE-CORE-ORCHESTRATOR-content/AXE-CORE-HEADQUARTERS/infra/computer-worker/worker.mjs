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
 *   5. normal commands are argv against an allowlist; the one free-shell tool
 *      is consequential and runs only after approval of its exact command
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
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep, join, dirname, relative } from 'node:path';
import { homedir, hostname, tmpdir } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reportCodingSeats, noteerLimiet } from './codingSeats.mjs';
import { denkArgv } from './denkRun.mjs';
import { vingerafdruk, codeVeranderd } from './zelfVernieuw.mjs';
import { maakLeesWeigering, naarDezeMac } from './leesRegels.mjs';
import { schakel as macSchakel } from './macSchakelaars.mjs';
import { ruimWorktree, veegWorktrees, hoofdRepoVan, bewaarWerk } from './worktreeOpruim.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

function loadEnvFile(p) {
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
// De frontend-.env én de backend-.env.local van deze Mac. De tweede heeft de
// service-sleutel: core_tasks is niet meer open voor anon, omdat de anon-sleutel
// in elke app-build zit en wie hem uitleest anders taken op deze Mac kon zetten.
const env = {
  ...loadEnvFile(join(REPO, '.env')),
  ...loadEnvFile(join(REPO, 'backend/axe_api/.env.local')),
  ...process.env,
};
// launchd PATH is smal; claude/codex/cursor-agent staan in Homebrew, uv/uvx (het
// testcommando uit de werkbon) in ~/.local/bin. 24 nov live: de agent op de Mac mini
// kreeg 'command not found: uvx' en kon de tests dus nooit draaien.
env.PATH = `${join(homedir(), '.local/bin')}:/opt/homebrew/bin:/usr/local/bin:${env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = env.PATH;

const SUPABASE_URL = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE ?? env.VITE_SUPABASE_ANON_KEY;
if (!env.SUPABASE_SERVICE_ROLE) {
  console.warn('axe-computer-worker: geen SUPABASE_SERVICE_ROLE in backend/axe_api/.env.local — valt terug op de anon-sleutel, en die mag core_tasks niet meer lezen.');
}
const CAPABILITY = 'computer_use';
const POLL_MS = Number(env.AXE_COMPUTER_POLL_MS ?? 1500);
const LEASE_MS = 90_000;
const STEP_TIMEOUT_MS = Number(env.AXE_COMPUTER_TIMEOUT_MS ?? 5 * 60_000);
// 22 nov: een echte Codex-run (één test toevoegen + draaien) duurde langer dan 5 min en
// werd afgekapt. Coding-agents krijgen 15 min; de VPS wacht 16 (device_actions).
const AGENT_TIMEOUT_MS = Number(env.AXE_AGENT_TIMEOUT_MS ?? 15 * 60_000);
// Eén denkstap is één antwoord, geen codeerklus: 3 minuten is ruim.
const DENK_TIMEOUT_MS = Number(env.AXE_DENK_TIMEOUT_MS ?? 3 * 60_000);
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
    // Was the kilo worktree on the SSD. That one was drained on 2026-09-02 and
    // still sits on trading-desk-aug-25-26; the live checkout has been
    // ~/AXE-CORE- on orchestrator since 2026-09-03. Measured 2026-09-13: a
    // system.info from the app answered with the kilo root and the old branch,
    // so every computer-use call on the Mac Mini read a tree nobody edits.
    fallback: '~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS',
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
    // 25 nov: de SSD hangt niet aan de Mac mini, dus 'Trading OS' bestond daar niet en drie
    // managertaken eindigden op "trading-os-app is niet beschikbaar". De levende repo is
    // ~/trading-os-app (Ldezeeuw445/trading-os-app, vandaag nog bijgewerkt); ~/TRADING-OS
    // is een oude kopie uit mei en blijft buiten beeld. Eerste die bestaat, wint.
    alternatieven: ['~/trading-os-app'],
    protected: ['main'],
  },
};

const WORKSPACES = Object.fromEntries(
  Object.entries(WORKSPACE_DEFS)
    .map(([name, def]) => {
      const pad = p => resolve(String(p).replace(/^~/, homedir()));
      const kandidaten = env[def.envKey] ? [env[def.envKey]] : [def.fallback, ...(def.alternatieven || [])];
      const root = pad(kandidaten.find(k => existsSync(pad(k))) ?? kandidaten[0]);
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
  'system.info', 'files.list', 'files.read', 'files.search', 'personal.files.list',
  'git.status', 'git.branch', 'git.diff', 'git.log',
  'camera.snapshot', 'computer.permissions', 'screen.displays', 'screen.observe',
  'pointer.position', 'app.list', 'app.frontmost', 'window.list',
  // Leest alleen ~/.axe/focus.log; faalde 44x op 'protected branch' (20 nov).
  'axe.focus_log',
]);

/**
 * camera.snapshot — één foto met de ingebouwde camera, naar de privé-bucket `axe-camera`.
 *
 * Alleen zinvol op een Mac met camera (de iMac). De foto staat nooit publiek: de
 * bucket heeft geen publieke URL en alleen Luka's ingelogde account mag hem lezen.
 * Het resultaat is het pad in de bucket, niet de foto zelf, zodat core_tasks geen
 * beelden bevat.
 */
// Een app-bundel, gestart via `open`: dan is de app zelf het verantwoordelijke proces en
// vraagt macOS toestemming op naam van "AXE Camera". Rechtstreeks vanuit node weigert
// macOS zonder te vragen (node mist het camera-recht). Zie camera/Info.plist.
const CAMERA_APP = env.AXE_CAMERA_APP ?? join(HERE, 'camera', 'AXE Camera.app');
const CAMERA_BUCKET = 'axe-camera';

// One stable app-bundle identity owns Screen Recording + Accessibility TCC.
// Rebuilding the helper in-place with the same bundle id/signing identity keeps
// permissions attached to AXE Computer Use instead of anonymous node/swift bins.
const COMPUTER_USE_APP = env.AXE_COMPUTER_USE_APP ?? join(HERE, 'native', 'AXE Computer Use.app');

async function nativeComputerUse(command, args = {}) {
  if (!existsSync(COMPUTER_USE_APP)) {
    throw new Error(`native computer-use helper ontbreekt: bouw ${join(HERE, 'native', 'build.sh')}`);
  }
  const stamp = `${process.pid}-${Date.now()}`;
  const out = join(tmpdir(), `axe-computer-use-${stamp}.json`);
  try {
    await new Promise((res, rej) => {
      execFile(
        '/usr/bin/open',
        // Pass the exact bundle path as the target. Using -a is for resolving an
        // application name and can select a different installed copy with the
        // same display name — precisely the ambiguity this native runtime work
        // is eliminating.
        ['-W', '-n', '-g', COMPUTER_USE_APP, '--args', command, out, JSON.stringify(args)],
        { timeout: 150_000 },
        (err) => err ? rej(err) : res(),
      );
    });
    const raw = await readFile(out, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.ok) throw new Error(parsed?.error ?? `${command} failed`);
    return parsed.result;
  } finally {
    await unlink(out).catch(() => {});
  }
}

async function uploadPrivateCapture(file, mime, prefix = 'screen') {
  const data = await readFile(file);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const object = `${DEVICE_ID}/${prefix}-${stamp}.${mime === 'image/png' ? 'png' : 'jpg'}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${CAMERA_BUCKET}/${object}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': mime },
    body: data,
  });
  if (!res.ok) throw new Error(`capture upload mislukt: ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
  return { bucket: CAMERA_BUCKET, path: object, mime, bytes: data.length };
}

async function screenObserve(args = {}) {
  const file = join(tmpdir(), `axe-screen-${process.pid}-${Date.now()}.jpg`);
  try {
    const meta = await nativeComputerUse('screen.capture', {
      display_index: Number(args.display_index ?? 0),
      path: file,
    });
    const stored = await uploadPrivateCapture(file, 'image/jpeg', 'screen');
    return JSON.stringify({
      ...stored,
      display_index: meta.display_index,
      width: meta.width,
      height: meta.height,
      logical_x: meta.logical_x,
      logical_y: meta.logical_y,
      logical_width: meta.logical_width,
      logical_height: meta.logical_height,
      pixel_width: meta.pixel_width,
      pixel_height: meta.pixel_height,
    });
  } finally {
    await unlink(file).catch(() => {});
  }
}

function cameraShot(file) {
  const foutBestand = `${file}.fout`;
  return new Promise((res, rej) => {
    if (!existsSync(CAMERA_APP)) {
      return rej(new Error(`camera-app ontbreekt: bouw "AXE Camera.app" volgens ${join(HERE, 'camera', 'main.swift')}`));
    }
    // -W wacht tot de app stopt, -n altijd een nieuwe instantie, -g niet naar voren.
    // 150 s: de eerste keer wacht de app tot iemand op "Sta toe" klikt.
    execFile('/usr/bin/open', ['-W', '-n', '-g', '-a', CAMERA_APP, '--args', file], { timeout: 150_000 }, (err) => {
      if (err?.killed) return rej(new Error('camera: geen antwoord binnen 150 s (wacht de toestemmingsvraag nog op deze Mac?)'));
      if (existsSync(file)) return res();
      let code = 0; let msg = err?.message ?? 'geen foto gemaakt';
      try {
        const regel = readFileSync(foutBestand, 'utf8').trim();
        code = Number(regel.split(' ')[0]); msg = regel.slice(String(code).length).trim() || msg;
      } catch { /* geen foutbestand: de app startte niet */ }
      unlink(foutBestand).catch(() => {});
      const uitleg = {
        2: 'geen cameratoestemming — klik "Sta toe" op deze Mac, of zet AXE Camera aan in Systeeminstellingen → Privacy en beveiliging → Camera',
        3: 'deze Mac heeft geen camera',
      }[code];
      rej(new Error(uitleg ?? `camera mislukt: ${String(msg).slice(0, 200)}`));
    });
  });
}

async function cameraSnapshot() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(tmpdir(), `axe-camera-${process.pid}-${stamp}.jpg`);
  try {
    await cameraShot(file);
    const data = await readFile(file);
    const object = `${DEVICE_ID}/${stamp}.jpg`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${CAMERA_BUCKET}/${object}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'image/jpeg' },
      body: data,
    });
    if (!res.ok) {
      throw new Error(`upload mislukt: ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
    }
    return `bucket ${CAMERA_BUCKET}\npad ${object}\nbytes ${data.length}`;
  } finally {
    await unlink(file).catch(() => {});
  }
}

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
    await reportCodingSeats(sbOrThrow, {
      deviceId: DEVICE_ID,
      host: hostname(),
      env,
    }).catch((err) => {
      console.warn('coding seats heartbeat:', err?.message ?? err);
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

/**
 * De uitkomst terugschrijven -- maar alleen op een rij die nog draait.
 *
 * `status=eq.running` in het filter is het hele punt. Annuleren zet de rij op
 * `cancelled` terwijl deze machine nog bezig is; zonder dat filter PATCHt deze
 * afronding hem een moment later stilletjes terug naar `completed`, en meldt
 * een taak die Luka stopzette zichzelf alsnog als klaar. Nul rijen raken is
 * hier het goede antwoord: iemand anders heeft deze rij al afgesloten.
 */
async function settle(id, ok, body) {
  await sb(`core_tasks?id=eq.${id}&status=eq.running`, {
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
  // Pad van de andere Mac (andere thuismap, herhaalde werkmap) eerst geldig maken.
  p = naarDezeMac(root, p, homedir());
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

/* ── lezen buiten de werkmap ────────────────────────────────────────────────
 * Luka 20 nov: "is dat wel handig dat hij alleen in zijn eigen map mag kijken?"
 * -- nee, niet voor een assistent die alles kan. LEZEN mag nu op de hele Mac
 * (thuismap, Programma's, externe schijven). SCHRIJVEN en VERWIJDEREN blijven
 * in de werkmap (safePath) en vragen elke keer om een ok.
 *
 * Wat nooit gelezen wordt, wat er ook gevraagd wordt (alles wat AXE leest gaat
 * naar een model): elke verborgen map of bestand (~/.ssh, ~/.claude, ~/.aws,
 * ~/.axe ... daar staan de sleutels), de sleutelhanger, cookies, browser-
 * profielen en wachtwoordmanagers, plus de vault en DENY_NAMES (.env, *.key).
 * Gecontroleerd na realpath, dus een symlink ernaartoe telt ook. */
const leesWeigering = maakLeesWeigering({ home: homedir(), denyPaths: DENY_PATHS, denyNames: DENY_NAMES });

/** Leespad: binnen de werkmap de gewone regels, daarbuiten leesWeigering. */
async function leesPad(root, p) {
  p = naarDezeMac(root, p ?? '.', homedir());
  const ruw = resolve(root, String(p ?? '.').replace(/^~/, homedir()));
  if (ruw === root || ruw.startsWith(root + sep)) return safePath(root, p ?? '.');
  let echt;
  try { echt = await realpath(ruw); } catch { echt = ruw; }
  for (const kandidaat of new Set([ruw, echt])) {
    const nee = leesWeigering(kandidaat);
    if (nee) throw new Error(nee);
  }
  return echt;
}

const SEAT_ENV = {
  // Geen CLAUDE_CONFIG_DIR voor de eerste stoel: `claude auth login` zonder map
  // bewaart de login in de sleutelhanger onder "Claude Code-credentials". Zet je
  // de map expliciet op ~/.claude, dan zoekt Claude onder een ándere naam (met
  // een hash van de map) en zegt hij "niet ingelogd" -- gemeten 20 nov op de
  // iMac: zonder map loggedIn true, met ~/.claude loggedIn false.
  claude:  {},
  claude2: { CLAUDE_CONFIG_DIR: join(homedir(), '.claude-tweede') },
  claude3: { CLAUDE_CONFIG_DIR: join(homedir(), '.claude-derde') },
  claude4: { CLAUDE_CONFIG_DIR: join(homedir(), '.claude-vierde') },
  codex:   { CODEX_HOME: join(homedir(), '.codex') },
  codex2:  { CODEX_HOME: join(homedir(), '.codex-tweede') },
  codex3:  { CODEX_HOME: join(homedir(), '.codex-derde') },
  cursor:  {},
  cursor2: {},
};

function seatChildEnv(seatId) {
  const extra = { ...(SEAT_ENV[seatId] || {}) };
  if (seatId === 'cursor2') {
    const key = env.CURSOR2_API_KEY || process.env.CURSOR2_API_KEY;
    if (key) extra.CURSOR_API_KEY = key;
  }
  const child = { ...process.env, ...env, ...extra };
  if (seatId === 'claude') delete child.CLAUDE_CONFIG_DIR;
  for (const k of [
    'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDECODE',
    'OPENAI_API_KEY', 'OPENAI_BASE_URL',
  ]) {
    delete child[k];
  }
  return child;
}

function isCodexModelNotFound(text) {
  return /model_not_found|not supported when using Codex|model is not supported|unsupported model/i.test(text || '');
}

function runStatus(cmd, args, cwd, extraEnv, timeoutMs = STEP_TIMEOUT_MS) {
  return new Promise((res, rej) => {
    // 22 nov gemeten: met stdin open wacht `codex exec` op invoer tot de time-out (elke
    // Codex-run liep zo 5, later 15 min vast); met stdin dicht was dezelfde run in 12 s
    // klaar. Claude wachtte er ook 3 s op. Niemand geeft hier invoer: meteen dicht.
    const kind = execFile(cmd, args, { cwd, env: extraEnv || process.env, timeout: timeoutMs, maxBuffer: 8 << 20 },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ''}${stderr ?? ''}`.slice(0, MAX_OUTPUT);
        // A non-zero exit is a RESULT, not a transport failure: "31 tests
        // failed" is exactly what was asked for. Only a missing binary or a
        // timeout is an actual error.
        if (err && (err.code === 'ENOENT' || err.killed)) {
          return rej(new Error(err.killed ? `timed out after ${timeoutMs / 1000}s` : `not found: ${cmd}`));
        }
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        res({ out: out.trim() || '(no output)', code });
      });
    kind.stdin?.end();
  });
}

function run(cmd, args, cwd, extraEnv, timeoutMs = STEP_TIMEOUT_MS) {
  return runStatus(cmd, args, cwd, extraEnv, timeoutMs).then(r => r.out);
}


/**
 * Waar staat een CLI op deze Mac? (18 nov: codex.run faalde elk uur op de iMac
 * met "not found: /opt/homebrew/bin/codex" -- daar staat hij in ~/.local/bin.)
 * Volgorde: de env-variabele, dan de gewone plekken, dan PATH. Niets gevonden:
 * de eerste kandidaat, zodat de fout blijft zeggen waar gezocht is.
 */
export function vindBin(naam, envSleutel, omgeving = env, bestaat = existsSync) {
  const eigen = omgeving[envSleutel];
  if (eigen) return eigen;
  const plekken = [
    `${homedir()}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', `${homedir()}/.npm-global/bin`,
    `${homedir()}/.bun/bin`, ...String(omgeving.PATH || '').split(':').filter(Boolean),
  ];
  for (const dir of plekken) {
    const p = join(dir, naam);
    if (bestaat(p)) return p;
  }
  return `/opt/homebrew/bin/${naam}`;
}

let catalogusCache = null;
/** Zichtbare modellen uit `codex debug models` (wat dit account echt mag), nieuwste eerst. */
async function codexCatalogus(bin, child) {
  if (catalogusCache) return catalogusCache;
  try {
    const { out } = await runStatus(bin, ['debug', 'models'], REPO, child, 60_000);
    const d = JSON.parse(out.slice(out.indexOf('{')));
    const lijst = Array.isArray(d) ? d : (d.models || []);
    catalogusCache = lijst.filter(m => (m.visibility || 'list') === 'list').map(m => m.slug || m.id).filter(Boolean);
  } catch { catalogusCache = []; }
  return catalogusCache;
}

async function runCodexWithFallback(prompt, root, seat, requestedModel) {
  const bin = vindBin('codex', 'AXE_CODEX_BIN');
  const raw = String(requestedModel || env.AXE_CODEX_MODEL || '').trim();
  // gpt-5-codex geeft model_not_found op een ChatGPT-login; astra/gpt-6 400.
  // Leeg = de CLI kiest zelf. Andere AXE_CODEX_MODEL-waarden blijven een pin.
  // 22 nov: alleen bekende dode pins weg; 'gpt-6-luna' is juist een werkend model.
  const model = /astra|gpt-5-codex/i.test(raw) ? '' : raw;
  // 22 nov: codex 0.142 kent '--approve-for-me' niet meer ("unexpected argument") en
  // weigerde ELKE run. `codex exec` vraagt niets: de sandbox (workspace-write) is de grens.
  const base = ['exec', prompt, '-C', '.', '-s', 'workspace-write'];
  const child = seatChildEnv(seat);
  const tried = [];

  const first = model ? [...base, '-m', model] : base;
  tried.push(model ? `-m ${model}` : 'account default (no -m)');
  let result = await runStatus(bin, first, root, child, AGENT_TIMEOUT_MS);

  if (result.code !== 0 && isCodexModelNotFound(result.out) && model) {
    tried.push('retry without -m');
    result = await runStatus(bin, base, root, child, AGENT_TIMEOUT_MS);
  }

  // 22 nov: het model in Luka's Codex-config (gpt-5.4 / gpt-6-astra) mag niet met zijn
  // ChatGPT-account. Codex' eigen catalogus zegt welke wel: probeer die (zichtbare) modellen.
  if (result.code !== 0 && (isCodexModelNotFound(result.out) || /newer version of Codex/i.test(result.out))) {
    for (const m of (await codexCatalogus(bin, child)).filter(x => x !== model).slice(0, 2)) {
      tried.push(`-m ${m} (catalogus)`);
      result = await runStatus(bin, [...base, '-m', m], root, child, AGENT_TIMEOUT_MS);
      if (result.code === 0 && !isCodexModelNotFound(result.out)) break;
    }
  }

  if (result.code === 0 && !isCodexModelNotFound(result.out)) {
    return result.out;
  }

  if (isCodexModelNotFound(result.out)) {
    const claude = vindBin('claude', 'AXE_CLAUDE_BIN');
    tried.push(`claude CLI fallback (${claude})`);
    try {
      const claudeArgv = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits'];
      const claudeResult = await runStatus(claude, claudeArgv, root, seatChildEnv('claude'), AGENT_TIMEOUT_MS);
      if (claudeResult.code === 0 && !isCodexModelNotFound(claudeResult.out)) {
        return `[Codex model unsupported; ran Claude CLI instead. Tried: ${tried.join(' → ')}]\n${claudeResult.out}`;
      }
      throw new Error(
        `Codex model_not_found: this ChatGPT account does not support the requested model. `
        + `Tried: ${tried.join(' → ')}. Claude CLI then failed: ${claudeResult.out.slice(0, 400)}`,
      );
    } catch (e) {
      if (String(e.message || '').startsWith('Codex model_not_found')) throw e;
      throw new Error(
        `Codex model_not_found: this ChatGPT account does not support the requested model. `
        + `Tried: ${tried.join(' → ')}. Claude CLI fallback failed: ${e.message}`,
      );
    }
  }
  return result.out;
}
const git = (root, ...a) => run('git', a, root);
// Strikt: exitcode != 0 is een fout en lege uitvoer is '' (run() geeft dan '(no output)').
const gitStreng = async (root, ...a) => {
  const r = await runStatus('git', a, root);
  if (r.code) throw new Error(r.out);
  return r.out === '(no output)' ? '' : r.out;
};
const WORKTREE_MAP = join(homedir(), '.axe', 'worktrees');
/* 24 nov: met alleen acceptEdits weigerde Claude Code headless ELK shell-commando --
   geen tests, geen commit ("git add/git commit zijn hier geblokkeerd", 23 nov). De
   werkbon vraagt "af is af: getest en gecommit". Dit is precies wat daarvoor nodig is;
   push, merge, rm, curl en vrije shell blijven dicht. */
const CLAUDE_MAG_DRAAIEN = [
  'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)',
  'Bash(git add:*)', 'Bash(git commit:*)',
  'Bash(npx vitest:*)', 'Bash(npx tsc:*)', 'Bash(npx eslint:*)', 'Bash(npm test:*)', 'Bash(npm run test:*)',
  'Bash(npm run typecheck:*)', 'Bash(npm run lint:*)',
  'Bash(python3 -m pytest:*)', 'Bash(pytest:*)', 'Bash(uvx --with-requirements requirements.txt --with pytest pytest:*)',
  'Bash(node --test:*)', 'Bash(node --check:*)',
];
const startBuild = git(REPO, 'rev-parse', '--short', 'HEAD').then(s => s.trim()).catch(() => '');
/** Moet gelijk zijn aan COMPUTER_PROTOCOL in src/domain/tools/computerProtocol.ts (een test houdt ze gelijk). */
const WORKER_PROTOCOL = 1;

/* ── the tools ──────────────────────────────────────────────────────────── */
async function execute(payload) {
  const { tool, workspace, args = {} } = payload;

  // A packaged AXE CORE and its local launchd worker must speak the same PROTOCOL. Refuse a mixed pair
  // instead of letting an old UI talk confidently to a newer worker (or vice versa). Remote phone/web
  // clients are allowed to differ because they intentionally control this Mac across deployments.
  //
  // The gate is the protocol number, NOT the git commit (9 okt 2026). The commit of the app and the commit
  // this worker started from change independently -- autosync pulls minutes before it rebuilds, and any
  // worker restart in that gap picks the newest commit -- so comparing them refused every computer
  // action whenever work had just been pushed, although the two understood each other perfectly.
  if (payload.client_runtime === 'tauri' && tool !== 'system.info') {
    const appProtocol = Number(payload.client_protocol);
    if (Number.isFinite(appProtocol) && appProtocol !== WORKER_PROTOCOL) {
      const appBuild = String(payload.client_build ?? '').trim() || 'unknown';
      throw new Error(
        `AXE native protocol mismatch: app speaks v${appProtocol}, computer-worker speaks v${WORKER_PROTOCOL} (app build ${appBuild}, worker build ${await startBuild}). Run 'npm run bijwerken' from orchestrator; no computer action was executed.`,
      );
    }
  }

  // Device-scoped Personal Computer Use never inherits git/worktree branch
  // semantics. Those protections remain mandatory for repo tools below.
  if (tool === 'computer.permissions') return JSON.stringify(await nativeComputerUse('permissions.status', args));
  if (tool === 'computer.permissions.request_screen') return JSON.stringify(await nativeComputerUse('permissions.request_screen', args));
  if (tool === 'computer.permissions.request_accessibility') return JSON.stringify(await nativeComputerUse('permissions.request_accessibility', args));
  if (tool === 'screen.displays') return JSON.stringify(await nativeComputerUse('screen.displays', args));
  if (tool === 'screen.observe') return screenObserve(args);
  if (tool === 'pointer.position') return JSON.stringify(await nativeComputerUse('pointer.position', args));
  if (tool === 'pointer.move') return JSON.stringify(await nativeComputerUse('pointer.move', args));
  if (tool === 'pointer.click') return JSON.stringify(await nativeComputerUse('pointer.click', args));
  if (tool === 'pointer.double_click') return JSON.stringify(await nativeComputerUse('pointer.double_click', args));
  if (tool === 'pointer.right_click') return JSON.stringify(await nativeComputerUse('pointer.right_click', args));
  if (tool === 'pointer.drag') return JSON.stringify(await nativeComputerUse('pointer.drag', args));
  if (tool === 'pointer.scroll') return JSON.stringify(await nativeComputerUse('pointer.scroll', args));
  if (tool === 'keyboard.type') return JSON.stringify(await nativeComputerUse('keyboard.type', args));
  if (tool === 'keyboard.key') return JSON.stringify(await nativeComputerUse('keyboard.key', args));
  if (tool === 'app.list') return JSON.stringify(await nativeComputerUse('app.list', args));
  if (tool === 'app.frontmost') return JSON.stringify(await nativeComputerUse('app.frontmost', args));
  if (tool === 'app.open') return JSON.stringify(await nativeComputerUse('app.open', args));
  if (tool === 'app.focus') return JSON.stringify(await nativeComputerUse('app.focus', args));
  if (tool === 'window.list') return JSON.stringify(await nativeComputerUse('window.list', args));
  if (tool === 'camera.snapshot') return cameraSnapshot();
  // 20 nov: "AXE, hou de Mac wakker" -- vaste woorden, zie macSchakelaars.mjs.
  if (tool === 'mac.schakel') return JSON.stringify(await macSchakel(String(args.schakelaar ?? '')));
  // 20 nov: "op de Mac mini pakt AXE nog steeds de focus". De app schrijft elk
  // focusmoment van een AXE-venster naar ~/.axe/focus.log (lib.rs log_focus),
  // maar dat log stond buiten wat de worker mag lezen. Alleen dit ene bestand,
  // alleen de staart, alleen lezen -- plus welke app nu vooraan staat.
  if (tool === 'axe.focus_log') {
    const pad = join(homedir(), '.axe', 'focus.log');
    let staart = '(geen focus.log)';
    try {
      const regels = (await readFile(pad, 'utf8')).trim().split('\n');
      const n = Math.min(Math.max(Number(args.regels) || 60, 1), 400);
      staart = regels.slice(-n).join('\n');
    } catch { /* bestand ontbreekt: dan pakte AXE de focus hier nooit */ }
    let vooraan = null;
    try { vooraan = await nativeComputerUse('app.frontmost', {}); } catch { /* geen rechten */ }
    // Ook de notch-plaatsing (20 nov): "tegen de bovenrand?" kon op de Mac
    // mini niemand meten, want ~/.axe is verborgen en dus niet leesbaar.
    let notch = '(geen notch.log)';
    try { notch = (await readFile(join(homedir(), '.axe', 'notch.log'), 'utf8')).trim().split('\n').slice(-8).join('\n'); } catch { /* nog nooit geplaatst */ }
    return JSON.stringify({ nu: Math.floor(Date.now() / 1000), vooraan, focus_log: staart, notch_log: notch });
  }

  // Machine-scoped reads must not depend on a git checkout. Personal Computer
  // Use is allowed to inspect these three explicit home folders even if this
  // Mac happens not to have the requested repo/workspace mounted.
  if (tool === 'personal.files.list') {
    const requested = String(args.path ?? '').trim();
    const allowed = new Map([
      ['Desktop', join(homedir(), 'Desktop')],
      ['Documents', join(homedir(), 'Documents')],
      ['Downloads', join(homedir(), 'Downloads')],
    ]);
    const dir = allowed.get(requested);
    if (!dir) throw new Error(`personal.files.list only allows Desktop, Documents, or Downloads; got '${requested}'`);
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.') && !DENY_NAMES.test(e.name))
      .slice(0, 200)
      .map(e => (e.isDirectory() ? `${e.name}/` : e.name))
      .join('\n') || '(empty)';
  }

  // Denk-aanroep van het lus-brein: geen worktree, geen werkbon, alleen lezen (denkRun.mjs).
  if (args.denk === true && ['codex.run', 'claude_code.run', 'cursor.run'].includes(tool)) {
    return denk(tool, args);
  }

  const ws = WORKSPACES[workspace];
  if (!ws) throw new Error(`unknown workspace '${workspace}'`);
  let root = resolve(ws.root);
  const hoofdRoot = root;

  // Third and last check on protected branches — see the header.
  let branch = (await git(root, 'branch', '--show-current')).trim();
  const writes = !READ_ONLY.has(tool);

  /* 18 nov (Luka: "waarom failen die dingen"): een agent-run (codex/claude/
     cursor) op de hoofdmap stond altijd op 'orchestrator' en werd hieronder
     geweigerd -- terecht, want dat is Luka's eigen checkout waar de autosync
     op draait. Maar niemand maakte de werkbranch aan, dus faalde élke run.
     Nu: zo'n run krijgt zijn EIGEN git-worktree op een nieuwe branch
     axe/<datum>-<id>, naast de hoofdmap. Luka's checkout en orchestrator
     blijven onaangeroerd; het werk staat op die branch, klaar voor een PR. */
  const AGENT_RUNS = new Set(['codex.run', 'claude_code.run', 'cursor.run']);
  if (writes && ws.protected.includes(branch) && AGENT_RUNS.has(tool)) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const id = Math.random().toString(36).slice(2, 8);
    const nieuweBranch = `axe/${stamp}-${id}`;
    const pad = join(homedir(), '.axe', 'worktrees', `${workspace.replace(/\W+/g, '-').toLowerCase()}-${stamp}-${id}`);
    await mkdir(dirname(pad), { recursive: true });
    await git(root, 'worktree', 'add', '-b', nieuweBranch, pad, 'HEAD');
    root = pad;
    branch = nieuweBranch;
  }
  // Punt 3 (19 nov): waar begon deze agent-run? Daartegen meten we straks
  // wat hij opleverde (commits + diff), zodat AXE niet op zijn woord hoeft
  // te vertrouwen.
  const basis = AGENT_RUNS.has(tool) ? (await git(root, 'rev-parse', 'HEAD')).trim() : null;
  // Creating a NEW feature branch is precisely how AXE gets off a protected
  // branch, so that one operation must be allowed while standing on
  // orchestrator/main. Every other write remains blocked here.
  const mayLeaveProtected = tool === 'git.create_branch';
  if (writes && ws.protected.includes(branch) && !mayLeaveProtected) {
    throw new Error(
      `refusing to ${tool} while on protected branch '${branch}'. Create a feature branch first.`,
    );
  }

  switch (tool) {
    case 'system.info': {
      const sourceCommit = (await git(REPO, 'rev-parse', '--short', 'HEAD')).trim();
      return `host ${hostname()}\nworkspace ${workspace}\nroot ${root}\nbranch ${branch}\nworker_source ${sourceCommit}\nnode ${process.version}`;
    }


    case 'git.branch':  return branch || '(detached)';
    case 'git.status':  return git(root, 'status', '--porcelain', '-b');
    case 'git.diff':    return git(root, 'diff', '--stat');
    case 'git.log':     return git(root, 'log', '-5', '--oneline');

    case 'files.list': {
      const dir = await leesPad(root, args.path ?? '.');
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter(e => !e.name.startsWith('.') && !DENY_NAMES.test(e.name))
        .slice(0, 200)
        .map(e => (e.isDirectory() ? `${e.name}/` : e.name))
        .join('\n') || '(empty)';
    }

    case 'files.read': {
      const file = await leesPad(root, args.path);
      const s = await stat(file);
      if (s.size > 512 * 1024) throw new Error(`file too large (${Math.round(s.size / 1024)}kb)`);
      return (await readFile(file, 'utf8')).slice(0, MAX_OUTPUT);
    }

    case 'files.write': {
      const file = safePath(root, args.path);
      const body = String(args.content ?? '');
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body, 'utf8');
      return `wrote ${Buffer.byteLength(body, 'utf8')} bytes to ${file}`;
    }

    case 'files.delete': {
      const file = safePath(root, args.path);
      if (file === root) throw new Error('refusing to delete the workspace root');
      await rm(file, { recursive: true, force: false });
      return `deleted ${file}`;
    }

    case 'files.search': {
      const q = String(args.query ?? '').trim();
      if (!q) throw new Error('files.search needs a query');
      /* Met een pad buiten de werkmap: zoek op bestandsnaam via Spotlight
         (mdfind), en laat alleen zien wat leesWeigering doorlaat. */
      if (args.path) {
        const waar = await leesPad(root, args.path);
        if (!(waar === root || waar.startsWith(root + sep))) {
          const uit = await run('mdfind', ['-onlyin', waar, '-name', q], root);
          const ok = String(uit).split('\n').filter(r => r && !leesWeigering(resolve(r))).slice(0, 100);
          return ok.join('\n') || '(nothing found)';
        }
      }
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

    case 'git.commit': {
      const message = String(args.message ?? '').trim();
      const paths = Array.isArray(args.paths)
        ? args.paths.map(p => String(p)).filter(Boolean)
        : [];
      if (!message) throw new Error('git.commit needs a message');
      if (!paths.length) throw new Error('git.commit needs explicit paths; refusing implicit git add -A');
      const relPaths = paths.map(p => relative(root, safePath(root, p)) || '.');
      await git(root, 'add', '--', ...relPaths);
      return git(root, 'commit', '-m', message);
    }

    case 'git.push': {
      const remote = String(args.remote ?? 'origin').trim();
      const target = String(args.branch ?? branch).trim();
      if (!/^[A-Za-z0-9._-]+$/.test(remote)) throw new Error('invalid git remote');
      if (!/^[A-Za-z0-9._\/-]+$/.test(target)) throw new Error('invalid git branch');
      return git(root, 'push', remote, target);
    }

    case 'git.merge': {
      const source = String(args.branch ?? args.source ?? '').trim();
      if (!source || !/^[A-Za-z0-9._\/-]+$/.test(source)) throw new Error('git.merge needs a valid source branch');
      return git(root, 'merge', '--no-edit', source);
    }

    case 'git.pr_open': {
      const title = String(args.title ?? '').trim();
      const body = String(args.body ?? '').trim();
      const base = String(args.base ?? 'orchestrator').trim();
      if (!title) throw new Error('git.pr_open needs a title');
      if (!/^[A-Za-z0-9._\/-]+$/.test(base)) throw new Error('invalid PR base branch');
      const gh = vindBin('gh', 'AXE_GH_BIN');
      return run(gh, ['pr', 'create', '--title', title, '--body', body, '--base', base, '--head', branch], root);
    }

    case 'terminal.typecheck':
    case 'terminal.lint':
    case 'terminal.test':
    case 'terminal.build':
    case 'terminal.install': {
      const [cmd, argv] = COMMANDS[tool];
      return run(cmd, argv, root);
    }

    case 'terminal.free': {
      const command = String(args.command ?? args.cmd ?? '').trim();
      if (!command) throw new Error('terminal.free needs a command');
      // This tool is consequential and reaches here only after approval for
      // the exact arguments. Keep the free shell in one visibly dangerous
      // tool instead of smuggling shell parsing into all the safe tools.
      return run('/bin/zsh', ['-lc', command], root);
    }

    case 'claude_code.run': {
      const prompt = String(args.prompt ?? '').trim();
      if (!prompt) throw new Error('claude_code.run needs a prompt');
      const bin = vindBin('claude', 'AXE_CLAUDE_BIN');
      const seat = String(args.seat ?? 'claude');
      const argv = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits',
        '--allowedTools', ...CLAUDE_MAG_DRAAIEN];
      const model = String(args.model ?? '').trim();
      if (model) argv.push('--model', model);
      let uit;
      try {
        uit = await run(bin, argv, root, seatChildEnv(seat), AGENT_TIMEOUT_MS);
      } catch (e) {
        throw await metBewaardWerk(e, root, hoofdRoot, basis, branch);
      }
      noteerLimiet(seat, uit, { geslaagd: true }); // 24 nov: anders bleef een stoel op zijn sessielimiet "vrij"
      return metOplevering(root, branch, basis, hoofdRoot, uit);
    }

    case 'codex.run': {
      const prompt = String(args.prompt ?? '').trim();
      if (!prompt) throw new Error('codex.run needs a prompt');
      const seat = String(args.seat ?? 'codex');
      const model = String(args.model ?? '').trim();
      let uit;
      try {
        uit = await runCodexWithFallback(prompt, root, seat, model);
      } catch (e) {
        // 24 nov: codex 'model_not_found' gooide hier, en de worktree van de run bleef
        // staan -- 216 mislukte runs = 219 mappen op de iMac. Leeg = meteen weg.
        noteerLimiet(seat, String(e?.message ?? e));
        throw await metBewaardWerk(e, root, hoofdRoot, basis, branch);
      }
      noteerLimiet(seat, uit, { geslaagd: true });
      return metOplevering(root, branch, basis, hoofdRoot, uit);
    }

    case 'cursor.run': {
      const prompt = String(args.prompt ?? '').trim();
      if (!prompt) throw new Error('cursor.run needs a prompt');
      const bin = vindBin('cursor-agent', 'AXE_CURSOR_BIN');
      const argv = ['-p', prompt, '--output-format', 'json', '--force'];
      const model = String(args.model ?? '').trim();
      if (model) argv.push('--model', model);
      const seat = String(args.seat ?? 'cursor');
      let uit;
      try {
        uit = await run(bin, argv, root, seatChildEnv(seat), AGENT_TIMEOUT_MS);
      } catch (e) {
        throw await metBewaardWerk(e, root, hoofdRoot, basis, branch);
      }
      noteerLimiet(seat, uit, { geslaagd: true });
      return metOplevering(root, branch, basis, hoofdRoot, uit);
    }

    default:
      // Reached only for a tool that is on the ladder but has no handler yet —
      // say so precisely, so it reads as "not built" rather than "refused".
      throw new Error(`'${tool}' is not implemented in this worker yet`);
  }
}

/* Punt 3: de git-feiten onder het antwoord van de agent. De VPS leest dit
   blok (device_actions.oplevering) naast de drie kopjes van de agent zelf. */
async function metOplevering(root, branch, basis, hoofdRoot, uit) {
  if (!basis) return uit;
  const bewaard = await bewaarOpenWerk(root, hoofdRoot);
  const veilig = async (...a) => { try { return (await git(root, ...a)).trim(); } catch { return ''; } };
  const commits = await veilig('log', '--oneline', `${basis}..HEAD`);
  const diff = await veilig('diff', '--stat', basis);
  const open = await veilig('status', '--porcelain');
  return `${uit}\n\n## Oplevering (Mac)\nbranch: ${branch}\nworktree: ${root}\n`
    + (bewaard ? `bewaard: ${bewaard}\n` : '')
    + `commits:\n${commits || '(geen commits)'}\n`
    + (open ? `niet gecommit:\n${open}\n` : '')
    + `diff:\n${diff || '(geen wijzigingen)'}\n`
    + await naRunOpruimen(root, hoofdRoot, basis);
}

/* 24 nov (Luka: "niet iets voor niks gemaakt"): een agent die bestanden aanpaste
   maar niet committe -- Claude Code mocht headless geen git draaien, Codex' sandbox
   kan .git van een worktree niet schrijven -- liet zijn werk los in de map achter.
   Vier echte, goede wijzigingen lagen zo op 23 nov ongezien in ~/.axe/worktrees.
   Nu legt de worker zulk werk zelf vast op de EIGEN axe/-branch van de run (nooit
   op orchestrator): het gaat niet verloren en de review ziet het. 'bewaard:' zegt
   de VPS dat de agent het niet zelf testte en committe -- dus niet klaar. */
async function bewaarOpenWerk(root, hoofdRoot) {
  if (!root.startsWith(WORKTREE_MAP + sep) || root === hoofdRoot) return '';
  try { return await bewaarWerk(gitStreng, root); } catch { return ''; }
}

/* 24 nov live: Claude Code op de Mac mini repareerde de corporateJets-feed maar liep
   na 900 s af voor hij committe; de VPS zag alleen "timed out" en zijn werk lag los
   in de map. Een run die gooit (time-out, codex-fout) legt open werk nu vast op zijn
   EIGEN axe/-branch en zegt dat in de fout; een lege map gaat meteen weg. */
async function denk(tool, args) {
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new Error(`${tool} needs a prompt`);
  const seat = String(args.seat ?? tool.split('_')[0].split('.')[0]);
  const dir = await mkdtemp(join(tmpdir(), 'axe-denk-'));
  try {
    const [naam, argv, uitPad] = denkArgv(tool, prompt, dir, String(args.model ?? '').trim());
    const envNaam = { codex: 'AXE_CODEX_BIN', claude: 'AXE_CLAUDE_BIN', 'cursor-agent': 'AXE_CURSOR_BIN' }[naam];
    const r = await runStatus(vindBin(naam, envNaam), argv, dir, seatChildEnv(seat), DENK_TIMEOUT_MS);
    let uit = r.out;
    if (uitPad) uit = (await readFile(uitPad, 'utf8').catch(() => '')).trim() || r.out;
    noteerLimiet(seat, uit, { geslaagd: r.code === 0 });
    if (r.code !== 0) throw new Error(`${tool} (denk) exit ${r.code}: ${r.out.slice(-400)}`);
    return uit;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function metBewaardWerk(e, root, hoofdRoot, basis, branch) {
  const bewaard = await bewaarOpenWerk(root, hoofdRoot);
  if (!bewaard) await naRunOpruimen(root, hoofdRoot, basis);
  const msg = String(e?.message ?? e);
  return new Error(bewaard ? `${msg} -- werk bewaard op ${branch} als ${bewaard}` : msg);
}

/* 24 nov: een run zonder commits en zonder wijzigingen laat niets achter --
   de worktree en zijn lege branch gaan meteen weg (38 GB op de iMac). */
async function naRunOpruimen(root, hoofdRoot, basis) {
  if (!root.startsWith(WORKTREE_MAP + sep) || root === hoofdRoot) return '';
  try {
    const r = await ruimWorktree(gitStreng, hoofdRoot, root, { basis, naRun: true });
    return r.actie === 'weg_met_branch' ? 'worktree: opgeruimd (geen wijzigingen)\n' : '';
  } catch { return ''; }
}

async function veegronde() {
  try {
    const uit = await veegWorktrees(gitStreng, WORKTREE_MAP, p => hoofdRepoVan(p, f => readFile(f, 'utf8')));
    const weg = uit.filter(u => u.actie.startsWith('weg'));
    if (weg.length) console.log(`worktrees opgeruimd: ${weg.length} (${uit.length - weg.length} blijven)`);
  } catch (e) { console.log(`worktree-veegronde faalde: ${e?.message ?? e}`); }
}

/* ── loop ───────────────────────────────────────────────────────────────── */
let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('\nstopping…'); });

console.log(`axe-computer-worker ${WORKER_ID}`);
console.log(`workspaces: ${Object.keys(WORKSPACES).join(', ')}`);
console.log('polling core_tasks — Ctrl-C to stop\n');

setInterval(heartbeat, 15_000);
setInterval(veegronde, 60 * 60_000);
veegronde();
await heartbeat();

const EIGEN_MAP = new URL('.', import.meta.url).pathname;
const CODE_BIJ_START = vingerafdruk(EIGEN_MAP);

while (!stopping) {
  try {
    // Tussen twee taken: nieuwe code van autosync? Stop; launchd (KeepAlive) start de nieuwe.
    if (codeVeranderd(EIGEN_MAP, CODE_BIJ_START)) {
      console.log('nieuwe worker-code gevonden — stoppen zodat launchd hem opnieuw start');
      break;
    }
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
