/**
 * Home als command center (Luka, 25 nov: "echt als dat dashboard wat ik
 * stuurde"). Pure afleidingen voor de kaarten, zodat het scherm alleen
 * tekent. Niets verzonnen: wat niet gemeten is, komt hier als leeg terug.
 */

/** 'stil' = er is iets (een sleutel), maar vandaag niet gemeten: geen probleem, ook geen groen. */
export type Toon = 'ok' | 'let-op' | 'stil' | 'fout' | 'uit';

export type ProviderStand = { configured: boolean; reachable: boolean; detail?: string };
export type ProviderTegel = { id: string; naam: string; toon: Toon; regel: string; heeftSleutel: boolean };
/** Een sleutelrij uit /keys/overview, alleen wat Home nodig heeft. Nooit een waarde. */
export type ProviderSleutel = { provider?: string | null; status: string; usage?: { last_status: number | null } | null };

const PROVIDER_NAAM: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', claude: 'Claude', openrouter: 'OpenRouter', ollama: 'Ollama',
  xai: 'xAI', grok: 'Grok', gemini: 'Gemini', google: 'Gemini', groq: 'Groq', mistral: 'Mistral',
  deepseek: 'DeepSeek', cerebras: 'Cerebras', together: 'Together', perplexity: 'Perplexity',
};

/** Alleen taalmodellen; zoek (Exa), stem (ElevenLabs) en agents (OpenHands) horen niet in deze kaart. */
const LLM_PROVIDERS = new Set(['openai', 'anthropic', 'google', 'gemini', 'groq', 'openrouter', 'xai', 'cerebras',
  'perplexity', 'ollama', 'mistral', 'deepseek', 'together']);

function providerNaam(id: string): string {
  return PROVIDER_NAAM[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

type Oordeel = { toon: Toon; regel: string; rang: number; sleutel: boolean };

/** Wat één sleutel over zijn provider zegt. Rang: hoger wint (werkt > beperkt > stil > kapot > geen). */
function oordeelSleutel(k: ProviderSleutel): Oordeel {
  const laatst = k.usage?.last_status ?? null;
  const sleutel = k.status === 'works' || k.status === 'present' || k.status === 'broken';
  if (laatst != null && laatst >= 200 && laatst < 300) return { toon: 'ok', regel: 'Answering', rang: 5, sleutel: true };
  if (k.status === 'works') return { toon: 'ok', regel: 'Key works', rang: 5, sleutel: true };
  if (laatst === 429) return { toon: 'let-op', regel: 'Rate limited', rang: 4, sleutel: true };
  if (laatst === 402) return { toon: 'let-op', regel: 'Out of credit', rang: 4, sleutel: true };
  if (laatst != null && laatst >= 400) return { toon: 'fout', regel: `Last call HTTP ${laatst}`, rang: 2, sleutel: true };
  if (k.status === 'present') return { toon: 'stil', regel: 'Key set · idle', rang: 3, sleutel: true };
  if (k.status === 'broken') return { toon: 'fout', regel: 'Key broken', rang: 2, sleutel: true };
  return { toon: 'uit', regel: k.status === 'missing' ? 'No key' : 'Not used', rang: 1, sleutel };
}

/**
 * De volle lijst: de live probe (/status/axe-core stopt bij de eerste die
 * antwoordt, dus die kent er vaak maar één) aangevuld met de sleutels per app.
 * Per provider wint het beste oordeel. Bereikbaar eerst, dan op naam.
 */
export function providerTegels(
  providers: Record<string, ProviderStand> | null | undefined,
  sleutels: readonly ProviderSleutel[] = [],
): ProviderTegel[] {
  const per = new Map<string, Oordeel>();
  const zet = (id: string, o: Oordeel) => {
    const nu = per.get(id);
    if (!nu || o.rang > nu.rang) per.set(id, { ...o, sleutel: o.sleutel || !!nu?.sleutel });
    else if (o.sleutel && !nu.sleutel) per.set(id, { ...nu, sleutel: true });
  };
  for (const k of sleutels) {
    const id = (k.provider ?? '').toLowerCase();
    if (!id || !LLM_PROVIDERS.has(id)) continue;
    zet(id === 'gemini' ? 'google' : id, oordeelSleutel(k));
  }
  for (const [ruw, p] of Object.entries(providers ?? {})) {
    const id = ruw.toLowerCase() === 'gemini' ? 'google' : ruw.toLowerCase();
    if (p.reachable) zet(id, { toon: 'ok', regel: 'Connected', rang: 6, sleutel: true });
    else if (p.configured) zet(id, { toon: 'let-op', regel: p.detail || 'Not answering', rang: 4, sleutel: true });
    else zet(id, { toon: 'uit', regel: 'No key', rang: 1, sleutel: false });
  }
  const orde: Record<Toon, number> = { ok: 0, 'let-op': 1, stil: 2, fout: 3, uit: 4 };
  return [...per.entries()]
    .map(([id, o]): ProviderTegel => ({ id, naam: providerNaam(id), toon: o.toon, regel: o.regel, heeftSleutel: o.sleutel }))
    .sort((a, b) => orde[a.toon] - orde[b.toon] || a.naam.localeCompare(b.naam));
}

/** Hoeveel providers nu antwoorden, van hoeveel met een sleutel. Null zonder enige meting. */
export function llmTelling(tegels: readonly ProviderTegel[] | null | undefined): { verbonden: number; ingesteld: number } | null {
  if (!tegels || tegels.length === 0) return null;
  return { verbonden: tegels.filter((t) => t.toon === 'ok').length, ingesteld: tegels.filter((t) => t.heeftSleutel).length };
}

/* ── Live feed ─────────────────────────────────────────────────────────── */

export type FeedSoort = 'fout' | 'klaar' | 'let-op' | 'info';
export type FeedRegel = { id: string; soort: FeedSoort; titel: string; sub: string; at: number | null; route: string };

export type FeedMelding = { id: string; type: string; title: string; detail: string; timestamp: number; read: boolean };
export type FeedFout = { at: string; app: string; name: string; status: string; detail: string; ref_id: string; source: string };
export type FeedTaak = { id: string; agent: string; titel: string; stand: string };

/**
 * Wat er net gebeurde, nieuwste eerst: mislukte runs uit het grootboek,
 * meldingen (PR's, cron, NorthSea) en de laatst afgeronde taken.
 * Dubbele onderwerpen vallen weg; taken zonder tijd komen achteraan.
 */
export function feedRegels(
  in_: { meldingen?: FeedMelding[]; fouten?: FeedFout[]; recent?: FeedTaak[] },
  max = 6,
): FeedRegel[] {
  const uit: FeedRegel[] = [];
  /* Dezelfde job die steeds faalt is één regel met een teller, niet een
     feed vol kopieën (25 nov: 14× files.list op de Mac mini). */
  const perJob = new Map<string, { f: FeedFout; at: number | null; aantal: number }>();
  for (const f of in_.fouten ?? []) {
    const t = Date.parse(f.at);
    const at = Number.isFinite(t) ? t : null;
    const nu = perJob.get(f.name);
    if (!nu) perJob.set(f.name, { f, at, aantal: 1 });
    else {
      nu.aantal += 1;
      if ((at ?? -1) > (nu.at ?? -1)) { nu.f = f; nu.at = at; }
    }
  }
  for (const [naam, { f, at, aantal }] of perJob) {
    uit.push({
      id: `run:${naam}`,
      soort: 'fout',
      titel: aantal > 1 ? `${naam} failed ×${aantal}` : `${naam} failed`,
      sub: f.detail || f.app || f.source,
      at,
      route: '/ledger',
    });
  }
  for (const m of in_.meldingen ?? []) {
    const soort: FeedSoort = m.type === 'error' ? 'fout' : m.type === 'warning' ? 'let-op' : m.type === 'success' ? 'klaar' : 'info';
    uit.push({ id: `melding:${m.id}`, soort, titel: m.title, sub: m.detail, at: m.timestamp || null, route: '/notifications' });
  }
  for (const t of in_.recent ?? []) {
    uit.push({
      id: `taak:${t.id}`,
      soort: t.stand === 'failed' ? 'fout' : 'klaar',
      titel: `${t.agent} · ${t.stand === 'failed' ? 'failed' : 'done'}`,
      sub: t.titel,
      at: null,
      route: '/tasks',
    });
  }
  const gezien = new Set<string>();
  return uit
    .sort((a, b) => (b.at ?? -1) - (a.at ?? -1))
    .filter((r) => {
      const sleutel = `${r.titel}|${r.sub}`.toLowerCase();
      if (gezien.has(sleutel)) return false;
      gezien.add(sleutel);
      return true;
    })
    .slice(0, max);
}

/** "now", "5m", "2h", "3d". Leeg zonder tijd. */
export function geledenTekst(at: number | null, nu = Date.now()): string {
  if (at == null) return '';
  const s = Math.max(0, Math.round((nu - at) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/* ── Systeemmonitor ────────────────────────────────────────────────────── */

export type Machine = { id: string; name: string; online: boolean; cpu: number | null; mem: number | null; disk: number | null };

/** Hooguit twee machines voor de ringen: de Mac mini en de VPS als die er zijn, anders de eerste twee. */
/**
 * 26 nov (Luka): alle machines, niet de eerste twee -- de Macs en de drie
 * VPS'en. Volgorde: Macs, dan de VPS'en; max 6 zodat de kaart nooit scrolt.
 */
export function kiesMachines(systems: Machine[] | null | undefined): Machine[] {
  if (!systems?.length) return [];
  const score = (m: Machine) => {
    const s = `${m.id} ${m.name}`.toLowerCase();
    if (/mini/.test(s)) return 0;
    if (/imac/.test(s)) return 1;
    if (/^vps$|vps api/.test(s)) return 2;
    if (/model|ollama/.test(s)) return 3;
    if (/vps|server|strato|mt5|bridge/.test(s)) return 4;
    return 5;
  };
  return [...systems].sort((a, b) => score(a) - score(b)).slice(0, 6).map((m) => ({ ...m, name: machineNaam(m.name) }));
}

/** Korte namen voor de ringen: de snapshot zegt "VPS API", Luka zegt VPS. */
function machineNaam(naam: string): string {
  const n = naam.trim();
  if (/^vps api$/i.test(n)) return 'VPS';
  if (/^vps mt5 bridge$/i.test(n)) return 'VPS MT5';
  return n;
}

/** Hoeveel rijen de monitor heeft: tot twee machines onder elkaar, daarna twee kolommen. */
export function monitorRijen(aantal: number): number {
  return aantal <= 2 ? Math.max(1, aantal) : Math.ceil(aantal / 2);
}

/** Een percentage voor een ring, of null als het niet gemeten is. */
export function ringWaarde(pct: number | null | undefined): number | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function ringToon(pct: number | null): Toon {
  if (pct == null) return 'uit';
  if (pct >= 90) return 'fout';
  if (pct >= 75) return 'let-op';
  return 'ok';
}

/* ── Tijdlijn ──────────────────────────────────────────────────────────── */

export type TijdItem = { id: string; tijd: string; titel: string; kleur: string };
export type TijdJob = { key: string; at: string; naam: string; aantal: number; herhaling: string | null; kleur: string };
export type Tijdlijn = {
  /** Wat vandaag nog één keer draait, op tijd. */
  eenmalig: TijdItem[];
  /** Alle crons die vaker draaien, samen één regel. Null als er geen zijn. */
  herhalend: { jobs: number; runs: number; regel: string } | null;
};

function klokVan(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Vandaag vanaf nu. Crons die elke paar minuten draaien vullen anders de hele
 * kaart (25 nov: 38 van de 45 items, "elke 1 min (253×)"); die worden één
 * samenvattende regel, en de eenmalige runs staan eronder op tijd.
 */
export function tijdlijnVandaag(jobs: readonly TijdJob[], nu: Date, max = 4): Tijdlijn {
  const vandaag = `${nu.getFullYear()}-${nu.getMonth()}-${nu.getDate()}`;
  const herhalend: TijdJob[] = [];
  const eenmalig: Array<TijdItem & { t: number }> = [];
  for (const j of jobs) {
    const d = new Date(j.at);
    const t = d.getTime();
    if (!Number.isFinite(t) || t < nu.getTime() - 60_000) continue;
    if (`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` !== vandaag) continue;
    if (j.herhaling || j.aantal > 1) herhalend.push(j);
    else eenmalig.push({ id: j.key, tijd: klokVan(d), titel: j.naam, kleur: j.kleur, t });
  }
  let samen: Tijdlijn['herhalend'] = null;
  if (herhalend.length) {
    const stappen = herhalend
      .map((j) => Number(/(\d+)\s*min/.exec(j.herhaling ?? '')?.[1]))
      .filter((n) => Number.isFinite(n) && n > 0);
    const min = stappen.length ? Math.min(...stappen) : null;
    const maxStap = stappen.length ? Math.max(...stappen) : null;
    const elk = min == null ? 'repeating' : min === maxStap ? `every ${min} min` : `every ${min}–${maxStap} min`;
    const runs = herhalend.reduce((n, j) => n + Math.max(1, j.aantal), 0);
    samen = { jobs: herhalend.length, runs, regel: `${herhalend.length} repeating ${herhalend.length === 1 ? 'job' : 'jobs'} · ${elk} · ${runs} runs left` };
  }
  return {
    eenmalig: eenmalig.sort((a, b) => a.t - b.t).slice(0, max).map(({ id, tijd, titel, kleur }) => ({ id, tijd, titel, kleur })),
    herhalend: samen,
  };
}

/* ── Toestellen ────────────────────────────────────────────────────────── */

export type ToestelRij = { device_id: string; device_name: string; last_seen: string | null; ditToestel: boolean };

/**
 * Alleen wat recent gezien is (standaard 24 uur), en elke naam één keer, de
 * nieuwste. De tabel bewaart elke installatie ooit (25 nov: 32 rijen, 29 oud).
 * Dit toestel staat er altijd in.
 */
export function recenteToestellen<T extends ToestelRij>(rijen: readonly T[], nu = Date.now(), vensterMs = 24 * 3600_000): T[] {
  const per = new Map<string, T>();
  for (const r of rijen) {
    const t = r.last_seen ? Date.parse(r.last_seen) : NaN;
    const recent = Number.isFinite(t) && nu - t <= vensterMs;
    if (!recent && !r.ditToestel) continue;
    const sleutel = r.device_name.trim().toLowerCase() || r.device_id;
    const oud = per.get(sleutel);
    const tOud = oud?.last_seen ? Date.parse(oud.last_seen) : -1;
    if (!oud || r.ditToestel || (Number.isFinite(t) && t > tOud && !oud.ditToestel)) per.set(sleutel, r);
  }
  return [...per.values()].sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? ''));
}

/* ── Grafiekjes en KPI's ───────────────────────────────────────────────── */

/**
 * Tel tijdstempels per uur over de laatste `uren`, oudste eerst. Het laatste
 * vak is het lopende uur. Wat buiten het venster valt telt niet mee.
 */
export function perUur(tijden: ReadonlyArray<string | null | undefined>, nu: number, uren = 24): number[] {
  const vakken = new Array<number>(uren).fill(0);
  const uurMs = 3600_000;
  const eind = Math.floor(nu / uurMs) * uurMs + uurMs;
  for (const t of tijden) {
    const ms = t ? Date.parse(t) : NaN;
    if (!Number.isFinite(ms) || ms > nu || ms < eind - uren * uurMs) continue;
    const i = uren - 1 - Math.floor((eind - 1 - ms) / uurMs);
    if (i >= 0 && i < uren) vakken[i] += 1;
  }
  return vakken;
}

/** Opgetelde P&L van gesloten trades, oudste eerst. Leeg zonder gesloten trades. */
export function pnlLijn(trades: ReadonlyArray<{ pnl: number | null; closed_at: string | null }>, max = 60): number[] {
  const dicht = trades
    .filter((t) => t.closed_at && typeof t.pnl === 'number' && Number.isFinite(t.pnl))
    .sort((a, b) => Date.parse(a.closed_at!) - Date.parse(b.closed_at!));
  let som = 0;
  const lijn = dicht.map((t) => (som += t.pnl as number));
  return lijn.slice(-max);
}

export type LimietRegel = { id: string; naam: string; pct: number | null; regel: string; toon: Toon };
type Venster = { procent: number; reset: string | null };
export type LimietAccount = { motor: string; label: string; status: string; sessie?: Venster; week?: Venster; limiet_bereikt?: boolean };
export type LimietStoel = { id: string; label: string; family: string | null; sessions_today: number; sessions_max: number; rate_limited: boolean; logged_in: boolean | null; seen: boolean };

function resetKort(reset: string | null | undefined, nu: number): string {
  const ms = reset ? Date.parse(reset) - nu : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const min = Math.round(ms / 60_000);
  if (min < 60) return ` · resets ${min}m`;
  const uur = Math.floor(min / 60);
  return uur < 48 ? ` · resets ${uur}h` : ` · resets ${Math.floor(uur / 24)}d`;
}

function toonVanPct(pct: number, vol = false): Toon {
  if (vol || pct >= 100) return 'fout';
  return pct >= 80 ? 'let-op' : 'ok';
}

/**
 * Wat elk AI-abonnement nog kan. Gemeten bij de aanbieder (Claude, Codex:
 * sessie- en weekprocent) gaat voor; families zonder meting (Cursor, Grok)
 * tonen de sessies van vandaag tegen het dagbudget uit Usage & Credits.
 * Niet ingelogde accounts zijn samen één regel, geen rij nullen.
 */
export function limietRegels(accounts: readonly LimietAccount[], stoelen: readonly LimietStoel[], nu = Date.now()): LimietRegel[] {
  const uit: LimietRegel[] = [];
  const gemeten = new Set<string>();
  const uitgelogd: string[] = [];
  for (const a of accounts) {
    const fam = a.motor.replace(/\d+$/, '');
    if (a.status === 'ok' && (a.sessie || a.week)) {
      gemeten.add(fam === 'codex' ? 'chatgpt' : fam);
      const s = a.sessie?.procent ?? null;
      const w = a.week?.procent ?? null;
      const pct = Math.round(Math.max(s ?? 0, w ?? 0));
      const naam = a.label.split(' · ')[0] || a.motor;
      const delen = [s != null ? `session ${Math.round(s)}%` : '', w != null ? `week ${Math.round(w)}%` : ''].filter(Boolean).join(' · ');
      const kritiek = s != null && w != null && w > s ? a.week : a.sessie ?? a.week;
      uit.push({ id: a.motor, naam, pct, regel: delen + resetKort(kritiek?.reset, nu), toon: toonVanPct(pct, a.limiet_bereikt) });
    } else if (a.status === 'not_logged_in' || a.status === 'expired') {
      uitgelogd.push(a.label.replace(/\s*\(not logged in\)\s*/i, ''));
    }
  }
  for (const s of stoelen) {
    const fam = (s.family ?? '').toLowerCase();
    if (!s.seen || gemeten.has(fam) || fam === 'vps' || s.sessions_max <= 0) continue;
    if (fam === 'claude' || fam === 'chatgpt') continue; // die meet de aanbieder al, of ze staan bij "not logged in"
    const pct = Math.round((s.sessions_today / s.sessions_max) * 100);
    uit.push({
      id: s.id, naam: s.label, pct: Math.min(100, pct),
      regel: s.rate_limited ? 'Rate limited' : `${s.sessions_today}/${s.sessions_max} sessions today`,
      toon: s.rate_limited ? 'fout' : s.logged_in === false ? 'uit' : 'ok',
    });
  }
  uit.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  if (uitgelogd.length) {
    uit.push({ id: 'uitgelogd', naam: `${uitgelogd.length} not logged in`, pct: null, regel: uitgelogd.join(', '), toon: 'uit' });
  }
  return uit;
}
