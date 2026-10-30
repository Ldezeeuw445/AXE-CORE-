import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  accountSleutel,
  claudeStatusUitJson,
  cursorStatusUitTekst,
  emailUitClaudeOauth,
  emailUitCodexAuth,
  gedeeldeQuota,
  groepeerAbonnementen,
  isAuthFout,
  isEchteLimietMelding,
  isStoelFout,
  kaartMelding,
  machineLabel,
  metGedeeldeQuota,
  parseLimietTot,
  resetTekst,
  abonnementKaartStand,
  somGebruik,
  stoelHeartbeatStand,
  stoelHeeftActie,
  stoelNietGebruikt,
  stoelSleutel,
  stoelStand,
  toonStoelEmail,
  toonStoelIds,
  verbergStoel,
  verspildeStoelen,
  watMoetLukaDoen,
  winnendeStoel,
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
    const lading = Buffer.from(JSON.stringify({
      email: 'support@axeheadquarters.com',
      'https://api.openai.com/auth': { chatgpt_account_id: 'org-1' },
    })).toString('base64url');
    const auth = { tokens: { id_token: `${kop}.${lading}.x`, access_token: 'sk-GEHEIM' } };
    const uit = emailUitCodexAuth(auth);
    expect(uit).toEqual({ loggedIn: true, email: 'support@axeheadquarters.com', orgId: 'org-1' });
    expect(JSON.stringify(uit)).not.toContain('sk-GEHEIM');
    expect(JSON.stringify(uit)).not.toMatch(/eyJ/);
  });

  it('leest cursor-agent status JSON en behandelt exit-1 niet als limiet', () => {
    expect(cursorStatusUitTekst('{"loggedIn":true,"email":"luka@axe.local"}'))
      .toEqual({ loggedIn: true, email: 'luka@axe.local' });
    expect(cursorStatusUitTekst('Not authenticated')).toEqual({ loggedIn: false, email: null });
    expect(cursorStatusUitTekst('', { hasApiKey: true })).toEqual({ loggedIn: true, email: null });
    expect(isEchteLimietMelding('Cursor ended with 1. stderr: boom')).toBe(false);
    expect(isEchteLimietMelding("You've hit your usage limit. try again at 5:36 PM.")).toBe(true);
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

  it('groepeert per account-e-mail en laat logged_in=true winnen van een andere machine', () => {
    const nu = Date.parse('2026-10-17T11:00:00Z');
    const vers = new Date(nu - 30_000).toISOString();
    const ouder = new Date(nu - 120_000).toISOString();
    const mini = (id: string, extra: Partial<CodingSeat> = {}) => stoel({
      id: `mini-van-luka-5:${id}`,
      seat_id: id,
      machine: 'mini-van-luka-5',
      last_seen_at: vers,
      ...extra,
    });
    const imac = (id: string, extra: Partial<CodingSeat> = {}) => stoel({
      id: `imac-1:${id}`,
      seat_id: id,
      machine: 'imac-1',
      last_seen_at: ouder,
      ...extra,
    });
    const rijen = [
      mini('claude2', { email: 'support@axeheadquarters.com', logged_in: true, provider: 'claude' }),
      mini('claude3', { email: 'lukadezeeuw205@gmail.com', logged_in: true, provider: 'claude' }),
      mini('claude4', { email: 'lukadezeeuw4@gmail.com', logged_in: true, provider: 'claude' }),
      mini('claude', { logged_in: false, email: null, provider: 'claude' }),
      mini('codex', { email: 'support@axeheadquarters.com', logged_in: true, provider: 'codex' }),
      mini('codex2', { email: 'lukadezeeuw1994@hotmail.com', logged_in: true, provider: 'codex' }),
      mini('cursor', { email: 'lukadezeeuw4@gmail.com', logged_in: true, provider: 'cursor' }),
      imac('codex', { email: 'lukadezeeuw1994@hotmail.com', logged_in: true, provider: 'codex', last_seen_at: vers }),
      imac('claude', { logged_in: false, email: null, provider: 'claude' }),
      imac('claude2', { logged_in: null, email: null, provider: 'claude', last_seen_at: vers }),
      imac('claude3', { logged_in: false, email: null, provider: 'claude' }),
      imac('claude4', { logged_in: null, email: null, provider: 'claude' }),
      stoel({ id: 'imac-1:codex3', seat_id: 'codex3', machine: 'imac-1', config_exists: false, logged_in: false }),
    ];
    expect(stoelSleutel({ id: 'mini-van-luka-5:claude2' })).toBe('claude2');
    expect(machineLabel('mini-van-luka-5')).toBe('Mac mini');
    expect(machineLabel('imac-1')).toBe('iMac');
    const win = winnendeStoel([
      imac('claude2', { logged_in: null, last_seen_at: vers }),
      mini('claude2', { logged_in: true, email: 'support@axeheadquarters.com', last_seen_at: ouder }),
    ]);
    expect(win?.logged_in).toBe(true);
    expect(win?.machine).toBe('mini-van-luka-5');

    const { kaarten, ongebruikt } = groepeerAbonnementen(rijen);
    expect(kaarten.map((k) => `${k.provider}:${k.email}:${k.bruikbaarOp.join('+')}`).sort()).toEqual([
      'claude:lukadezeeuw205@gmail.com:Mac mini',
      'claude:lukadezeeuw4@gmail.com:Mac mini',
      'claude:support@axeheadquarters.com:Mac mini',
      'codex:lukadezeeuw1994@hotmail.com:Mac mini+iMac',
      'codex:support@axeheadquarters.com:Mac mini',
      'cursor:lukadezeeuw4@gmail.com:Mac mini',
    ].sort());
    expect(ongebruikt.map((g) => g.stoel.id)).toEqual(['claude']);
    expect(kaarten.every((k) => k.stoel.logged_in === true)).toBe(true);
    expect(kaarten.some((k) => k.seatIds.includes('codex3'))).toBe(false);
  });

  it('voegt een restant-login in ~/.claude samen met het echte account, geen vierde kaart', () => {
    const vers = new Date(Date.parse('2026-10-17T11:00:00Z') - 30_000).toISOString();
    const rijen = [
      stoel({ id: 'mini:claude2', seat_id: 'claude2', email: 'a@x.nl', logged_in: true, last_seen_at: vers, machine: 'mini-van-luka-5' }),
      stoel({ id: 'mini:claude3', seat_id: 'claude3', email: 'b@x.nl', logged_in: true, last_seen_at: vers, machine: 'mini-van-luka-5' }),
      stoel({ id: 'mini:claude4', seat_id: 'claude4', email: 'c@x.nl', logged_in: true, last_seen_at: vers, machine: 'mini-van-luka-5' }),
      // Default map nog ingelogd op hetzelfde adres als claude2 — duplicaat, geen 4e Pro.
      stoel({ id: 'mini:claude', seat_id: 'claude', email: 'a@x.nl', logged_in: false, last_seen_at: vers, machine: 'mini-van-luka-5' }),
    ];
    const { kaarten, ongebruikt } = groepeerAbonnementen(rijen);
    expect(kaarten).toHaveLength(3);
    expect(ongebruikt).toHaveLength(0);
    const a = kaarten.find((k) => k.email === 'a@x.nl')!;
    expect(a.seatIds.sort()).toEqual(['claude', 'claude2']);
    expect(a.bruikbaarOp).toEqual(['Mac mini']);
    expect(verspildeStoelen(rijen)).toEqual([]);
  });

  it('vlagt alleen twee mappen op dezelfde machine als verspild quotum', () => {
    const vers = new Date().toISOString();
    const zelfdeMini = [
      stoel({ id: 'mini:codex', seat_id: 'codex', email: 'lukadezeeuw1994@hotmail.com', logged_in: true, last_seen_at: vers, machine: 'mini-van-luka-5', provider: 'codex' }),
      stoel({ id: 'mini:codex2', seat_id: 'codex2', email: 'lukadezeeuw1994@hotmail.com', logged_in: true, last_seen_at: vers, machine: 'mini-van-luka-5', provider: 'codex' }),
    ];
    expect(verspildeStoelen(zelfdeMini)[0]?.email).toBe('lukadezeeuw1994@hotmail.com');
    const tweeMachines = [
      stoel({ id: 'mini:codex2', seat_id: 'codex2', email: 'lukadezeeuw1994@hotmail.com', logged_in: true, last_seen_at: vers, machine: 'mini-van-luka-5', provider: 'codex' }),
      stoel({ id: 'imac:codex', seat_id: 'codex', email: 'lukadezeeuw1994@hotmail.com', logged_in: true, last_seen_at: vers, machine: 'imac-1', provider: 'codex' }),
    ];
    expect(verspildeStoelen(tweeMachines)).toEqual([]);
  });

  it('houdt Cursor en xAI zonder e-mail als echte kaarten, niet als Not used', () => {
    const vers = new Date().toISOString();
    const rijen = [
      stoel({ id: 'mini:cursor', seat_id: 'cursor', provider: 'cursor', logged_in: false, last_seen_at: vers, machine: 'mini-van-luka-5' }),
      stoel({ id: 'vps:xai', seat_id: 'xai', provider: 'xai', logged_in: false, last_seen_at: vers, machine: 'vps' }),
    ];
    const { kaarten, ongebruikt } = groepeerAbonnementen(rijen);
    expect(ongebruikt).toHaveLength(0);
    expect(kaarten.map((k) => k.stoel.id).sort()).toEqual(['cursor', 'xai']);
  });
});

describe('wat Luka moet doen', () => {
  it('geeft het login-commando of de sleutel, niet Limit seen voor een exitfout', () => {
    expect(watMoetLukaDoen(stoel({ id: 'cursor', provider: 'cursor', logged_in: false, login_command: 'cursor-agent login', machine: 'mini-van-luka-5' })))
      .toMatch(/cursor-agent login/);
    expect(watMoetLukaDoen(stoel({ id: 'cursor2', provider: 'cursor', logged_in: false, machine: 'imac-1' })))
      .toMatch(/zet_cursor2_sleutel\.sh/);
    expect(watMoetLukaDoen(stoel({ id: 'xai', provider: 'xai', logged_in: false, machine: 'vps' })))
      .toMatch(/XAI_API_KEY/);
    expect(watMoetLukaDoen(stoel({ logged_in: true }))).toBeNull();
    expect(watMoetLukaDoen(stoel({ id: 'claude', logged_in: false }))).toBeNull();
    expect(kaartMelding('Cursor ended with 1')).toBe('Cursor ended with 1');
    expect(kaartMelding("You've hit your usage limit")).toMatch(/usage limit/);
    expect(emailUitClaudeOauth({ claudeAiOauth: { email: 'a@x.nl', accessToken: 'GEHEIM' } })).toBe('a@x.nl');
    expect(accountSleutel(stoel({ email: 'A@X.nl', provider: 'claude' }))).toBe('claude:a@x.nl');
    const som = somGebruik(['claude', 'claude2'], {
      claude: { runs_7d: 56, input_tokens_7d: 100, output_tokens_7d: 20, runs_24h: 2, ok_7d: 50, failed_7d: 6, last_run_at: 10 },
      claude2: { runs_7d: 4, input_tokens_7d: 5, output_tokens_7d: 1, runs_24h: 1, ok_7d: 4, failed_7d: 0, last_run_at: 20 },
    });
    expect(som?.runs_7d).toBe(60);
    expect(som?.last_run_at).toBe(20);
  });
});

describe('Settings toont Accounts', () => {
  it('heeft één Subscriptions-sectie, geen tweede kaartgrid onder Providers', () => {
    const settings = readFileSync(new URL('../presentation/pages/SettingsPage.tsx', import.meta.url), 'utf8');
    expect(settings).toMatch(/id: 'accounts'/);
    expect(settings).toMatch(/label: 'Subscriptions'/);
    expect(settings).toMatch(/CodingSeatsSection/);
    expect(settings).toMatch(/label: 'Usage & Credits'/);
    expect(settings).toMatch(/UsageCreditsSection/);
    expect(settings).not.toMatch(/HomeView|NeuralBrain|MemoryTerrain/);
    const seats = readFileSync(new URL('../presentation/components/settings/CodingSeatsSection.tsx', import.meta.url), 'utf8');
    const motoren = readFileSync(new URL('../presentation/components/settings/AgentMotorenSection.tsx', import.meta.url), 'utf8');
    expect(seats).toMatch(/codingSeatsHeartbeat/);
    expect(seats).toMatch(/abonnementKaartStand/);
    expect(motoren).toMatch(/codingSeatsHeartbeat/);
    expect(motoren).not.toMatch(/titel="Subscriptions"/);
    expect(seats).not.toMatch(/stoel\.email \|\| v\?\.account/);
    expect(seats).toMatch(/groepeerAbonnementen/);
    expect(seats).toMatch(/bruikbaarOp/);
    expect(seats).toMatch(/watMoetLukaDoen/);
    expect(seats).toMatch(/verspildeStoelen/);
    const kaart = readFileSync(new URL('../presentation/components/settings/StatusKaart.tsx', import.meta.url), 'utf8');
    expect(kaart).toMatch(/isEchteLimietMelding/);
  });
});
