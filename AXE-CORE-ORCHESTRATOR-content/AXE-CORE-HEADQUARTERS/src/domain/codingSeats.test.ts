import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  claudeStatusUitJson,
  emailUitCodexAuth,
  gedeeldeQuota,
  isAuthFout,
  isStoelFout,
  metGedeeldeQuota,
  parseLimietTot,
  resetTekst,
  abonnementKaartStand,
  stoelHeartbeatStand,
  stoelHeeftActie,
  stoelNietGebruikt,
  stoelStand,
  toonStoelEmail,
  toonStoelIds,
  verbergStoel,
  type CodingSeat,
} from './codingSeats';

const CODEX_LIMIET = "ERROR: You've hit your usage limit. Upgrade to Pro "
  + 'or try again at 5:36 PM.';

function stoel(deels: Partial<CodingSeat>): CodingSeat {
  return {
    id: 'claude',
    provider: 'claude',
    label: 'Claude Code',
    email: null,
    machine: 'mac-mini',
    logged_in: true,
    login_command: 'claude auth login',
    current_task: null,
    rate_limited: false,
    rate_limit_until: null,
    last_limit_message: null,
    remaining_note: 'CLI does not expose remaining quota.',
    shared_quota_with: [],
    ...deels,
  };
}

describe('status parsing', () => {
  it('herkent Not logged in en Claude rate-limit als stoelfout', () => {
    expect(isAuthFout('Not logged in')).toBe(true);
    expect(isAuthFout('ERROR: please sign in to continue')).toBe(true);
    expect(isStoelFout(CODEX_LIMIET)).toBe(true);
    expect(isStoelFout('rate limit reached, try again later')).toBe(true);
    expect(isStoelFout('repo is not a git checkout')).toBe(false);
  });

  it('leest try again at uit de echte Codex-regel', () => {
    const nu = new Date('2026-09-13T14:38:00');
    const tot = parseLimietTot(CODEX_LIMIET, nu)!;
    expect(new Date(tot).getHours()).toBe(17);
    expect(new Date(tot).getMinutes()).toBe(36);
  });

  it('leest Claude auth status JSON zonder extra velden te bewaren', () => {
    const uit = claudeStatusUitJson('prefix {"loggedIn": true, "email": "support@axeheadquarters.com", "token": "GEHEIM"} suffix');
    expect(uit).toEqual({ loggedIn: true, email: 'support@axeheadquarters.com' });
    expect(JSON.stringify(uit)).not.toContain('GEHEIM');
  });

  it('toont geen e-mail als Claude is uitgelogd', () => {
    expect(claudeStatusUitJson('{"loggedIn": false, "email": "support@axeheadquarters.com"}'))
      .toEqual({ loggedIn: false, email: null });
  });

  it('haalt Codex-e-mail uit het id_token en toont nooit het token', () => {
    const kop = Buffer.from('{"alg":"none"}').toString('base64url');
    const lading = Buffer.from(JSON.stringify({ email: 'support@axeheadquarters.com' })).toString('base64url');
    const auth = { tokens: { id_token: `${kop}.${lading}.x`, access_token: 'sk-GEHEIM' } };
    const uit = emailUitCodexAuth(auth);
    expect(uit).toEqual({ loggedIn: true, email: 'support@axeheadquarters.com' });
    expect(JSON.stringify(uit)).not.toContain('sk-GEHEIM');
    expect(JSON.stringify(uit)).not.toMatch(/eyJ/);
  });
});

describe('stoelstand', () => {
  it('is rood met login-actie bij logout of limiet', () => {
    expect(stoelStand(stoel({ logged_in: false }))).toEqual({ toon: 'bad', tekst: 'Logged out' });
    expect(stoelHeeftActie(stoel({ logged_in: false }))).toBe(true);
    expect(stoelStand(stoel({ rate_limited: true }))).toEqual({ toon: 'bad', tekst: 'Rate limited' });
    expect(stoelHeeftActie(stoel({ rate_limited: true }))).toBe(true);
    expect(stoelStand(stoel({ current_task: 'axe-core: fix seats' }))).toEqual({ toon: 'info', tekst: 'Running' });
    expect(stoelStand(stoel({}))).toEqual({ toon: 'ok', tekst: 'Logged in' });
  });

  it('toont reset-tijd als die bekend is', () => {
    const tot = new Date('2026-10-17T17:36:00').getTime();
    expect(resetTekst(stoel({ rate_limit_until: tot }), tot - 60_000)).toMatch(/17:36/);
    expect(resetTekst(stoel({ remaining_note: 'no quota' }))).toBe('unknown');
  });
});

describe('gedeelde quota', () => {
  it('vlagt stoelen met hetzelfde e-mailadres', () => {
    const stoelen = [
      stoel({ id: 'claude', email: 'support@axeheadquarters.com' }),
      stoel({ id: 'claude2', email: 'support@axeheadquarters.com' }),
      stoel({ id: 'codex', email: 'support@axeheadquarters.com' }),
      stoel({ id: 'cursor', email: 'other@axeheadquarters.com' }),
    ];
    const delen = gedeeldeQuota(stoelen);
    expect(delen['support@axeheadquarters.com']).toEqual(['claude', 'claude2', 'codex']);
    expect(delen['other@axeheadquarters.com']).toBeUndefined();
    const met = metGedeeldeQuota(stoelen);
    expect(met[0].shared_quota_with).toEqual(['claude2', 'codex']);
    expect(met[3].shared_quota_with).toEqual([]);
  });
});

describe('heartbeat-stand', () => {
  it('laat een verse logged_in heartbeat winnen van een stale last-run expired', () => {
    const nu = Date.parse('2026-10-17T09:00:00Z');
    const vers = new Date(nu - 60_000).toISOString();
    const claude3 = stoel({ id: 'claude3', logged_in: true, last_seen_at: vers, email: 'lukadezeeuw205@gmail.com' });
    const kaart = abonnementKaartStand({
      stoel: claude3,
      heartbeatOk: true,
      verbruikStatus: 'expired',
      lastRunFout: 'Login failed on the last agent run. Log in again.',
      nu,
    });
    expect(kaart.stand).toEqual({ toon: 'ok', tekst: 'Online' });
    expect(kaart.geschiedenis).toMatch(/Login failed on the last agent run/);
    const defaultClaude = abonnementKaartStand({
      stoel: stoel({ id: 'claude', logged_in: false, last_seen_at: vers }),
      heartbeatOk: true,
      nu,
    });
    expect(defaultClaude.stand.tekst).toBe('Not used');
    expect(toonStoelIds([
      stoel({ id: 'claude', logged_in: false }),
      stoel({ id: 'codex3', config_exists: false }),
      stoel({ id: 'codex', logged_in: true }),
    ])).toEqual(['claude', 'codex']);
  });

  it('is Online bij verse heartbeat en login, Not used voor default ~/.claude uitgelogd', () => {
    const nu = Date.parse('2026-10-17T09:00:00Z');
    const vers = new Date(nu - 60_000).toISOString();
    expect(stoelHeartbeatStand(stoel({ logged_in: true, last_seen_at: vers }), nu))
      .toEqual({ toon: 'ok', tekst: 'Online' });
    expect(stoelNietGebruikt(stoel({ id: 'claude', logged_in: false }))).toBe(true);
    expect(stoelHeartbeatStand(stoel({ id: 'claude', logged_in: false, last_seen_at: vers }), nu))
      .toEqual({ toon: 'muted', tekst: 'Not used' });
    expect(verbergStoel(stoel({ id: 'codex3', config_exists: false }))).toBe(true);
    expect(toonStoelEmail(stoel({ email: 'support@axeheadquarters.com', logged_in: false }))).toBeNull();
  });
});

describe('Settings toont Accounts', () => {
  it('heeft één Subscriptions-sectie, geen tweede kaartgrid onder Providers', () => {
    const settings = readFileSync(new URL('../presentation/pages/SettingsPage.tsx', import.meta.url), 'utf8');
    expect(settings).toMatch(/id: 'accounts'/);
    expect(settings).toMatch(/label: 'Subscriptions'/);
    expect(settings).toMatch(/CodingSeatsSection/);
    expect(settings).not.toMatch(/HomeView|NeuralBrain|MemoryTerrain/);
    const seats = readFileSync(new URL('../presentation/components/settings/CodingSeatsSection.tsx', import.meta.url), 'utf8');
    const motoren = readFileSync(new URL('../presentation/components/settings/AgentMotorenSection.tsx', import.meta.url), 'utf8');
    expect(seats).toMatch(/codingSeatsHeartbeat/);
    expect(seats).toMatch(/abonnementKaartStand/);
    expect(motoren).toMatch(/codingSeatsHeartbeat/);
    expect(motoren).not.toMatch(/titel="Subscriptions"/);
    expect(seats).not.toMatch(/stoel\.email \|\| v\?\.account/);
    expect(seats).toMatch(/ongebruikt/);
    expect(seats).toMatch(/stoelNietGebruikt/);
  });
});
