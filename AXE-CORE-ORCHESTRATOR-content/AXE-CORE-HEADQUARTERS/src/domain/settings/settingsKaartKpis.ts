/**
 * KPI's op de Settings-kaarten (27 nov, Luka t80u: "in die cards ... wel ook
 * wat info of KPI's ... zodat het niet van die lege blokken zijn die alleen
 * functioneren als keuze menu").
 *
 * Puur: geen netwerk, geen opslag. De hook (useSettingsKpis) haalt de bronnen
 * op die de secties zelf al gebruiken; dit zet ze om in 2-4 tegels per kaart.
 * Ontbreekt een bron, dan zegt de tegel dat eerlijk ("Not connected", "—").
 * Nooit een sleutelwaarde: alleen aantallen en aanwezigheid.
 */

export type KpiToon = 'ok' | 'let-op' | 'fout' | 'uit';
export type BronStand = 'laden' | 'ok' | 'fout';

export interface KaartKpi {
  label: string;
  waarde: string;
  regel?: string;
  toon: KpiToon;
  /** Mini-balken 0..1, alleen uit een echte reeks. */
  balken?: number[];
}

export type SettingsSectieId =
  | 'agents' | 'accounts' | 'keys' | 'usage' | 'providers' | 'voice' | 'trust' | 'routing' | 'system';

export interface SettingsKpiBronnen {
  nu: number;
  agents: {
    stand: BronStand;
    lijst: { status: string; last_event_at?: string | null }[];
    approvals: number;
    rosterTotaal: number;
  };
  seats: { stand: BronStand; lijst: { logged_in: boolean | null; rate_limited: boolean }[] };
  abonnementen: { stand: BronStand; lijst: { status: string; limiet_bereikt?: boolean; sessie?: { procent: number }; week?: { procent: number } }[] };
  keys: { stand: BronStand; apps: { app: string; counts: Partial<Record<string, number>> }[]; werkt: number; stuk: number; totaal: number };
  usage: {
    stand: BronStand;
    seats: { label: string; sessions_today: number }[];
    appsMet: number;
    appsTotaal: number;
    /** OpenRouter usage_monthly uit providerUsage, als hij gemeten is. */
    maandCredits: number | null;
  };
  providers: {
    catalogus: number;
    lokaal: number;
    /** null: VPS-lijst niet bereikt. */
    server: number | null;
    getestOk: number;
    getestFout: number;
    ollamaModellen: number;
    ollamaOk: number;
    ollamaFout: number;
  };
  voice: { mic: string; herkenning: boolean; wake: boolean; clap: boolean };
  trust: { stand: BronStand; rijen: number; autoAan: number; categorieen: number; autoRuns: number; nativeTools: boolean; tools: number };
  routing: { beurten: number; perTier: [number, number, number]; standaardModel: string | null; capabilities: number | null; lopend: number };
  system: {
    stand: BronStand;
    services: { service: string; status: string }[];
    repos: number;
    reposMetToken: number;
  };
}

const NIET_VERBONDEN = 'Not connected';

function geledenKort(iso: string | null | undefined, nu: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((nu - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function bronTegel(label: string, stand: BronStand): KaartKpi {
  return stand === 'laden'
    ? { label, waarde: '…', regel: 'Loading', toon: 'uit' }
    : { label, waarde: '—', regel: NIET_VERBONDEN, toon: 'uit' };
}

const BEZIG = new Set(['WORKING', 'VERIFYING', 'WAITING_TOOL', 'WAITING_AGENT']);

function agentsKpis(b: SettingsKpiBronnen): KaartKpi[] {
  const a = b.agents;
  if (a.stand !== 'ok') return [bronTegel('Online', a.stand), bronTegel('Busy now', a.stand), { label: 'Roster', waarde: String(a.rosterTotaal), regel: 'agents known', toon: 'uit' }];
  const online = a.lijst.filter((x) => x.status !== 'SLEEPING' && x.status !== 'ERROR').length;
  const bezig = a.lijst.filter((x) => BEZIG.has(x.status)).length;
  const fout = a.lijst.filter((x) => x.status === 'ERROR' || x.status === 'BLOCKED').length;
  const laatste = a.lijst.map((x) => x.last_event_at).filter((x): x is string => !!x).sort().pop() ?? null;
  return [
    { label: 'Online', waarde: `${online}/${a.lijst.length}`, regel: fout ? `${fout} error` : 'reporting', toon: fout ? 'fout' : online ? 'ok' : 'let-op' },
    { label: 'Busy now', waarde: String(bezig), regel: bezig ? 'working' : 'idle', toon: bezig ? 'ok' : 'uit' },
    { label: 'Needs you', waarde: String(a.approvals), regel: 'approvals', toon: a.approvals ? 'let-op' : 'ok' },
    { label: 'Last run', waarde: geledenKort(laatste, b.nu) ?? '—', regel: laatste ? 'last event' : 'nothing yet', toon: 'uit' },
  ];
}

function accountsKpis(b: SettingsKpiBronnen): KaartKpi[] {
  const s = b.seats;
  const ab = b.abonnementen;
  const uit: KaartKpi[] = [];
  if (s.stand === 'ok') {
    const ingelogd = s.lijst.filter((x) => x.logged_in === true).length;
    const limiet = s.lijst.filter((x) => x.rate_limited).length;
    uit.push({ label: 'Seats', waarde: `${ingelogd}/${s.lijst.length}`, regel: 'logged in', toon: s.lijst.length && ingelogd === s.lijst.length ? 'ok' : ingelogd ? 'let-op' : 'fout' });
    uit.push({ label: 'Rate limited', waarde: String(limiet), regel: limiet ? 'waiting' : 'none', toon: limiet ? 'let-op' : 'ok' });
  } else {
    uit.push(bronTegel('Seats', s.stand));
  }
  if (ab.stand === 'ok') {
    const actief = ab.lijst.filter((x) => x.status === 'ok' || x.status === 'idle').length;
    const vol = ab.lijst.filter((x) => x.limiet_bereikt || Math.max(x.sessie?.procent ?? 0, x.week?.procent ?? 0) >= 80).length;
    uit.push({ label: 'Subscriptions', waarde: `${actief}/${ab.lijst.length}`, regel: 'active', toon: actief === ab.lijst.length && actief ? 'ok' : 'let-op' });
    uit.push({
      label: 'Near limit', waarde: String(vol), regel: 'session or week ≥80%', toon: vol ? 'let-op' : 'ok',
      balken: ab.lijst.map((x) => Math.min(1, Math.max(x.sessie?.procent ?? 0, x.week?.procent ?? 0) / 100)),
    });
  } else {
    uit.push(bronTegel('Subscriptions', ab.stand));
  }
  return uit.slice(0, 4);
}

function keysKpis(b: SettingsKpiBronnen): KaartKpi[] {
  const k = b.keys;
  if (k.stand !== 'ok') return [bronTegel('Apps', k.stand), bronTegel('Keys', k.stand)];
  const compleet = k.apps.filter((a) => !(a.counts.missing ?? 0) && !(a.counts.broken ?? 0)).length;
  const missend = k.apps.reduce((n, a) => n + (a.counts.missing ?? 0), 0);
  return [
    { label: 'Apps complete', waarde: `${compleet}/${k.apps.length}`, regel: 'no missing key', toon: compleet === k.apps.length ? 'ok' : 'let-op' },
    { label: 'Keys work', waarde: `${k.werkt}/${k.totaal}`, regel: 'tested OK', toon: k.werkt ? 'ok' : 'uit' },
    { label: 'Missing', waarde: String(missend), regel: 'not set', toon: missend ? 'let-op' : 'ok' },
    { label: 'Broken', waarde: String(k.stuk), regel: 'rejected', toon: k.stuk ? 'fout' : 'ok' },
  ];
}

function usageKpis(b: SettingsKpiBronnen): KaartKpi[] {
  const u = b.usage;
  const credits: KaartKpi = u.maandCredits == null
    ? { label: 'Credits · month', waarde: '—', regel: 'not measured yet', toon: 'uit' }
    : { label: 'Credits · month', waarde: u.maandCredits.toFixed(2), regel: 'OpenRouter, measured', toon: 'ok' };
  if (u.stand !== 'ok') return [bronTegel('Sessions today', u.stand), credits];
  const totaal = u.seats.reduce((n, s) => n + s.sessions_today, 0);
  const top = [...u.seats].sort((x, y) => y.sessions_today - x.sessions_today)[0];
  const max = Math.max(1, ...u.seats.map((s) => s.sessions_today));
  return [
    { label: 'Sessions today', waarde: String(totaal), regel: `${u.seats.length} seats`, toon: totaal ? 'ok' : 'uit', balken: u.seats.length > 1 ? u.seats.map((s) => s.sessions_today / max) : undefined },
    { label: 'Busiest seat', waarde: top && top.sessions_today ? top.label : '—', regel: top && top.sessions_today ? `${top.sessions_today} sessions` : 'no sessions yet', toon: 'uit' },
    { label: 'Apps on budget', waarde: `${u.appsMet}/${u.appsTotaal}`, regel: 'daily target', toon: u.appsTotaal && u.appsMet === u.appsTotaal ? 'ok' : 'let-op' },
    credits,
  ];
}

function providersKpis(b: SettingsKpiBronnen): KaartKpi[] {
  const p = b.providers;
  const sleutels = p.server == null ? p.lokaal : Math.max(p.lokaal, p.server);
  return [
    { label: 'Keys set', waarde: `${sleutels}/${p.catalogus}`, regel: p.server == null ? 'this device · VPS not reached' : 'device + VPS', toon: sleutels ? 'ok' : 'let-op' },
    { label: 'Health', waarde: p.getestOk + p.getestFout ? `${p.getestOk}/${p.getestOk + p.getestFout}` : '—', regel: p.getestFout ? `${p.getestFout} failing` : p.getestOk ? 'all tests OK' : 'not tested yet', toon: p.getestFout ? 'let-op' : p.getestOk ? 'ok' : 'uit' },
    { label: 'Ollama models', waarde: String(p.ollamaModellen), regel: p.ollamaOk + p.ollamaFout ? `${p.ollamaOk} OK · ${p.ollamaFout} fail` : 'not tested yet', toon: p.ollamaFout ? 'let-op' : p.ollamaOk ? 'ok' : 'uit' },
  ];
}

function voiceKpis(b: SettingsKpiBronnen): KaartKpi[] {
  const v = b.voice;
  return [
    { label: 'Microphone', waarde: v.mic === 'granted' ? 'OK' : v.mic === 'denied' ? 'Blocked' : '?', regel: v.mic, toon: v.mic === 'granted' ? 'ok' : v.mic === 'denied' ? 'fout' : 'let-op' },
    { label: 'Hey AXE', waarde: v.wake ? 'On' : 'Off', regel: 'wake word', toon: v.wake ? 'ok' : 'uit' },
    { label: 'Clap', waarde: v.clap ? 'On' : 'Off', regel: 'to activate', toon: v.clap ? 'ok' : 'uit' },
    { label: 'Speech', waarde: v.herkenning ? 'Yes' : 'No', regel: 'recognition', toon: v.herkenning ? 'ok' : 'let-op' },
  ];
}

function trustKpis(b: SettingsKpiBronnen): KaartKpi[] {
  const t = b.trust;
  const tools: KaartKpi = { label: 'Tool calling', waarde: t.nativeTools ? 'Native' : 'Markers', regel: `${t.tools} tools`, toon: 'uit' };
  if (t.stand !== 'ok') return [bronTegel('Auto-run', t.stand), tools];
  const niveau = t.autoAan === 0 ? 'Ask all' : t.autoAan === t.categorieen ? 'Full' : 'Partial';
  return [
    { label: 'Trust level', waarde: niveau, regel: t.rijen === 0 ? 'no trust rows yet' : `${t.autoAan}/${t.categorieen} auto-run`, toon: t.autoAan ? 'let-op' : 'ok' },
    { label: 'Auto runs', waarde: String(t.autoRuns), regel: 'done without asking', toon: 'uit' },
    tools,
  ];
}

function routingKpis(b: SettingsKpiBronnen): KaartKpi[] {
  const r = b.routing;
  const max = Math.max(1, ...r.perTier);
  return [
    { label: 'Turns routed', waarde: String(r.beurten), regel: r.beurten ? `T1 ${r.perTier[0]} · T2 ${r.perTier[1]} · T3 ${r.perTier[2]}` : 'none on this device yet', toon: r.beurten ? 'ok' : 'uit', balken: r.beurten ? r.perTier.map((n) => n / max) : undefined },
    { label: 'Default model', waarde: r.standaardModel ?? 'Auto', regel: r.standaardModel ? 'primary slot' : 'no primary set', toon: 'uit' },
    r.capabilities == null
      ? { label: 'Capabilities', waarde: '—', regel: NIET_VERBONDEN, toon: 'uit' }
      : { label: 'Capabilities', waarde: String(r.capabilities), regel: 'routes in router', toon: r.capabilities ? 'ok' : 'let-op' },
    { label: 'Jobs running', waarde: String(r.lopend), regel: 'tier 3 now', toon: r.lopend ? 'ok' : 'uit' },
  ];
}

/** Telt diensten zoals Live services: online / degraded / offline / niet ingesteld. */
export function dienstTelling(services: { status: string }[]) {
  const op = services.filter((s) => s.status === 'online').length;
  const traag = services.filter((s) => s.status === 'degraded').length;
  const neer = services.filter((s) => s.status === 'offline' || s.status === 'error').length;
  return { op, traag, neer, overig: services.length - op - traag - neer, totaal: services.length };
}

function systemKpis(b: SettingsKpiBronnen): KaartKpi[] {
  const s = b.system;
  const repos: KaartKpi = { label: 'Repos', waarde: String(s.repos), regel: `${s.reposMetToken} with token`, toon: s.reposMetToken ? 'ok' : 'let-op' };
  if (s.stand !== 'ok' || s.services.length === 0) return [bronTegel('Services', s.stand === 'ok' ? 'fout' : s.stand), repos];
  const t = dienstTelling(s.services);
  const terminal = s.services.find((x) => x.service === 'terminal');
  return [
    { label: 'Services up', waarde: `${t.op}/${t.totaal}`, regel: t.neer ? `${t.neer} down` : t.traag ? `${t.traag} degraded` : 'all reachable', toon: t.neer ? 'fout' : t.traag ? 'let-op' : 'ok' },
    { label: 'Terminal', waarde: terminal ? (terminal.status === 'online' ? 'Online' : terminal.status) : '—', regel: 'remote shell', toon: terminal?.status === 'online' ? 'ok' : terminal ? 'fout' : 'uit' },
    repos,
  ];
}

export function settingsKaartKpis(b: SettingsKpiBronnen): Record<SettingsSectieId, KaartKpi[]> {
  return {
    agents: agentsKpis(b),
    accounts: accountsKpis(b),
    keys: keysKpis(b),
    usage: usageKpis(b),
    providers: providersKpis(b),
    voice: voiceKpis(b),
    trust: trustKpis(b),
    routing: routingKpis(b),
    system: systemKpis(b),
  };
}
