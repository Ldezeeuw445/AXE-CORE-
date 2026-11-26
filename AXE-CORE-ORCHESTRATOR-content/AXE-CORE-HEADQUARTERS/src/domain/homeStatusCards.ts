/**
 * Home v6 (Luka 25 nov): vier gelijke statuskaarten voor de ruimte die een
 * groot scherm overhoudt: connectors (MCP), trading-accounts, mail en de
 * overige kernstatus. Puur; alleen echte data, en wat niet gemeten wordt zegt
 * dat eerlijk.
 */
import type { Toon } from '@/domain/homeCommandCenter';

export type StatusRegel = { id: string; naam: string; toon: Toon; regel: string };

/* ── Connectors ────────────────────────────────────────────────────────── */

export type ConnectorServer = { id: string; naam: string; klaar: boolean; sleutel: string; categorie: string };
export type ConnectorTest = { status: 'online' | 'offline' | 'sleutel_ontbreekt'; latency?: number; fout?: string };

/**
 * Per MCP-server uit de hub: werkt hij (alleen als hij net getest is), staat
 * hij klaar, of ontbreekt de sleutel. Zonder test zeggen we "ready", nooit
 * "works": de lijst alleen bewijst niet dat hij antwoordt.
 */
export function connectorRegels(servers: readonly ConnectorServer[], tests: Readonly<Record<string, ConnectorTest>> = {}): {
  regels: StatusRegel[]; werkt: number; klaar: number; totaal: number; getest: number;
} {
  const regels = servers.map((s): StatusRegel => {
    const t = tests[s.id];
    if (t?.status === 'online') return { id: s.id, naam: s.naam, toon: 'ok', regel: t.latency != null ? `works · ${Math.round(t.latency)} ms` : 'works' };
    if (t?.status === 'offline') return { id: s.id, naam: s.naam, toon: 'fout', regel: t.fout ? `offline · ${t.fout.slice(0, 60)}` : 'offline' };
    if (t?.status === 'sleutel_ontbreekt' || s.sleutel === 'ontbreekt') return { id: s.id, naam: s.naam, toon: 'let-op', regel: 'key missing' };
    return { id: s.id, naam: s.naam, toon: s.klaar ? 'stil' : 'uit', regel: s.klaar ? 'ready · not tested' : 'not set up' };
  });
  const rang: Record<Toon, number> = { fout: 0, 'let-op': 1, ok: 2, stil: 3, uit: 4 };
  regels.sort((a, b) => rang[a.toon] - rang[b.toon] || a.naam.localeCompare(b.naam));
  return {
    regels,
    werkt: regels.filter((r) => r.toon === 'ok').length,
    klaar: servers.filter((s) => s.klaar).length,
    totaal: servers.length,
    getest: Object.keys(tests).length,
  };
}

/* ── Trading-accounts ──────────────────────────────────────────────────── */

export type AccountRij = { id: string; label: string; enabled: boolean; environment?: 'demo' | 'live'; run?: string; serverOrProvider?: string | null };
export type Breaker = { tripped: boolean; trippedReason?: string; peakEquity?: number } | null;

/**
 * Per account: aan of uit, demo of live, de ronde, en de circuit breaker.
 * De live verbinding (MetaAPI) wordt hier niet gebeld; dat staat op Trading.
 */
export function accountRegels(accounts: readonly AccountRij[], breakers: Readonly<Record<string, Breaker>> = {}): {
  regels: StatusRegel[]; aan: number; gestopt: number;
} {
  const regels = accounts.map((a): StatusRegel => {
    const b = breakers[a.id];
    const omgeving = a.environment === 'live' ? 'live' : a.environment === 'demo' ? 'demo' : 'broker type';
    const delen = [omgeving, a.run && a.run !== 'run-1' ? a.run : null, a.serverOrProvider || null].filter(Boolean).join(' · ');
    if (!a.enabled) return { id: a.id, naam: a.label, toon: 'uit', regel: `off · ${delen}` };
    if (b?.tripped) return { id: a.id, naam: a.label, toon: 'fout', regel: `breaker tripped${b.trippedReason ? ` · ${b.trippedReason.slice(0, 50)}` : ''}` };
    return { id: a.id, naam: a.label, toon: 'ok', regel: `on · ${delen}${b ? ' · breaker armed' : ' · no breaker yet'}` };
  });
  return {
    regels,
    aan: accounts.filter((a) => a.enabled).length,
    gestopt: regels.filter((r) => r.toon === 'fout').length,
  };
}

/* ── Accounts per app (26 nov, Luka) ───────────────────────────────────── */

export type CompanionRij = { id: string; label: string; provider: string | null; verbonden: boolean; provider_status: string | null; modus: string | null; laatste_sync: string | null };
export type AccountGroep = { id: 'axe_core' | 'companion' | 'trading_os'; titel: string; regels: StatusRegel[]; leeg: string };

function geleden(iso: string | null, nu: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 'never synced';
  const min = Math.round((nu - t) / 60_000);
  if (min < 60) return `synced ${Math.max(1, min)} min ago`;
  if (min < 48 * 60) return `synced ${Math.round(min / 60)} h ago`;
  return `synced ${Math.round(min / 1440)} days ago`;
}

/**
 * De kaart in drie blokken: AXE Core (AXE Algo, de accounts die AXE zelf
 * handelt), AXE Companion en Trading OS. Zo weet AXE Core van alle drie,
 * en zie je welke bij welke app hoort.
 */
export function accountGroepen(in_: {
  axeCore: StatusRegel[];
  companion: { accounts?: CompanionRij[]; demo_testrijen?: number; fout?: string } | null;
  tradingOs: { bereikbaar: boolean; reden?: string } | null;
  nu: number;
}): AccountGroep[] {
  const comp: StatusRegel[] = (in_.companion?.accounts ?? []).map((a) => ({
    id: `c:${a.id}`,
    naam: a.label,
    toon: a.verbonden ? 'ok' : 'fout',
    regel: [a.verbonden ? 'connected' : (a.provider_status || 'not connected'), a.modus, a.provider, geleden(a.laatste_sync, in_.nu)].filter(Boolean).join(' · '),
  }));
  if (in_.companion?.demo_testrijen) {
    comp.push({ id: 'c:demo', naam: `${in_.companion.demo_testrijen} demo test rows`, toon: 'stil', regel: 'paper accounts from 11 Sep, not shown' });
  }
  const tos: StatusRegel[] = in_.tradingOs?.bereikbaar === false
    ? [{ id: 't:niet', naam: 'Not readable from AXE yet', toon: 'stil', regel: 'Trading OS keeps accounts in its own database' }]
    : [];
  return [
    { id: 'axe_core', titel: 'AXE Core · AXE Algo', regels: in_.axeCore, leeg: 'No accounts linked to AXE Algo yet. Add one in Trading > Accounts.' },
    { id: 'companion', titel: 'AXE Companion', regels: comp, leeg: in_.companion?.fout ? 'Companion accounts did not load.' : in_.companion ? 'No Companion accounts.' : 'Reading…' },
    { id: 'trading_os', titel: 'Trading OS', regels: tos, leeg: in_.tradingOs ? 'No Trading OS accounts.' : 'Reading…' },
  ];
}

/* ── Mail ──────────────────────────────────────────────────────────────── */

/**
 * AXE Core heeft geen eigen inbox met ongelezen-tellers. Wat er wel echt is:
 * de NorthSea-desk (concepten die op je OK wachten, bounces, communicatie in
 * 7 dagen) en wat er in Waiting on you staat.
 */
export function mailStand(in_: { concepten: number | null; bounces: number | null; comms7d: number | null; wacht: number | null }): {
  regels: StatusRegel[]; toon: Toon;
} {
  const r: StatusRegel[] = [];
  if (in_.concepten != null) r.push({ id: 'concepten', naam: 'Drafts waiting for your OK', toon: in_.concepten ? 'let-op' : 'ok', regel: String(in_.concepten) });
  if (in_.wacht != null) r.push({ id: 'wacht', naam: 'Waiting on you', toon: in_.wacht ? 'let-op' : 'ok', regel: String(in_.wacht) });
  if (in_.bounces != null) r.push({ id: 'bounces', naam: 'Bounced mails', toon: in_.bounces ? 'fout' : 'ok', regel: String(in_.bounces) });
  if (in_.comms7d != null) r.push({ id: 'comms', naam: 'NorthSea mails · 7 days', toon: 'stil', regel: String(in_.comms7d) });
  const toon: Toon = r.some((x) => x.toon === 'fout') ? 'fout' : r.some((x) => x.toon === 'let-op') ? 'let-op' : r.length ? 'ok' : 'uit';
  return { regels: r, toon };
}

/* ── Overige kernstatus ────────────────────────────────────────────────── */

export type SleutelApp = { counts: Partial<Record<string, number>> };

/** Sleutels over alle apps: werkt, aanwezig, ontbreekt, kapot. */
export function sleutelTelling(apps: readonly SleutelApp[]): { werkt: number; aanwezig: number; ontbreekt: number; kapot: number } {
  const t = { werkt: 0, aanwezig: 0, ontbreekt: 0, kapot: 0 };
  for (const a of apps) {
    t.werkt += a.counts.works ?? 0;
    t.aanwezig += a.counts.present ?? 0;
    t.ontbreekt += a.counts.missing ?? 0;
    t.kapot += a.counts.broken ?? 0;
  }
  return t;
}
