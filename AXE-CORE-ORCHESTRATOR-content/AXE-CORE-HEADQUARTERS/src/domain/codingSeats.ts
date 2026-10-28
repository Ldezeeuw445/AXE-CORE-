/**
 * Coding seats — één abonnements-CLI als stoel in het team.
 *
 * De runner (agent_runner.py) kiest de volgende vrije stoel en valt door bij
 * login- of limietfouten. Dit bestand is de schermregel: hoe je die stand
 * toont, wanneer hij rood is, en wanneer twee stoelen hetzelfde e-mailadres
 * delen (en dus één quotum).
 *
 * Geen tokens. Codex-e-mail komt uit de id_token-claim, nooit uit access_token.
 */
import { isLimietFout, limietTijdstip, STANDAARD_KOELING_MS } from './gebruikslimiet';

export type CodingProvider = 'claude' | 'codex' | 'cursor' | 'openhands' | 'xai';

export interface CodingSeat {
  id: string;
  provider: CodingProvider;
  label: string;
  email: string | null;
  /** ChatGPT-account-id of org, los van het e-mailadres. */
  org_id?: string | null;
  machine: string;
  logged_in: boolean | null;
  login_command: string;
  current_task: string | null;
  rate_limited: boolean;
  rate_limit_until: number | null;
  last_limit_message: string | null;
  remaining_note: string;
  shared_quota_with: string[];
  last_seen_at?: string | null;
  config_exists?: boolean;
  /** CLI-stoel zonder machine-prefix (claude2, niet mini-van-luka-5:claude2). */
  seat_id?: string;
  /** Wat Luka moet doen als de stoel niet bruikbaar is (login of sleutel). */
  actie?: string | null;
  used_session?: number | null;
  used_week?: number | null;
  runs_7d?: number | null;
}

export type SeatStandToon = 'ok' | 'bad' | 'info' | 'muted';
export type SeatStand = { toon: SeatStandToon; tekst: string };

const AUTH_FOUT = /not logged in|please (log|sign) in|login required|failed to authenticate|authentication (failed|required)|oauth session expired|could not be refreshed|invalid_grant/i;

export function isAuthFout(bericht: string): boolean {
  return AUTH_FOUT.test(bericht || '');
}

export function isStoelFout(bericht: string): boolean {
  return isAuthFout(bericht) || isLimietFout(bericht);
}

/** Epoch-ms tot wanneer de stoel koelt, of null als dit geen limiet is. */
export function parseLimietTot(bericht: string, nu: Date): number | null {
  if (!isLimietFout(bericht)) return null;
  return limietTijdstip(bericht, nu) ?? nu.getTime() + STANDAARD_KOELING_MS;
}

/**
 * E-mail uit een Codex auth.json. Alleen de claim; het token zelf gaat nooit
 * het resultaat in — ook niet per ongeluk via JSON.stringify van de invoer.
 */
export function emailUitCodexAuth(auth: unknown): { loggedIn: boolean; email: string | null; orgId: string | null } {
  if (!auth || typeof auth !== 'object') return { loggedIn: false, email: null, orgId: null };
  const tokens = (auth as { tokens?: { id_token?: unknown; access_token?: unknown; account_id?: unknown } }).tokens;
  if (!tokens || typeof tokens !== 'object') return { loggedIn: false, email: null, orgId: null };
  const jwt = typeof tokens.id_token === 'string' ? tokens.id_token : '';
  const heeftSessie = Boolean(tokens.access_token || jwt);
  if (!heeftSessie) return { loggedIn: false, email: null, orgId: null };
  const accountId = typeof tokens.account_id === 'string' ? tokens.account_id : null;
  const deel = jwt.split('.')[1] ?? '';
  if (!deel) return { loggedIn: true, email: null, orgId: accountId };
  try {
    const pad = deel.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (deel.length % 4)) % 4);
    const json = typeof atob === 'function' ? atob(pad) : '';
    const claims = JSON.parse(json) as { email?: unknown; 'https://api.openai.com/auth'?: { chatgpt_account_id?: unknown } };
    const email = typeof claims.email === 'string' ? claims.email : null;
    const authClaim = claims['https://api.openai.com/auth'];
    const org = typeof authClaim?.chatgpt_account_id === 'string' ? authClaim.chatgpt_account_id : accountId;
    return { loggedIn: true, email, orgId: org };
  } catch {
    return { loggedIn: true, email: null, orgId: accountId };
  }
}

/** E-mail uit Claude-oauth, ook als `auth status` loggedIn=false zegt (restant-token). */
export function emailUitClaudeOauth(oauth: unknown): string | null {
  if (!oauth || typeof oauth !== 'object') return null;
  const o = oauth as Record<string, unknown>;
  const inner = (o.claudeAiOauth && typeof o.claudeAiOauth === 'object')
    ? o.claudeAiOauth as Record<string, unknown>
    : o;
  for (const v of [inner.email, inner.account, (inner.user as { email?: unknown } | undefined)?.email]) {
    if (typeof v === 'string' && v.includes('@')) return v;
  }
  return null;
}

/**
 * `cursor-agent status` / `about`: JSON of tekst. Exit 1 + "Not authenticated"
 * is uitgelogd, geen limiet. CURSOR_API_KEY telt als headless-login.
 */
export function cursorStatusUitTekst(
  tekst: string,
  opts: { hasApiKey?: boolean } = {},
): { loggedIn: boolean | null; email: string | null } {
  const raw = tekst || '';
  const json = (() => {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (json) {
    const user = json.user && typeof json.user === 'object' ? json.user as Record<string, unknown> : json;
    const emailRaw = json.email ?? json.userEmail ?? user.email ?? json.account;
    const email = typeof emailRaw === 'string' && emailRaw.includes('@') ? emailRaw : null;
    const auth = json.authenticated ?? json.loggedIn ?? json.logged_in;
    if (typeof auth === 'boolean') return { loggedIn: auth, email: auth ? email : null };
    if (email) return { loggedIn: true, email };
  }
  if (/not authenticated|not logged in|please (log|sign) in/i.test(raw) && !/logged in as/i.test(raw)) {
    return { loggedIn: opts.hasApiKey ? true : false, email: null };
  }
  const mail = raw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (mail) return { loggedIn: true, email: mail[0] };
  if (/logged in/i.test(raw)) return { loggedIn: true, email: null };
  if (opts.hasApiKey) return { loggedIn: true, email: null };
  if (!raw.trim()) return { loggedIn: opts.hasApiKey ? true : null, email: null };
  return { loggedIn: null, email: null };
}

/** Alleen een echte quotum-melding, niet "Cursor ended with 1". */
export function isEchteLimietMelding(bericht: string): boolean {
  if (!isLimietFout(bericht || '')) return false;
  if (/eindigde met|ended with/i.test(bericht || '')) return false;
  return true;
}

/** Claude `auth status` JSON: loggedIn + email, verder niets. Uitgelogd = geen e-mail. */
export function claudeStatusUitJson(tekst: string): { loggedIn: boolean | null; email: string | null } {
  try {
    const start = tekst.indexOf('{');
    const end = tekst.lastIndexOf('}');
    if (start < 0 || end < start) return { loggedIn: null, email: null };
    const d = JSON.parse(tekst.slice(start, end + 1)) as { loggedIn?: unknown; email?: unknown };
    const loggedIn = typeof d.loggedIn === 'boolean' ? d.loggedIn : null;
    return {
      loggedIn,
      email: loggedIn === true && typeof d.email === 'string' && d.email ? d.email : null,
    };
  } catch {
    return { loggedIn: null, email: null };
  }
}

/** Heartbeat van de Mac mini: verser dan 5 minuten telt als Online. */
const STOEL_VERS_MS = 5 * 60 * 1000;

function stoelIsVers(lastSeenAt: string | null | undefined, nu = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  return !Number.isNaN(t) && nu - t < STOEL_VERS_MS;
}

/** core_coding_seats.id is '<machine>:<seat_id>'; de CLI-naam is seat_id. */
export function stoelSleutel(stoel: { id?: string | null; seat_id?: string | null }): string {
  const sid = (stoel.seat_id || '').trim();
  if (sid && !sid.includes(':')) return sid;
  const id = String(stoel.id || stoel.seat_id || '');
  const i = id.lastIndexOf(':');
  if (i > 0 && i < id.length - 1) return id.slice(i + 1);
  return id;
}

export function machineLabel(machine: string | null | undefined): string {
  const s = (machine || '').trim();
  if (!s) return 'unknown';
  const laag = s.toLowerCase();
  if (laag.includes('imac')) return 'iMac';
  if (laag.includes('mini')) return 'Mac mini';
  return s;
}

function providerVanSeat(seatId: string, provider?: string | null): CodingProvider {
  if (provider === 'claude' || provider === 'codex' || provider === 'cursor' || provider === 'openhands' || provider === 'xai') {
    return provider;
  }
  if (seatId.startsWith('codex')) return 'codex';
  if (seatId.startsWith('cursor')) return 'cursor';
  if (seatId.startsWith('openhands')) return 'openhands';
  if (seatId.startsWith('xai') || seatId.startsWith('grok')) return 'xai';
  return 'claude';
}

/** Eén account: provider + e-mail, of provider + org-id. Leeg = onbekend. */
export function accountSleutel(stoel: Pick<CodingSeat, 'id' | 'provider' | 'email' | 'org_id' | 'seat_id'>): string | null {
  const sid = stoelSleutel(stoel);
  const provider = providerVanSeat(sid, stoel.provider);
  const mail = (stoel.email || '').trim().toLowerCase();
  if (mail) return `${provider}:${mail}`;
  const org = (stoel.org_id || '').trim();
  if (org) return `${provider}:org:${org}`;
  return null;
}

/**
 * logged_in=true wint altijd van een null/false-rij op een andere machine,
 * ook als die andere hartslag verse is.
 */
export function winnendeStoel<T extends Pick<CodingSeat, 'logged_in' | 'last_seen_at'>>(rijen: T[]): T | null {
  if (rijen.length === 0) return null;
  const gezien = (s: T) => {
    const t = Date.parse(s.last_seen_at || '');
    return Number.isNaN(t) ? 0 : t;
  };
  return [...rijen].sort((a, b) => {
    const la = a.logged_in === true ? 2 : a.logged_in === false ? 1 : 0;
    const lb = b.logged_in === true ? 2 : b.logged_in === false ? 1 : 0;
    if (lb !== la) return lb - la;
    return gezien(b) - gezien(a);
  })[0] ?? null;
}

export function stoelNietGebruikt(stoel: Pick<CodingSeat, 'id' | 'logged_in'> & Partial<Pick<CodingSeat, 'config_exists' | 'seat_id' | 'email'>>): boolean {
  const sid = stoelSleutel(stoel);
  if (stoel.logged_in === true) return false;
  if (stoel.email) return false;
  // Default ~/.claude zonder login is de lege vierde map, geen vierde Pro-seat.
  return sid === 'claude' && stoel.config_exists !== false;
}

export type AbonnementGroep = {
  key: string;
  provider: CodingProvider;
  email: string | null;
  seatIds: string[];
  bruikbaarOp: string[];
  stoel: CodingSeat;
  nietGebruikt: boolean;
};

/**
 * Eén kaart per account (e-mail/org + provider). Een restant-login in ~/.claude
 * met hetzelfde adres als een andere map is geen vierde Pro-seat: die rijen
 * gaan in dezelfde groep. Machines waar logged_in=true staan onder "usable on".
 * config_exists=false verdwijnt. Nooit ingelogd en geen identiteit → 'not used'.
 */
export function groepeerAbonnementen(stoelen: CodingSeat[]): { kaarten: AbonnementGroep[]; ongebruikt: AbonnementGroep[] } {
  const zichtbaar = stoelen.filter((s) => !verbergStoel(s) && stoelSleutel(s));
  const groepen = new Map<string, CodingSeat[]>();
  const rest: CodingSeat[] = [];

  for (const s of zichtbaar) {
    const ident = accountSleutel(s);
    if (ident) {
      const lijst = groepen.get(ident) ?? [];
      lijst.push(s);
      groepen.set(ident, lijst);
    } else {
      rest.push(s);
    }
  }

  const restPerSeat = new Map<string, CodingSeat[]>();
  for (const s of rest) {
    const sid = stoelSleutel(s);
    const lijst = restPerSeat.get(sid) ?? [];
    lijst.push(s);
    restPerSeat.set(sid, lijst);
  }

  const ongebruiktSeats: CodingSeat[][] = [];
  for (const [sid, rijen] of restPerSeat) {
    const hosts = [...groepen.entries()].filter(([, rows]) => rows.some((r) => stoelSleutel(r) === sid));
    if (hosts.length === 1) {
      hosts[0][1].push(...rijen);
    } else if (rijen.every(stoelNietGebruikt)) {
      ongebruiktSeats.push(rijen);
    } else {
      groepen.set(`seat:${sid}`, rijen);
    }
  }

  const naarGroep = (rijen: CodingSeat[], nietGebruikt: boolean): AbonnementGroep | null => {
    const win = winnendeStoel(rijen);
    if (!win) return null;
    const sid = stoelSleutel(win);
    const provider = providerVanSeat(sid, win.provider);
    const email = (rijen.map((s) => (s.email || '').trim()).find(Boolean) || null);
    const getoondEmail = win.logged_in === true ? email : (nietGebruikt ? null : email);
    const seatIds = [...new Set(rijen.map(stoelSleutel))];
    const bruikbaarOp = [...new Set(
      rijen.filter((s) => s.logged_in === true).map((s) => machineLabel(s.machine)),
    )].sort((a, b) => {
      const rang = (x: string) => (x === 'Mac mini' ? 0 : x === 'iMac' ? 1 : 2);
      return rang(a) - rang(b) || a.localeCompare(b);
    });
    const echtOngebruikt = nietGebruikt || (bruikbaarOp.length === 0 && stoelNietGebruikt(win));
    return {
      key: `${provider}:${email || sid}:${seatIds.join(',')}`,
      provider,
      email: echtOngebruikt ? null : getoondEmail,
      seatIds,
      bruikbaarOp,
      stoel: { ...win, id: sid, provider, email: echtOngebruikt ? null : getoondEmail, seat_id: sid },
      nietGebruikt: echtOngebruikt,
    };
  };

  const kaarten: AbonnementGroep[] = [];
  for (const rijen of groepen.values()) {
    const g = naarGroep(rijen, false);
    if (g) kaarten.push(g);
  }
  const ongebruikt: AbonnementGroep[] = [];
  for (const rijen of ongebruiktSeats) {
    const g = naarGroep(rijen, true);
    if (g) ongebruikt.push(g);
  }

  const volgorde = ['claude2', 'claude3', 'claude4', 'claude', 'codex', 'codex2', 'codex3', 'cursor', 'cursor2', 'xai'];
  const sorteer = (a: AbonnementGroep, b: AbonnementGroep) => {
    const ia = volgorde.indexOf(a.stoel.id);
    const ib = volgorde.indexOf(b.stoel.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  };
  kaarten.sort(sorteer);
  ongebruikt.sort(sorteer);
  return { kaarten, ongebruikt };
}

export function verbergStoel(stoel: Pick<CodingSeat, 'config_exists'>): boolean {
  return stoel.config_exists === false;
}

export function toonStoelEmail(stoel: Pick<CodingSeat, 'email' | 'logged_in'>): string | null {
  return stoel.logged_in === true ? stoel.email : null;
}

/** Status op Settings-kaarten: heartbeat, niet de VPS-enginecheck. */
/**
 * Status van een abonnementskaart.
 *
 * Heartbeat van core_coding_seats (vers < 5 min) wint. Een stale last-run
 * "Login expired" overschrijft nooit een verse logged_in=true. Die oude fout
 * mag alleen als geschiedenis onder de kaart.
 */
export function abonnementKaartStand(in_: {
  stoel?: Pick<CodingSeat, 'id' | 'logged_in' | 'rate_limited' | 'current_task' | 'last_seen_at' | 'config_exists'> | null;
  heartbeatOk: boolean;
  verbruikStatus?: string | null;
  lastRunFout?: string | null;
  nu?: number;
}): { stand: SeatStand; geschiedenis?: string } {
  const { stoel, heartbeatOk, verbruikStatus, lastRunFout, nu = Date.now() } = in_;
  if (!heartbeatOk) {
    return { stand: { toon: 'muted', tekst: 'No heartbeat' }, geschiedenis: lastRunFout || undefined };
  }
  if (!stoel) {
    return { stand: { toon: 'muted', tekst: 'No seat' }, geschiedenis: lastRunFout || undefined };
  }
  const stand = stoelHeartbeatStand(stoel, nu);
  const versOnline = stand.tekst === 'Online' || stand.tekst === 'Running' || stand.tekst === 'Not used';
  const stale = (verbruikStatus === 'expired' || verbruikStatus === 'not_logged_in')
    ? (lastRunFout || 'Login failed on the last agent run.')
    : lastRunFout || undefined;
  if (versOnline) {
    return { stand, geschiedenis: stale };
  }
  return { stand, geschiedenis: stale };
}

export function toonStoelIds<T extends { id: string; config_exists?: boolean }>(
  stoelen: T[] | Record<string, T> | null,
): string[] {
  if (stoelen == null) return [];
  const rijen = Array.isArray(stoelen) ? stoelen : Object.values(stoelen);
  return rijen.filter((s) => s.id && !verbergStoel(s)).map((s) => s.id);
}

export function stoelHeartbeatStand(
  stoel: Pick<CodingSeat, 'id' | 'logged_in' | 'rate_limited' | 'current_task' | 'last_seen_at' | 'config_exists'>,
  nu = Date.now(),
): SeatStand {
  if (stoel.config_exists === false) return { toon: 'muted', tekst: 'Not installed' };
  if (stoelNietGebruikt(stoel)) return { toon: 'muted', tekst: 'Not used' };
  if (stoel.rate_limited) return { toon: 'bad', tekst: 'Rate limited' };
  const vers = stoelIsVers(stoel.last_seen_at, nu);
  if (vers && stoel.logged_in === true) {
    return stoel.current_task ? { toon: 'info', tekst: 'Running' } : { toon: 'ok', tekst: 'Online' };
  }
  if (vers && stoel.logged_in === false) return { toon: 'muted', tekst: 'Logged out' };
  if (!vers) return { toon: 'bad', tekst: 'Offline' };
  return { toon: 'muted', tekst: 'Unknown' };
}

export function stoelStand(stoel: Pick<CodingSeat, 'logged_in' | 'rate_limited' | 'current_task'>): SeatStand {
  if (stoel.logged_in === false) return { toon: 'bad', tekst: 'Logged out' };
  if (stoel.rate_limited) return { toon: 'bad', tekst: 'Rate limited' };
  if (stoel.current_task) return { toon: 'info', tekst: 'Running' };
  if (stoel.logged_in === true) return { toon: 'ok', tekst: 'Logged in' };
  return { toon: 'muted', tekst: 'Unknown' };
}

export function stoelHeeftActie(stoel: Pick<CodingSeat, 'logged_in' | 'rate_limited'>): boolean {
  return stoel.logged_in === false || stoel.rate_limited;
}

/** Zelfde e-mail = één quotum. Leeg en null tellen niet. */
export function gedeeldeQuota(stoelen: Array<Pick<CodingSeat, 'id' | 'email'>>): Record<string, string[]> {
  const perMail = new Map<string, string[]>();
  for (const s of stoelen) {
    const mail = (s.email || '').trim().toLowerCase();
    if (!mail) continue;
    const lijst = perMail.get(mail) ?? [];
    lijst.push(s.id);
    perMail.set(mail, lijst);
  }
  const uit: Record<string, string[]> = {};
  for (const [mail, ids] of perMail) {
    if (ids.length > 1) uit[mail] = ids;
  }
  return uit;
}

/**
 * Twee CLI-mappen op dezelfde machine, hetzelfde account: verspilde stoel.
 * Dezelfde login op Mac mini én iMac is géén verspilling — dat is één account
 * dat op twee machines staat.
 */
export function verspildeStoelen(stoelen: CodingSeat[]): { email: string; machines: string[] }[] {
  const perIdent = new Map<string, CodingSeat[]>();
  for (const s of stoelen) {
    if (s.logged_in !== true) continue;
    const ident = accountSleutel(s);
    if (!ident) continue;
    const lijst = perIdent.get(ident) ?? [];
    lijst.push(s);
    perIdent.set(ident, lijst);
  }
  const uit: { email: string; machines: string[] }[] = [];
  for (const [ident, rijen] of perIdent) {
    const perMachine = new Map<string, Set<string>>();
    for (const s of rijen) {
      const m = machineLabel(s.machine);
      const ids = perMachine.get(m) ?? new Set();
      ids.add(stoelSleutel(s));
      perMachine.set(m, ids);
    }
    const dubbel = [...perMachine.entries()].filter(([, ids]) => ids.size > 1);
    if (dubbel.length === 0) continue;
    const email = ident.split(':').slice(1).join(':');
    uit.push({ email, machines: dubbel.map(([m]) => m) });
  }
  return uit;
}

/** Wat Luka moet doen als de stoel niet bruikbaar is. Null = niets, hij draait. */
export function watMoetLukaDoen(stoel: Pick<CodingSeat, 'provider' | 'id' | 'logged_in' | 'login_command' | 'machine' | 'rate_limited' | 'rate_limit_until' | 'config_exists' | 'seat_id' | 'actie' | 'email'>): string | null {
  if (stoel.actie) return stoel.actie;
  if (stoelNietGebruikt(stoel) && !stoel.rate_limited) return null;
  const sid = stoelSleutel(stoel);
  const machine = machineLabel(stoel.machine);
  if (stoel.provider === 'xai') {
    return stoel.logged_in === true
      ? null
      : 'Set XAI_API_KEY on the VPS (OpenAI-compatible API at https://api.x.ai).';
  }
  if (stoel.config_exists === false) {
    return `Install the CLI on ${machine}, then ${stoel.login_command || 'log in'}.`;
  }
  if (stoel.logged_in !== true) {
    if (sid === 'cursor2' || sid.startsWith('cursor') && sid !== 'cursor') {
      return `On ${machine}: set CURSOR2_API_KEY (second Cursor seat), or run: cursor-agent login`;
    }
    if (stoel.provider === 'cursor' || sid === 'cursor') {
      return `On ${machine}: cursor-agent login   — or set CURSOR_API_KEY for headless.`;
    }
    return stoel.login_command
      ? `On ${machine}: ${stoel.login_command}`
      : `Log in on ${machine}.`;
  }
  if (stoel.rate_limited) {
    const tot = stoel.rate_limit_until
      ? new Date(stoel.rate_limit_until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : null;
    return tot ? `Wait until ${tot}, or another seat will take the work.` : 'This seat is at its limit. Another healthy seat takes the work.';
  }
  return null;
}

/** Kaartmelding: geen "Limit seen" voor een uitlog- of exitfout. */
export function kaartMelding(bericht: string | null | undefined): string | null {
  const t = (bericht || '').trim();
  if (!t) return null;
  if (isEchteLimietMelding(t)) return t;
  if (/eindigde met|ended with/i.test(t) && /not authenticated|not logged in/i.test(t)) {
    return t;
  }
  return t;
}

export type GebruikSom = {
  runs_24h: number;
  runs_7d: number;
  input_tokens_7d: number;
  output_tokens_7d: number;
  ok_7d: number;
  failed_7d: number;
  last_run_at: number | null;
  last_limit_message: string | null;
};

/** Tel runs/tokens van alle CLI-mappen die tot hetzelfde account horen. */
export function somGebruik(
  ids: string[],
  gebruik: Record<string, Partial<GebruikSom> | undefined>,
): GebruikSom | null {
  const rijen = ids.map((id) => gebruik[id]).filter(Boolean) as Partial<GebruikSom>[];
  if (rijen.length === 0) return null;
  const som = (k: keyof GebruikSom) => rijen.reduce((n, r) => n + (typeof r[k] === 'number' ? Number(r[k]) : 0), 0);
  const last = rijen.map((r) => r.last_run_at).filter((n): n is number => typeof n === 'number');
  const limiet = rijen.map((r) => r.last_limit_message).find((m) => typeof m === 'string' && isEchteLimietMelding(m))
    ?? rijen.map((r) => r.last_limit_message).find((m) => typeof m === 'string' && m) ?? null;
  return {
    runs_24h: som('runs_24h'),
    runs_7d: som('runs_7d'),
    input_tokens_7d: som('input_tokens_7d'),
    output_tokens_7d: som('output_tokens_7d'),
    ok_7d: som('ok_7d'),
    failed_7d: som('failed_7d'),
    last_run_at: last.length ? Math.max(...last) : null,
    last_limit_message: typeof limiet === 'string' ? limiet : null,
  };
}

export function metGedeeldeQuota<T extends CodingSeat>(stoelen: T[]): T[] {
  const delen = gedeeldeQuota(stoelen);
  return stoelen.map(s => {
    const mail = (s.email || '').trim().toLowerCase();
    const ids = mail ? delen[mail] ?? [] : [];
    return { ...s, shared_quota_with: ids.filter(id => id !== s.id) };
  });
}

export function resetTekst(stoel: Pick<CodingSeat, 'rate_limit_until' | 'remaining_note'>, nu = Date.now()): string {
  if (stoel.rate_limit_until && stoel.rate_limit_until > nu) {
    return new Date(stoel.rate_limit_until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return stoel.remaining_note ? 'unknown' : '—';
}
