/**
 * adb.mjs — the Samsung, as something AXE can look at and touch.
 *
 * The bridge already had a path to the machine AXE runs on. It had none to the
 * phone sitting next to it, so "open WhatsApp" or "search this on my phone"
 * could not work however it was phrased — same gap `localBridgeService` closed
 * for the worktree, one device over.
 *
 * ## Why this is not the /run allowlist
 *
 * `/run` maps a key to a FIXED argv, which is what makes it safe: there is no
 * caller-supplied string anywhere near a command. Phone control cannot work
 * that way — a tap needs coordinates, a search needs text. So every value here
 * is validated against a shape before it is used, and the shapes are narrow.
 *
 * ## The trap that decides this file's design
 *
 * `adb shell <args>` does NOT execute argv on the device. adb joins the
 * arguments into ONE STRING and hands it to the device's `sh`. So passing
 * argv through execFile — which is what makes the rest of the bridge
 * injection-proof — buys nothing here: `input text "a; reboot"` really does
 * run `reboot` on the phone. Every value crossing to the device shell is
 * therefore single-quote escaped by `q()`, and the ones that have no business
 * containing punctuation (packages, keycodes) are allowlisted outright.
 *
 * Read-only actions (screenshot, ui_dump, current_app, devices) change nothing
 * and are safe to run unattended. Everything else moves the phone and is gated
 * on Luka's approval one layer up, in the tool registry.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/**
 * Where adb actually is.
 *
 * Measured, not assumed: on this Mac adb is NOT on PATH — it ships inside the
 * Android SDK. A bridge that shells out to a bare `adb` would report "phone
 * not connected" for a phone that is plugged in and fine, which is exactly the
 * kind of lie this codebase keeps deciding not to tell.
 */
const ADB_CANDIDATES = [
  process.env.AXE_ADB_PATH,
  `${homedir()}/Library/Android/sdk/platform-tools/adb`,
  `${homedir()}/Android/Sdk/platform-tools/adb`,
  '/opt/homebrew/bin/adb',
  '/usr/local/bin/adb',
].filter(Boolean).map(p => resolve(p));

export function adbPath() {
  return ADB_CANDIDATES.find(p => existsSync(p)) ?? null;
}

/** Keys worth pressing. An allowlist, because a keycode is never user prose. */
const KEYCODES = new Set([
  'HOME', 'BACK', 'ENTER', 'TAB', 'DEL', 'ESCAPE', 'SPACE',
  'APP_SWITCH', 'MENU', 'SEARCH', 'NOTIFICATION',
  'VOLUME_UP', 'VOLUME_DOWN', 'MUTE',
  'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT', 'DPAD_CENTER',
  'MEDIA_PLAY_PAUSE', 'MEDIA_NEXT', 'MEDIA_PREVIOUS',
  'PAGE_UP', 'PAGE_DOWN', 'MOVE_END', 'MOVE_HOME',
]);

/**
 * Deliberately absent: POWER and SLEEP/WAKEUP.
 *
 * A model that can turn the screen off can also make itself unobservable —
 * and the whole point of the screenshot loop is that you can see what it did.
 */

const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;

/** Single-quote for the DEVICE's shell. See the header: adb re-parses. */
function q(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function int(v, name, { min = 0, max = 20000 } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer ${min}..${max}, got ${JSON.stringify(v)}`);
  }
  return n;
}

function httpUrl(v) {
  let u;
  try { u = new URL(String(v)); } catch { throw new Error(`not a URL: ${JSON.stringify(v)}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`only http(s) URLs may be opened, got ${u.protocol}`);
  }
  return u.toString();
}

function exec(bin, args, { binary = false, timeout = 30_000 } = {}) {
  return new Promise((res, rej) => {
    execFile(bin, args, {
      timeout,
      maxBuffer: 32 * 1024 * 1024,
      encoding: binary ? 'buffer' : 'utf8',
    }, (err, stdout, stderr) => {
      if (err && !stdout?.length) {
        rej(new Error(String(stderr || err.message).trim().slice(0, 500)));
        return;
      }
      res({ stdout, stderr: binary ? '' : String(stderr) });
    });
  });
}

/**
 * Actions, each returning the argv AFTER `adb -s <serial>`.
 *
 * `shell:` entries are strings because that is what the device shell receives;
 * every interpolation goes through q() or an allowlist above.
 */
const ACTIONS = {
  // ── read-only ──────────────────────────────────────────────────────────
  screenshot: {
    readonly: true,
    build: () => ({ args: ['exec-out', 'screencap', '-p'], binary: true }),
  },
  current_app: {
    readonly: true,
    build: () => ({ args: ['shell', 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp"'] }),
  },
  ui_dump: {
    readonly: true,
    // uiautomator writes to a file; exec-out cat brings it back without the
    // "UI hierchary dumped to" chatter that /dev/tty mixes into the XML.
    build: () => ({
      args: ['shell', 'uiautomator dump /sdcard/axe_dump.xml >/dev/null 2>&1 && cat /sdcard/axe_dump.xml'],
      timeout: 45_000,
    }),
  },
  screen_size: {
    readonly: true,
    build: () => ({ args: ['shell', 'wm size'] }),
  },

  // ── moves the phone ────────────────────────────────────────────────────
  tap: {
    build: (p) => ({ args: ['shell', `input tap ${int(p.x, 'x')} ${int(p.y, 'y')}`] }),
    describe: (p) => `tap at ${p.x},${p.y}`,
  },
  swipe: {
    build: (p) => ({
      args: ['shell', `input swipe ${int(p.x1, 'x1')} ${int(p.y1, 'y1')} ${int(p.x2, 'x2')} ${int(p.y2, 'y2')} ${int(p.ms ?? 300, 'ms', { min: 20, max: 5000 })}`],
    }),
    describe: (p) => `swipe ${p.x1},${p.y1} → ${p.x2},${p.y2}`,
  },
  text: {
    build: (p) => {
      const t = String(p.text ?? '');
      if (!t) throw new Error('text required');
      if (t.length > 500) throw new Error('text too long (max 500)');
      // `input text` reads a space as an argument separator; %s is its escape.
      return { args: ['shell', `input text ${q(t.replace(/ /g, '%s'))}`] };
    },
    describe: (p) => `type ${JSON.stringify(String(p.text).slice(0, 60))}`,
  },
  key: {
    build: (p) => {
      const k = String(p.key ?? '').toUpperCase();
      if (!KEYCODES.has(k)) throw new Error(`keycode not allowed: ${k}`);
      return { args: ['shell', `input keyevent KEYCODE_${k}`] };
    },
    describe: (p) => `press ${String(p.key).toUpperCase()}`,
  },
  open_url: {
    build: (p) => ({
      args: ['shell', `am start -a android.intent.action.VIEW -d ${q(httpUrl(p.url))}`],
      timeout: 45_000,
    }),
    describe: (p) => `open ${p.url}`,
  },
  launch: {
    build: (p) => {
      const pkg = String(p.package ?? '');
      if (!PACKAGE_RE.test(pkg)) throw new Error(`not a package name: ${JSON.stringify(pkg)}`);
      return { args: ['shell', `monkey -p ${q(pkg)} -c android.intent.category.LAUNCHER 1`], timeout: 45_000 };
    },
    describe: (p) => `launch ${p.package}`,
  },
};

export const ADB_READONLY = new Set(
  Object.entries(ACTIONS).filter(([, a]) => a.readonly).map(([k]) => k),
);

/**
 * Turn a uiautomator dump into the few dozen things you can actually press.
 *
 * Measured on a Google results page: the raw XML was over 200 KB — past this
 * file's own output cap, so the model would have received XML truncated
 * mid-node, and a malformed tail is worse than no dump at all. It is also far
 * more than a chat turn should ever carry.
 *
 * So the parse happens here, not in the prompt. What survives is what a
 * finger could hit: a label, a centre point, and whether it takes text.
 * Everything uiautomator reports at [0,0][0,0] is scrolled out of view and
 * cannot be tapped — offering those to the model invites a tap on nothing.
 */
export function parseUiDump(xml, { width = 0, height = 0 } = {}) {
  const els = [];
  const seen = new Set();

  for (const m of String(xml).matchAll(/<node\b[^>]*\/?>/g)) {
    const tag = m[0];
    const attr = (n) => new RegExp(`\\s${n}="([^"]*)"`).exec(tag)?.[1] ?? '';
    const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tag);
    if (!b) continue;

    const [x1, y1, x2, y2] = b.slice(1, 5).map(Number);
    if (x2 <= x1 || y2 <= y1) continue;                       // zero-area: not on screen
    if (height && (y1 >= height || y2 <= 0)) continue;         // scrolled past the viewport
    if (width && (x1 >= width || x2 <= 0)) continue;

    const label = (attr('text') || attr('content-desc')).trim();
    const clickable = attr('clickable') === 'true';
    const editable = attr('class').endsWith('EditText') || attr('focusable') === 'true' && attr('class').includes('EditText');
    if (!label && !clickable) continue;

    const x = Math.round((x1 + x2) / 2);
    const y = Math.round((y1 + y2) / 2);
    // One row per label+point: uiautomator nests a clickable wrapper around
    // its own text node, so every button otherwise arrives twice.
    const dedupe = `${label}@${x},${y}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    els.push({
      label: label.slice(0, 80),
      x, y,
      tap: clickable,
      ...(editable ? { editable: true } : {}),
      ...(attr('resource-id') ? { id: attr('resource-id').split('/').pop().slice(0, 40) } : {}),
    });
  }

  // Reading order, so "the third result" means what a person would mean.
  els.sort((a, b) => a.y - b.y || a.x - b.x);
  return els;
}

export function describeAdb(action, params = {}) {
  const a = ACTIONS[action];
  if (!a) return action;
  try { return a.describe ? a.describe(params) : action; } catch { return action; }
}

/** Devices adb can currently see. Serial + model, nothing else. */
export async function adbDevices() {
  const bin = adbPath();
  if (!bin) throw new Error('adb not found — set AXE_ADB_PATH or install Android platform-tools');
  const { stdout } = await exec(bin, ['devices', '-l'], { timeout: 15_000 });
  return String(stdout)
    .split('\n')
    .slice(1)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('*'))
    .map(l => {
      const [serial, state] = l.split(/\s+/);
      const model = /model:(\S+)/.exec(l)?.[1] ?? null;
      return { serial, state, model };
    })
    .filter(d => d.serial);
}

/**
 * Run one action against one device.
 *
 * Returns `{ ok, action, stdout }`, or `{ ok, png }` for a screenshot. A
 * failure throws with adb's own words rather than a generic message: the
 * difference between "unauthorized" and "not connected" is the whole
 * diagnosis, and flattening it is how an evening gets lost.
 */
export async function runAdb(action, params = {}, serial = null) {
  const spec = ACTIONS[action];
  if (!spec) throw new Error(`adb action not allowed: ${action}`);

  const bin = adbPath();
  if (!bin) throw new Error('adb not found — set AXE_ADB_PATH or install Android platform-tools');

  const devices = await adbDevices();
  const usable = devices.filter(d => d.state === 'device');
  if (usable.length === 0) {
    const hint = devices.length
      ? `adb sees ${devices.map(d => `${d.serial} (${d.state})`).join(', ')} — unlock the phone and accept the USB-debugging prompt`
      : 'no device attached — plug the phone in, or pair it over wifi';
    throw new Error(hint);
  }
  const target = serial ?? usable[0].serial;
  if (!usable.some(d => d.serial === target)) {
    throw new Error(`device ${target} is not connected (adb sees: ${usable.map(d => d.serial).join(', ')})`);
  }

  const { args, binary = false, timeout = 30_000 } = spec.build(params);
  const { stdout } = await exec(bin, ['-s', target, ...args], { binary, timeout });

  if (binary) {
    const buf = Buffer.from(stdout);
    // screencap on a locked or mid-transition screen can return nothing; an
    // empty PNG rendered as a black box would read as a working screenshot.
    if (buf.length < 100) throw new Error('screencap returned no image — is the screen on?');
    return { ok: true, action, device: target, png: buf.toString('base64') };
  }

  const out = String(stdout);

  if (action === 'ui_dump') {
    // The root node's bounds ARE the viewport, so the off-screen filter costs
    // no extra round trip to `wm size`.
    const root = /bounds="\[0,0\]\[(\d+),(\d+)\]"/.exec(out);
    const elements = parseUiDump(out, {
      width: root ? Number(root[1]) : 0,
      height: root ? Number(root[2]) : 0,
    });
    return { ok: true, action, device: target, elements, count: elements.length };
  }

  return { ok: true, action, device: target, stdout: out.slice(0, 200_000) };
}
