/**
 * Coding seats for the Mac mini computer-worker heartbeat.
 *
 * Probes local CLI logins (no tokens leave this file) and upserts
 * core_coding_seats. The runner writes ~/.axe/coding-seats.json for the
 * current task and last known limit; this file merges that with a live probe.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileRuw = promisify(execFile);
// 22 nov gemeten: met stdin open wachten CLI's (opencode, codex) op invoer tot de
// time-out, en dan staat de stoel op "Unknown". Niemand geeft hier invoer: meteen dicht.
const execFileP = (bin, args, opts) => {
  const p = execFileRuw(bin, args, opts);
  p.child?.stdin?.end();
  return p;
};

const FREE_MODELS = { opencode: 'opencode/beam-free', kilo: 'kilo/kilo-auto/free', agy: null };
const freeChecks = new Map();

export const AGY_VERIFIEER = 'agy  -- signed in, but Google wants this account verified: run agy and open the link it shows';

/** Met welk Google-account Antigravity laatst inlogde, uit zijn eigen log (geen tokens). */
export function agyEmailUitLog(tekst) {
  const alle = [...String(tekst || '').matchAll(/authenticated successfully as (\S+@\S+)/g)];
  return alle.length ? alle.at(-1)[1] : null;
}

function agyEmail(home) {
  try { return agyEmailUitLog(readFileSync(join(home, '.gemini/antigravity-cli/cli.log'), 'utf8')); }
  catch { return null; }
}

async function probeFree(seat, env, home) {
  const cached = freeChecks.get(seat.id);
  if (cached && Date.now() - cached.at < 30 * 60_000) return cached.login;
  const dir = await mkdtemp(join(tmpdir(), 'axe-seat-'));
  const childEnv = withCliPath({ ...env, PATH: join(home, '.local/bin') + ':' + (env.PATH || '') });
  for (const key of ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENAI_USE_VERTEXAI']) delete childEnv[key];
  let loggedIn = null;
  let moetVerifieren = false;
  try {
    const model = FREE_MODELS[seat.id];
    const prompt = 'Reply with OK only. Do not use any tools.';
    const args = model
      ? ['run', '--pure', '--agent', 'plan', '--format', 'json', '-m', model, '--', prompt]
      : ['--sandbox', '--mode', 'plan', '--print-timeout', '15s', '-p', prompt];
    const { stdout } = await execFileP(seat.id, args, { cwd: dir, env: childEnv, timeout: 55_000 });
    loggedIn = model ? /"type":"text"/.test(stdout) : stdout.trim() === 'OK';
  } catch (err) {
    const fout = err.stderr || '';
    if (/eligibility check failed|verify your account/i.test(fout)) {
      // Luka 22 nov: Google-login gelukt, maar Google wil dat account eerst
      // verifiëren. Dat is geen "not logged in": hij moet iets anders doen.
      loggedIn = false;
      moetVerifieren = true;
    } else if (/not logged in/i.test(fout)) loggedIn = false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const email = seat.id === 'agy' ? agyEmail(home) : null;
  const login = { loggedIn, email, moetVerifieren };
  freeChecks.set(seat.id, { at: Date.now(), login });
  return login;
}

export const SEATS = [
  ...Object.keys(FREE_MODELS).map(id => ({ id, provider: id, login: id === 'agy' ? 'agy' : '' })),
  { id: 'claude',  provider: 'claude', login: 'claude auth login', configDir: '~/.claude' },
  { id: 'claude2', provider: 'claude', login: '~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/scripts/prive-login.sh claude ~/.claude-tweede', configDir: '~/.claude-tweede' },
  { id: 'claude3', provider: 'claude', login: '~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/scripts/prive-login.sh claude ~/.claude-derde', configDir: '~/.claude-derde' },
  { id: 'claude4', provider: 'claude', login: '~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/scripts/prive-login.sh claude ~/.claude-vierde', configDir: '~/.claude-vierde' },
  { id: 'codex',   provider: 'codex',  login: 'codex login', home: '~/.codex' },
  { id: 'codex2',  provider: 'codex',  login: '~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/scripts/prive-login.sh codex ~/.codex-tweede', home: '~/.codex-tweede' },
  { id: 'codex3',  provider: 'codex',  login: '~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/scripts/prive-login.sh codex ~/.codex-derde', home: '~/.codex-derde' },
  { id: 'cursor',  provider: 'cursor', login: 'cursor-agent login', apiKeyEnv: 'CURSOR_API_KEY' },
  { id: 'cursor2', provider: 'cursor', login: 'bash scripts/zet_cursor2_sleutel.sh (Cursor key of your hotmail account)', apiKeyEnv: 'CURSOR2_API_KEY' },
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
  // Een sleutel die Cursor weigert is geen login (22 nov: Cursor 2 stond op
  // "ingelogd" door een ongeldige CURSOR2_API_KEY, en elke taak erop faalde).
  if (/(provided )?api key is invalid|invalid api key/i.test(raw)) return { loggedIn: false, email: null };
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const d = JSON.parse(raw.slice(start, end + 1));
      const user = d.user && typeof d.user === 'object' ? d.user : d;
      const emailRaw = d.email || d.userEmail || user.email || d.account;
      const email = typeof emailRaw === 'string' && emailRaw.includes('@') ? emailRaw : null;
      const auth = d.authenticated ?? d.isAuthenticated ?? d.loggedIn ?? d.logged_in;
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

// "You've hit your session limit · resets 8:20am" (Claude Code, 24 nov) viel
// buiten de oude lijst: de stoel bleef "vrij" en kreeg de volgende taak ook.
export const LIMIET_RE = /usage limit|rate limit|session limit|weekly limit|hit your limit|quota exceeded|too many requests|\b429\b/i;

export function isRealLimitMessage(bericht) {
  if (!LIMIET_RE.test(bericht || '')) return false;
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

// launchd geeft de worker alleen /opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin. Claude,
// Cursor en OpenCode staan in ~/.local/bin: zonder die map vond de worker ze niet en
// stond elke Claude-stoel op de iMac op "Unknown" (22 nov nagebootst).
const CLI_MAPPEN = () => [join(homedir(), '.local/bin'), join(homedir(), '.bun/bin'), '/opt/homebrew/bin', '/usr/local/bin'];

function withCliPath(env) {
  const path = env.PATH || process.env.PATH || '';
  const al = new Set(path.split(':'));
  const erbij = CLI_MAPPEN().filter(d => !al.has(d));
  return erbij.length ? { ...env, PATH: [...erbij, path].filter(Boolean).join(':') } : { ...env };
}

function cliBin(env, keys, fallbackName) {
  for (const k of keys) {
    if (env[k]) return env[k];
  }
  for (const dir of CLI_MAPPEN()) {
    const p = join(dir, fallbackName);
    if (existsSync(p)) return p;
  }
  return fallbackName;
}

export function seatConfigured(seat, home = homedir(), env = process.env) {
  if (seat.id === 'claude') return true;
  // Beide Cursor-kaarten blijven zichtbaar: zonder sleutel/login ziet Luka
  // wat hij moet doen, in plaats van dat de tweede stoel verdwijnt.
  if (seat.provider === 'cursor') return true;
  if (Object.hasOwn(FREE_MODELS, seat.id)) return existsSync(join(home, '.local/bin', seat.id));
  const dir = expandHome(seat.configDir || seat.home, home);
  return existsSync(dir);
}

export function parseLimitReset(bericht, now = Date.now()) {
  if (!LIMIET_RE.test(bericht || '')) return null;
  const m = (bericht || '').match(/(?:try again at|resets(?: at)?)\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return now + 60 * 60 * 1000;
  let uur = Number(m[1]);
  const minuut = Number(m[2] ?? 0);
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
  // Eerste stoel: zonder map, net als `claude auth login` zonder map (zie SEAT_ENV in worker.mjs).
  if (seat.id === 'claude') delete childEnv.CLAUDE_CONFIG_DIR;
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

let cursorRij = Promise.resolve();
/** Cursor-agent wil niet twee keer tegelijk: één aanroep tegelijk. */
function naElkaar(werk) {
  const volgende = cursorRij.then(werk, werk);
  cursorRij = volgende.catch(() => undefined);
  return volgende;
}

async function probeCursor(seat, env) {
  const keyNaam = seat.apiKeyEnv || 'CURSOR_API_KEY';
  const apiKey = env[keyNaam] || (seat.id === 'cursor' ? env.CURSOR_API_KEY : env.CURSOR2_API_KEY) || '';
  const hasApiKey = Boolean(apiKey);
  const bin = cliBin(env, ['CURSOR_BIN', 'AXE_CURSOR_BIN'], 'cursor-agent');
  const childEnv = withCliPath({ ...process.env, ...env });
  if (seat.id === 'cursor2' && apiKey) childEnv.CURSOR_API_KEY = apiKey;
  const draai = (args) => naElkaar(async () => {
    try {
      // 22 nov: twee cursor-agents tegelijk (cursor + cursor2) naast de andere stoelen
      // liepen allebei in de 8 s time-out (los: 0,9 s) -> "Unknown". Na elkaar, 20 s.
      const { stdout, stderr } = await execFileP(bin, args, { env: childEnv, timeout: 20_000 });
      return `${stdout || ''}${stderr || ''}`;
    } catch (err) {
      return `${err?.stdout || ''}${err?.stderr || ''}${err?.message || ''}`;
    }
  });
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

const LIMIETEN_BESTAND = (home) => join(home, '.axe', 'worker-seat-limits.json');

/** Limiet die een worker-run zelf zag (claude_code.run enz.) onthouden.
 *  Eigen bestand: coding-seats.json schrijft de Mac-backend telkens opnieuw. */
export function noteerLimiet(seatId, uitvoer, { home = homedir(), now = Date.now() } = {}) {
  const tekst = String(uitvoer ?? '');
  if (!seatId || !isRealLimitMessage(tekst)) return null;
  // Eerst de leesbare zin ("hit your session limit · resets 8:20am"), dan pas een kale 429.
  const rond = (bron) => tekst.match(new RegExp(`[^\\n"]{0,90}(?:${bron})[^\\n"]{0,120}`, 'i'));
  const regel = (rond(LIMIET_RE.source.replace('|\\b429\\b', '')) || rond(LIMIET_RE.source) || [tekst])[0].slice(0, 280);
  const tot = parseLimitReset(regel, now) ?? now + 60 * 60 * 1000;
  const pad = LIMIETEN_BESTAND(home);
  const alles = readJsonSyncSafe(pad) || {};
  alles[seatId] = { limit_until: Math.round(tot / 1000), limit_message: regel, ts: Math.round(now / 1000) };
  try {
    mkdirSync(join(home, '.axe'), { recursive: true });
    writeFileSync(`${pad}.tmp`, JSON.stringify(alles));
    renameSync(`${pad}.tmp`, pad);
  } catch { /* best effort: de taak zelf is al klaar */ }
  return alles[seatId];
}

export async function collectSeats({ env = process.env, home = homedir() } = {}) {
  const snap = readSeatSnapshot(home);
  const snapSeats = { ...(snap.seats && typeof snap.seats === 'object' ? snap.seats : {}) };
  const eigen = readJsonSyncSafe(LIMIETEN_BESTAND(home)) || {};
  for (const [id, lim] of Object.entries(eigen)) {
    const oud = snapSeats[id] || {};
    if (Number(lim?.limit_until || 0) > Number(oud.limit_until || 0)) {
      snapSeats[id] = { ...oud, limit_until: lim.limit_until, limit_message: lim.limit_message };
    }
  }
  const events = Array.isArray(snap.events) ? snap.events : [];
  const now = Date.now();

  const weekEvents = events.filter(e => e && Number(e.ts || 0) >= now / 1000 - 7 * 86400);
  const rows = await Promise.all(SEATS.map(async (seat) => {
    const configured = seatConfigured(seat, home, env);
    let login = { loggedIn: false, email: null, orgId: null };
    if (configured) {
      if (seat.provider === 'claude') login = await probeClaude(seat, env);
      else if (seat.provider === 'codex') login = await probeCodex(seat);
      else if (Object.hasOwn(FREE_MODELS, seat.id)) login = await probeFree(seat, env, home);
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
      login_command: login.moetVerifieren ? AGY_VERIFIEER : seat.login,
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
