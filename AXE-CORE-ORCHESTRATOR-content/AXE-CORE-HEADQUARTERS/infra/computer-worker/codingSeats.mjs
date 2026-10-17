/**
 * Coding seats for the Mac mini computer-worker heartbeat.
 *
 * Probes local CLI logins (no tokens leave this file) and upserts
 * core_coding_seats. The runner writes ~/.axe/coding-seats.json for the
 * current task and last known limit; this file merges that with a live probe.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export const SEATS = [
  { id: 'claude',  provider: 'claude', login: 'claude auth login', configDir: '~/.claude' },
  { id: 'claude2', provider: 'claude', login: 'CLAUDE_CONFIG_DIR=~/.claude-tweede claude auth login', configDir: '~/.claude-tweede' },
  { id: 'claude3', provider: 'claude', login: 'CLAUDE_CONFIG_DIR=~/.claude-derde claude auth login', configDir: '~/.claude-derde' },
  { id: 'claude4', provider: 'claude', login: 'CLAUDE_CONFIG_DIR=~/.claude-vierde claude auth login', configDir: '~/.claude-vierde' },
  { id: 'codex',   provider: 'codex',  login: 'codex login', home: '~/.codex' },
  { id: 'codex2',  provider: 'codex',  login: 'CODEX_HOME=~/.codex-tweede codex login', home: '~/.codex-tweede' },
  { id: 'codex3',  provider: 'codex',  login: 'CODEX_HOME=~/.codex-derde codex login', home: '~/.codex-derde' },
  { id: 'cursor',  provider: 'cursor', login: 'cursor-agent login' },
];

export function expandHome(p, home = homedir()) {
  return p.replace(/^~/, home);
}

export function emailFromCodexAuth(auth) {
  const tokens = auth && typeof auth === 'object' ? auth.tokens : null;
  if (!tokens || typeof tokens !== 'object') return { loggedIn: false, email: null };
  const jwt = typeof tokens.id_token === 'string' ? tokens.id_token : '';
  if (!tokens.access_token && !jwt) return { loggedIn: false, email: null };
  const deel = jwt.split('.')[1] || '';
  if (!deel) return { loggedIn: true, email: null };
  try {
    const pad = deel + '='.repeat((4 - (deel.length % 4)) % 4);
    const claims = JSON.parse(Buffer.from(pad, 'base64url').toString('utf8'));
    return { loggedIn: true, email: typeof claims.email === 'string' ? claims.email : null };
  } catch {
    return { loggedIn: true, email: null };
  }
}

export function claudeStatusFromText(tekst) {
  try {
    const start = tekst.indexOf('{');
    const end = tekst.lastIndexOf('}');
    if (start < 0 || end < start) return { loggedIn: null, email: null };
    const d = JSON.parse(tekst.slice(start, end + 1));
    return {
      loggedIn: typeof d.loggedIn === 'boolean' ? d.loggedIn : null,
      email: typeof d.email === 'string' && d.email ? d.email : null,
    };
  } catch {
    return { loggedIn: null, email: null };
  }
}

export function parseLimitReset(bericht, now = Date.now()) {
  if (!/usage limit|rate limit|quota exceeded|too many requests|\b429\b/i.test(bericht || '')) return null;
  const m = (bericht || '').match(/try again at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return now + 60 * 60 * 1000;
  let uur = Number(m[1]);
  const minuut = Number(m[2]);
  const helft = m[3]?.toUpperCase();
  if (helft === 'PM' && uur < 12) uur += 12;
  if (helft === 'AM' && uur === 12) uur = 0;
  if (uur > 23 || minuut > 59) return now + 60 * 60 * 1000;
  const doel = new Date(now);
  doel.setHours(uur, minuut, 0, 0);
  if (doel.getTime() <= now) doel.setDate(doel.getDate() + 1);
  return doel.getTime();
}

function readJsonSyncSafe(p) {
  try {
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

async function probeClaude(seat, env) {
  const dir = expandHome(seat.configDir);
  const bin = env.CLAUDE_BIN || env.AXE_CLAUDE_BIN || 'claude';
  try {
    const { stdout, stderr } = await execFileP(bin, ['auth', 'status'], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: dir, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ANTHROPIC_BASE_URL: '', CLAUDECODE: '' },
      timeout: 8000,
    });
    return claudeStatusFromText(`${stdout || ''}${stderr || ''}`);
  } catch (err) {
    const tekst = `${err?.stdout || ''}${err?.stderr || ''}${err?.message || ''}`;
    const parsed = claudeStatusFromText(tekst);
    if (parsed.loggedIn != null) return parsed;
    return { loggedIn: /not logged in|please (log|sign) in/i.test(tekst) ? false : null, email: null };
  }
}

async function probeCodex(seat) {
  const home = expandHome(seat.home);
  try {
    const raw = await readFile(join(home, 'auth.json'), 'utf8');
    return emailFromCodexAuth(JSON.parse(raw));
  } catch {
    return { loggedIn: false, email: null };
  }
}

async function probeCursor(env) {
  const bin = env.CURSOR_BIN || env.AXE_CURSOR_BIN || 'cursor-agent';
  try {
    const { stdout, stderr } = await execFileP(bin, ['status'], { timeout: 8000 });
    const tekst = `${stdout || ''}${stderr || ''}`;
    const mail = tekst.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    const loggedIn = Boolean(mail) || (/logged in/i.test(tekst) && !/not logged in/i.test(tekst));
    return { loggedIn: tekst.trim() ? loggedIn : null, email: mail ? mail[0] : null };
  } catch {
    return { loggedIn: null, email: null };
  }
}

export function readSeatSnapshot(home = homedir()) {
  return readJsonSyncSafe(join(home, '.axe', 'coding-seats.json'))
    || readJsonSyncSafe(join(home, '.axe', 'agent-usage.json'))
    || { seats: {}, events: [] };
}

export async function collectSeats({ env = process.env, home = homedir() } = {}) {
  const snap = readSeatSnapshot(home);
  const snapSeats = snap.seats && typeof snap.seats === 'object' ? snap.seats : {};
  const events = Array.isArray(snap.events) ? snap.events : [];
  const now = Date.now();

  const rows = await Promise.all(SEATS.map(async (seat) => {
    let login = { loggedIn: null, email: null };
    if (seat.provider === 'claude') login = await probeClaude(seat, env);
    else if (seat.provider === 'codex') login = await probeCodex(seat);
    else login = await probeCursor(env);

    const known = snapSeats[seat.id] || {};
    const lastEvent = events.filter(e => e && e.engine === seat.id && e.limit_message).at(-1);
    const limitMsg = known.limit_message || lastEvent?.limit_message || null;
    const untilMs = known.limit_until
      ? Number(known.limit_until) * (Number(known.limit_until) < 1e12 ? 1000 : 1)
      : (lastEvent?.limit_until ? Number(lastEvent.limit_until) * 1000 : parseLimitReset(limitMsg || '', now));
    const rateLimited = Boolean(untilMs && untilMs > now);

    return {
      seat_id: seat.id,
      provider: seat.provider,
      email: login.email,
      logged_in: login.loggedIn,
      login_command: seat.login,
      current_task: known.task || null,
      rate_limited: rateLimited,
      rate_limit_until: rateLimited ? new Date(untilMs).toISOString() : null,
      last_limit_message: limitMsg,
      remaining_note: 'CLI does not expose exact remaining quota.',
    };
  }));
  return rows;
}

export function seatRowsForUpsert(rows, { deviceId, host, now = new Date() }) {
  const seen = now.toISOString();
  return rows.map((r) => ({
    id: `${deviceId}:${r.seat_id}`,
    seat_id: r.seat_id,
    provider: r.provider,
    machine: deviceId,
    host,
    email: r.email,
    logged_in: r.logged_in,
    login_command: r.login_command,
    current_task: r.current_task,
    rate_limited: r.rate_limited,
    rate_limit_until: r.rate_limit_until,
    last_limit_message: r.last_limit_message,
    remaining_note: r.remaining_note,
    last_seen_at: seen,
    updated_at: seen,
  }));
}

let reporting = false;
export async function reportCodingSeats(sbOrThrow, { deviceId, host, env, home }) {
  if (reporting) return;
  reporting = true;
  try {
    const rows = seatRowsForUpsert(await collectSeats({ env, home }), { deviceId, host });
    if (!rows.length) return;
    await sbOrThrow('core_coding_seats?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
  } finally {
    reporting = false;
  }
}
