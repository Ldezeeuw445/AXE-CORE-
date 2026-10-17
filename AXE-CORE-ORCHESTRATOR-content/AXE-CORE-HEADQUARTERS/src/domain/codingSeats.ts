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

export type CodingProvider = 'claude' | 'codex' | 'cursor' | 'openhands';

export interface CodingSeat {
  id: string;
  provider: CodingProvider;
  label: string;
  email: string | null;
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
export function emailUitCodexAuth(auth: unknown): { loggedIn: boolean; email: string | null } {
  if (!auth || typeof auth !== 'object') return { loggedIn: false, email: null };
  const tokens = (auth as { tokens?: { id_token?: unknown; access_token?: unknown } }).tokens;
  if (!tokens || typeof tokens !== 'object') return { loggedIn: false, email: null };
  const jwt = typeof tokens.id_token === 'string' ? tokens.id_token : '';
  const heeftSessie = Boolean(tokens.access_token || jwt);
  if (!heeftSessie) return { loggedIn: false, email: null };
  const deel = jwt.split('.')[1] ?? '';
  if (!deel) return { loggedIn: true, email: null };
  try {
    const pad = deel.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (deel.length % 4)) % 4);
    const json = typeof atob === 'function' ? atob(pad) : '';
    const claims = JSON.parse(json) as { email?: unknown };
    const email = typeof claims.email === 'string' ? claims.email : null;
    return { loggedIn: true, email };
  } catch {
    return { loggedIn: true, email: null };
  }
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
  if (provider === 'claude' || provider === 'codex' || provider === 'cursor' || provider === 'openhands') {
    return provider;
  }
  if (seatId.startsWith('codex')) return 'codex';
  if (seatId.startsWith('cursor')) return 'cursor';
  if (seatId.startsWith('openhands')) return 'openhands';
  return 'claude';
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

export function stoelNietGebruikt(stoel: Pick<CodingSeat, 'id' | 'logged_in' | 'config_exists' | 'seat_id'>): boolean {
  const sid = stoelSleutel(stoel);
  return sid === 'claude' && stoel.logged_in !== true && stoel.config_exists !== false;
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
 * Eén kaart per account (e-mail + provider). Machines waar logged_in=true
 * staan onder "usable on". config_exists=false verdwijnt. Nooit ingelogd op
 * enige machine → kleine 'not used'-lijst.
 */
export function groepeerAbonnementen(stoelen: CodingSeat[]): { kaarten: AbonnementGroep[]; ongebruikt: AbonnementGroep[] } {
  const zichtbaar = stoelen.filter((s) => !verbergStoel(s) && stoelSleutel(s));
  const groepen = new Map<string, CodingSeat[]>();
  const rest: CodingSeat[] = [];

  for (const s of zichtbaar) {
    if (s.logged_in === true && toonStoelEmail(s)) {
      const provider = providerVanSeat(stoelSleutel(s), s.provider);
      const sleutel = `${provider}:${toonStoelEmail(s)!.trim().toLowerCase()}`;
      const lijst = groepen.get(sleutel) ?? [];
      lijst.push(s);
      groepen.set(sleutel, lijst);
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
    } else {
      ongebruiktSeats.push(rijen);
    }
  }

  const naarGroep = (rijen: CodingSeat[], nietGebruikt: boolean): AbonnementGroep | null => {
    const win = winnendeStoel(rijen);
    if (!win) return null;
    const sid = stoelSleutel(win);
    const provider = providerVanSeat(sid, win.provider);
    const email = win.logged_in === true ? toonStoelEmail(win) : null;
    const seatIds = [...new Set(rijen.map(stoelSleutel))];
    const bruikbaarOp = [...new Set(
      rijen.filter((s) => s.logged_in === true).map((s) => machineLabel(s.machine)),
    )].sort((a, b) => {
      const rang = (x: string) => (x === 'Mac mini' ? 0 : x === 'iMac' ? 1 : 2);
      return rang(a) - rang(b) || a.localeCompare(b);
    });
    return {
      key: `${provider}:${email || sid}:${seatIds.join(',')}`,
      provider,
      email,
      seatIds,
      bruikbaarOp,
      stoel: { ...win, id: sid, provider, email, seat_id: sid },
      nietGebruikt,
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

  const volgorde = ['claude2', 'claude3', 'claude4', 'claude', 'codex', 'codex2', 'cursor'];
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
