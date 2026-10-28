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
  { id: 'cursor',  provider: 'cursor', login: 'cursor-agent login', apiKeyEnv: 'CURSOR_API_KEY' },
  { id: 'cursor2', provider: 'cursor', login: 'Set CURSOR2_API_KEY on this Mac (second Cursor seat)', apiKeyEnv: 'CURSOR2_API_KEY' },
];

export function expandHome(p, home = homedir()) {
  return p.replace(/^~/, home);
}

export function emailFromCodexAuth(auth) {
  const tokens = auth && typeof auth === 'object' ? auth.tokens : null;
  if (!tokens || typeof tokens !== 'object') return { loggedIn: false, email: null, orgId: null };
  const jwt = typeof tokens.id_token === 'string' ? tokens.id_token : '';
  if (!tokens.access_token && !jwt) return { loggedIn: false, email: null, orgId: null };
  const accountId = typeof tokens.account_id === 'string' ? tokens.account_id : null;
  const deel = jwt.split('.')[1] || '';
  if (!deel) return { loggedIn: true, email: null, orgId: accountId };
  try {
    const pad = deel + '='.repeat((4 - (deel.length % 4)) % 4);
    const claims = JSON.parse(Buffer.from(pad, 'base64url').toString('utf8'));
    const authClaim = claims['https://api.openai.com/auth'] || {};
    const org = typeof authClaim.chatgpt_account_id === 'string' ? authClaim.chatgpt_account_id : accountId;
    return { loggedIn: true, email: typeof claims.email === 'string' ? claims.email : null, orgId: org };
  } catch {
    return { loggedIn: true, email: null, orgId: accountId };
  }
}

export function emailFromClaudeOauth(oauth) {
  if (!oauth || typeof oauth !== 'object') return null;
  const inner = oauth.claudeAiOauth && typeof oauth.claudeAiOauth === 'object' ? oauth.claudeAiOauth : oauth;
  for (const v of [inner.email, inner.account, inner.user && inner.user.email]) {
    if (typeof v === 'string' && v.includes('@')) return v;
  }
  return null;
}

export function cursorStatusFromText(tekst, { hasApiKey = false } = {}) {
  const raw = tekst || '';
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const d = JSON.parse(raw.slice(start, end + 1));
      const user = d.user && typeof d.user === 'object' ? d.user : d;
      const emailRaw = d.email || d.userEmail || user.email || d.account;
      const email = typeof emailRaw === 'string' && emailRaw.includes('@') ? emailRaw : null;
      const auth = d.authenticated ?? d.loggedIn ?? d.logged_in;
      if (typeof auth === 'boolean') return { loggedIn: auth, email: auth ? email : null };
      if (email) return { loggedIn: true, email };
    }
  } catch { /* tekst */ }
  if (/not authenticated|not logged in|please (log|sign) in/i.test(raw) && !/logged in as/i.test(raw)) {
    return { loggedIn: hasApiKey ? true : false, email: null };
  }
  const mail = raw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (mail) return { loggedIn: true, email: mail[0] };
  if (/logged in/i.test(raw)) return { loggedIn: true, email: null };
  if (hasApiKey) return { loggedIn: true, email: null };
  if (!raw.trim()) return { loggedIn: hasApiKey ? true : null, email: null };
  return { loggedIn: null, email: null };
}

export function isRealLimitMessage(bericht) {
  if (!/usage limit|rate limit|quota exceeded|too many requests|\b429\b/i.test(bericht || '')) return false;
  if (/eindigde met|ended with/i.test(bericht || '')) return false;
  return true;
}

export function claudeStatusFromText(tekst) {
  try {
    const start = tekst.indexOf('{');
    const end = tekst.lastIndexOf('}');
    if (start < 0 || end < start) return { loggedIn: null, email: null };
    const d = JSON.parse(tekst.slice(start, end + 1));
    const loggedIn = typeof d.loggedIn === 'boolean' ? d.loggedIn : null;
    return {
      loggedIn,
      email: loggedIn === true && typeof d.email === 'string' && d.email ? d.email : null,
    };
  } catch {
    return { loggedIn: null, email: null };
  }
}

function withCliPath(env) {
  const extra = '/opt/homebrew/bin:/usr/local/bin';
  const path = env.PATH || process.env.PATH || '';
  if (path.split(':').includes('/opt/homebrew/bin')) return { ...env };
  return { ...env, PATH: `${extra}:${path}` };
}

function cliBin(env, keys, fallbackName) {
  for (const k of keys) {
    if (env[k]) return env[k];
  }
  const homebrew = `/opt/homebrew/bin/${fallbackName}`;
  if (existsSync(homebrew)) return homebrew;
  return fallbackName;
}

export function seatConfigured(seat, home = homedir(), env = process.env) {
  if (seat.id === 'claude') return true;
  // Beide Cursor-kaarten blijven zichtbaar: zonder sleutel/login ziet Luka
  // wat hij moet doen, in plaats van dat de tweede stoel verdwijnt.
  if (seat.provider === 'cursor') return true;
  const dir = expandHome(seat.configDir || seat.home, home);
  return existsSync(dir);
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

function claudeOauthEmail(dir) {
  for (const naam of ['.credentials.json', 'credentials.json']) {
    const ruw = readJsonSyncSafe(join(dir, naam));
    const mail = emailFromClaudeOauth(ruw);
    if (mail) return mail;
  }
  return null;
}

async function probeClaude(seat, env) {
  const dir = expandHome(seat.configDir);
  const bin = cliBin(env, ['CLAUDE_BIN', 'AXE_CLAUDE_BIN'], 'claude');
  const childEnv = withCliPath({
    ...process.env, ...env,
    CLAUDE_CONFIG_DIR: dir,
    ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ANTHROPIC_BASE_URL: '', CLAUDECODE: '',
  });
  const restant = claudeOauthEmail(dir);
  try {
    const { stdout, stderr } = await execFileP(bin, ['auth', 'status'], {
      env: childEnv,
      timeout: 8000,
    });
    const parsed = claudeStatusFromText(`${stdout || ''}${stderr || ''}`);
    return { ...parsed, email: parsed.email || restant };
  } catch (err) {
    const tekst = `${err?.stdout || ''}${err?.stderr || ''}${err?.message || ''}`;
    const parsed = claudeStatusFromText(tekst);
    if (parsed.loggedIn != null) return { ...parsed, email: parsed.email || restant };
    return {
      loggedIn: /not logged in|please (log|sign) in/i.test(tekst) ? false : null,
      email: restant,
    };
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

async function probeCursor(seat, env) {
  const keyNaam = seat.apiKeyEnv || 'CURSOR_API_KEY';
  const apiKey = env[keyNaam] || (seat.id === 'cursor' ? env.CURSOR_API_KEY : env.CURSOR2_API_KEY) || '';
  const hasApiKey = Boolean(apiKey);
  const bin = cliBin(env, ['CURSOR_BIN', 'AXE_CURSOR_BIN'], 'cursor-agent');
  const childEnv = withCliPath({ ...process.env, ...env });
  if (seat.id === 'cursor2' && apiKey) childEnv.CURSOR_API_KEY = apiKey;
  const draai = async (args) => {
    try {
      const { stdout, stderr } = await execFileP(bin, args, { env: childEnv, timeout: 8000 });
      return `${stdout || ''}${stderr || ''}`;
    } catch (err) {
      return `${err?.stdout || ''}${err?.stderr || ''}${err?.message || ''}`;
    }
  };
  let tekst = await draai(['status', '--format', 'json']);
  let parsed = cursorStatusFromText(tekst, { hasApiKey });
  if (parsed.loggedIn == null || (parsed.loggedIn && !parsed.email)) {
    const about = await draai(['about', '--format', 'json']);
    const extra = cursorStatusFromText(about, { hasApiKey });
    parsed = {
      loggedIn: parsed.loggedIn ?? extra.loggedIn,
      email: parsed.email || extra.email,
    };
  }
  return parsed;
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

  const weekEvents = events.filter(e => e && Number(e.ts || 0) >= now / 1000 - 7 * 86400);
  const rows = await Promise.all(SEATS.map(async (seat) => {
    const configured = seatConfigured(seat, home, env);
    let login = { loggedIn: false, email: null, orgId: null };
    if (configured) {
      if (seat.provider === 'claude') login = await probeClaude(seat, env);
      else if (seat.provider === 'codex') login = await probeCodex(seat);
      else login = await probeCursor(seat, env);
    }

    const known = snapSeats[seat.id] || {};
    const lastEvent = events.filter(e => e && e.engine === seat.id && isRealLimitMessage(e.limit_message || '')).at(-1);
    const rawLimit = known.limit_message || lastEvent?.limit_message || null;
    const limitMsg = isRealLimitMessage(rawLimit || '') ? rawLimit : null;
    const untilMs = known.limit_until
      ? Number(known.limit_until) * (Number(known.limit_until) < 1e12 ? 1000 : 1)
      : (lastEvent?.limit_until ? Number(lastEvent.limit_until) * 1000 : parseLimitReset(limitMsg || '', now));
    const rateLimited = Boolean(untilMs && untilMs > now);
    const runs7d = weekEvents.filter(e => e.engine === seat.id).length;
    const usedWeek = known.used_week != null ? Number(known.used_week) : null;
    const usedSession = known.used_session != null ? Number(known.used_session) : null;

    return {
      seat_id: seat.id,
      provider: seat.provider,
      email: login.email || null,
      org_id: login.orgId || null,
      logged_in: configured ? login.loggedIn : false,
      login_command: seat.login,
      current_task: known.task || null,
      rate_limited: rateLimited,
      rate_limit_until: rateLimited ? new Date(untilMs).toISOString() : null,
      last_limit_message: limitMsg,
      remaining_note: 'CLI does not expose exact remaining quota.',
      config_exists: configured,
      runs_7d: runs7d,
      used_week: Number.isFinite(usedWeek) ? usedWeek : null,
      used_session: Number.isFinite(usedSession) ? usedSession : null,
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
    org_id: r.org_id || null,
    logged_in: r.logged_in,
    login_command: r.login_command,
    current_task: r.current_task,
    rate_limited: r.rate_limited,
    rate_limit_until: r.rate_limit_until,
    last_limit_message: r.last_limit_message,
    remaining_note: r.remaining_note,
    config_exists: r.config_exists !== false,
    runs_7d: r.runs_7d || 0,
    used_week: r.used_week,
    used_session: r.used_session,
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
    const post = (body) => sbOrThrow('core_coding_seats?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(body),
    });
    try {
      await post(rows);
    } catch {
      // Kolommen org_id/runs_7d/used_* komen in een migratie. Tot die op de
      // VPS staat mag de heartbeat niet stilvallen.
      const extra = ['org_id', 'runs_7d', 'used_week', 'used_session'];
      await post(rows.map((r) => {
        const slim = { ...r };
        for (const k of extra) delete slim[k];
        return slim;
      }));
    }
  } finally {
    reporting = false;
  }
}
