/**
 * Home v4 (Luka, 25 nov): de vier apps in één blik, de Fix-knoppen en de
 * feedregels in één zin. Puur: geen fetch, geen klok; de component geeft de
 * rijen en `nu` mee. Alleen echte data: waar niets gemeten is, staat dat er.
 */
import { perUur, type Toon } from '@/domain/homeCommandCenter';

/* ── Fix: wat één knop mag doen ────────────────────────────────────────── */

/**
 * Een Fix-knop doet nooit iets dat geld, een order, een deploy of een mail
 * raakt. Er zijn precies drie soorten:
 * - `open`: naar de pagina waar het probleem staat (en waar een herstart of
 *   run-now zelf om bevestiging vraagt);
 * - `opnieuw`: een mislukte taak opnieuw in de rij (POST /tasks/{id}/retry,
 *   maakt een queued kopie; geen send, geen order);
 * - `wacht`: iets wat Luka's OK nodig heeft gaat naar Waiting on you.
 */
export type FixActie =
  | { soort: 'open'; route: string; uitleg: string }
  | { soort: 'opnieuw'; taskId: string; uitleg: string }
  | { soort: 'wacht'; route: '/wacht'; uitleg: string };

/** Alleen bij let-op of fout een knop; bij ok, stil of uit niets. */
export function fixAlsNodig(toon: Toon, actie: FixActie | null): FixActie | null {
  return toon === 'let-op' || toon === 'fout' ? actie : null;
}

/* ── Apps health ───────────────────────────────────────────────────────── */

export type HomeAppId = 'axe_core' | 'axe_companion' | 'trading_os' | 'axon_memory' | 'northsea';

export type JobRun = { app: string | null; status: string; created_at: string };
/** Eén uurvak van één app, zoals core_job_runs_per_uur() het op de server telt. */
export type RunUur = { app: string | null; uur: string; ok: number; fout: number };
export type Schema = {
  id: string; name: string; app: string | null; enabled: boolean;
  last_status: string | null; last_run_at: string | null; consecutive_failures: number | null;
};
export type Dienst = { id: string; name: string; ok: boolean | null; detail?: string };
export type AppSessies = { id: string; sessions_today: number; sessions_min: number; sessions_max: number; stand: string };

export type AppGezond = {
  id: HomeAppId;
  naam: string;
  route: string;
  toon: Toon;
  /** Eén woord: Healthy / Warning / Failing / Down / No checks. */
  stand: string;
  kpi: string;
  /** Kort, past naast het getal. */
  kpiSub: string;
  /** De hele uitleg, voor de tooltip. */
  kpiUitleg: string;
  /** Laatste run of check, ms; null = nooit gemeten. */
  laatst: number | null;
  /** 24 uurvakken, oudste eerst; null = deze app schrijft geen runs. */
  runs: number[] | null;
  fouten: number[] | null;
  fix: FixActie | null;
  /** Mislukte schema's van deze app, meeste fouten op rij eerst. */
  kapot: Array<{ id: string; naam: string; keer: number }>;
};

const APPS: ReadonlyArray<{ id: HomeAppId; naam: string; route: string; dienst: RegExp | null }> = [
  /* v5: AXE Core zelf, zodat zijn mislukte schema's (Review Desk, Planner) niet
     alleen in de System-tegel en de ledger staan. */
  { id: 'axe_core', naam: 'AXE Core', route: '/cron-manager', dienst: /workers/i },
  { id: 'axe_companion', naam: 'AXE Companion', route: '/devices', dienst: /axe api/i },
  { id: 'trading_os', naam: 'Trading OS', route: '/trading', dienst: /trading|metaapi/i },
  { id: 'axon_memory', naam: 'AXON Memory', route: '/memory', dienst: /database|supabase/i },
  { id: 'northsea', naam: 'NorthSea Desk', route: '/northsea', dienst: /north\s?sea/i },
];

const FOUT = /^(fail|failed|error|timeout)$/i;

/* Een app heet niet overal hetzelfde: core_schedules eist 'trading_os' (CHECK),
   andere bronnen schrijven 'trading-os', 'tradingos' of 'Trading OS'. Alles
   naar één sleutel; geen app = AXE Core zelf. */
const ALIAS: Record<string, HomeAppId> = {
  axecore: 'axe_core', axe: 'axe_core', axecompanion: 'axe_companion', companion: 'axe_companion',
  tradingos: 'trading_os', trading: 'trading_os', axonmemory: 'axon_memory', axon: 'axon_memory',
  northsea: 'northsea', northseadesk: 'northsea',
};
export function appSleutel(app: string | null | undefined): string {
  if (app == null || !app.trim()) return 'axe_core';
  const plat = app.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALIAS[plat] ?? app.toLowerCase().trim();
}

function tijd(t: string | null | undefined): number | null {
  const ms = t ? Date.parse(t) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Terugval zolang de migratie niet is toegepast: ruwe rijen zelf per app en
 * uur tellen. Die rijen zijn door de REST-limiet hooguit 1.000; de component
 * zegt dat er dan bij.
 */
export function runsNaarUren(rijen: readonly JobRun[]): RunUur[] {
  const vakken = new Map<string, RunUur>();
  for (const r of rijen) {
    const ms = tijd(r.created_at);
    if (ms == null) continue;
    const uur = new Date(Math.floor(ms / 3600_000) * 3600_000).toISOString();
    const app = appSleutel(r.app);
    const k = `${app}|${uur}`;
    const v = vakken.get(k) ?? { app, uur, ok: 0, fout: 0 };
    if (FOUT.test(r.status)) v.fout += 1; else v.ok += 1;
    vakken.set(k, v);
  }
  return [...vakken.values()];
}

/**
 * 24 uurvakken (oudste eerst, het laatste is het lopende uur) voor één app, of
 * voor alle apps samen als `app` ontbreekt. Null zonder data.
 */
export function uurReeks(rijen: readonly RunUur[] | null, nu: number, app?: string, uren = 24): { ok: number[]; fout: number[] } | null {
  if (!rijen) return null;
  const ok = new Array<number>(uren).fill(0);
  const fout = new Array<number>(uren).fill(0);
  const uurMs = 3600_000;
  const eind = Math.floor(nu / uurMs) * uurMs + uurMs;
  for (const r of rijen) {
    if (app && appSleutel(r.app) !== appSleutel(app)) continue;
    const ms = tijd(r.uur);
    if (ms == null || ms >= eind || ms < eind - uren * uurMs) continue;
    const i = uren - 1 - Math.floor((eind - 1 - ms) / uurMs);
    ok[i] += r.ok; fout[i] += r.fout;
  }
  return { ok, fout };
}

const som = (r: readonly number[] | null | undefined) => (r ? r.reduce((a, b) => a + b, 0) : 0);

/**
 * Per app: status uit de VPS-dienst, de cron-schema's en de runs van 24 uur;
 * de KPI uit wat die app echt meet (sessies vandaag, herinneringen, runs).
 * Een mislukt schema of een dienst die down is geeft één Fix: de pagina
 * openen waar je het oplost. Home herstart of draait zelf niets.
 */
export function appsGezondheid(in_: {
  runs: readonly RunUur[] | null;
  schemas: readonly Schema[] | null;
  diensten: readonly Dienst[];
  sessies: readonly AppSessies[];
  geheugen24u?: readonly string[] | null;
  geheugenTotaal?: number | null;
  nu: number;
}): AppGezond[] {
  return APPS.map((app) => {
    const reeks = uurReeks(in_.runs, in_.nu, app.id);
    const schemas = (in_.schemas ?? []).filter((s) => appSleutel(s.app) === app.id && s.enabled);
    const dienst = app.dienst ? in_.diensten.find((d) => app.dienst!.test(d.name)) ?? null : null;
    const sessie = in_.sessies.find((s) => s.id.replace(/-/g, '_') === app.id) ?? null;

    const nFout = som(reeks?.fout);
    const nRuns = som(reeks?.ok) + nFout;
    const okUren = nRuns ? reeks!.ok : null;
    const foutUren = nRuns ? reeks!.fout : null;
    const kapot = schemas
      .filter((s) => FOUT.test(s.last_status ?? '') || (s.consecutive_failures ?? 0) > 0)
      .sort((a, b) => (b.consecutive_failures ?? 0) - (a.consecutive_failures ?? 0));

    /* Uit de uurtellers weten we alleen het uur; de schema's weten de minuut. */
    const laatsteUur = (in_.runs ?? []).filter((r) => appSleutel(r.app) === app.id && r.ok + r.fout > 0)
      .reduce<number | null>((m, r) => { const t = tijd(r.uur); return t != null && (m == null || t > m) ? t : m; }, null);
    const laatsteRun = laatsteUur == null ? null : Math.min(in_.nu, laatsteUur + 3599_000);
    const laatsteSchema = schemas.reduce<number | null>((m, s) => {
      const t = tijd(s.last_run_at);
      return t != null && (m == null || t > m) ? t : m;
    }, null);
    const laatst = [laatsteRun, laatsteSchema].filter((t): t is number => t != null && t > 0).sort((a, b) => b - a)[0] ?? null;

    let toon: Toon; let stand: string; let fix: FixActie | null = null;
    if (dienst && dienst.ok === false) {
      toon = 'fout'; stand = 'Down';
      fix = { soort: 'open', route: '/apps', uitleg: `${dienst.name} is down. Open Apps; a restart there asks you first.` };
    } else if (kapot.length) {
      toon = 'fout'; stand = 'Failing';
      fix = {
        soort: 'open', route: `/cron-manager?open=${encodeURIComponent(kapot[0].id)}`,
        uitleg: `${schemaRegel(kapot)} failing. Open ${kortNaam(kapot[0].name)} in Cron Manager.`,
      };
    } else if (nFout) {
      toon = 'let-op'; stand = 'Warning';
      fix = { soort: 'open', route: '/ledger', uitleg: `${nFout} failed ${nFout === 1 ? 'run' : 'runs'} in 24h. Open the ledger.` };
    } else if (dienst?.ok || nRuns || schemas.length || sessie || (app.id === 'axon_memory' && in_.geheugenTotaal != null)) {
      toon = 'ok'; stand = 'Healthy';
    } else {
      toon = 'stil'; stand = 'No checks';
    }

    let kpi = '–'; let kpiSub = ''; let kpiUitleg = 'Nothing measured yet for this app.';
    if (app.id === 'axon_memory' && in_.geheugenTotaal != null) {
      const erbij = in_.geheugen24u?.length ?? null;
      kpi = in_.geheugenTotaal.toLocaleString('en-GB');
      kpiSub = erbij == null ? 'memories' : `+${erbij} 24h`;
      kpiUitleg = erbij == null ? 'memories stored' : `memories stored · ${erbij} added in the last 24h`;
    } else if (nRuns) {
      kpi = nRuns.toLocaleString('en-GB');
      kpiSub = kapot.length ? `${schemaRegel(kapot)} failing` : nFout ? `runs · ${nFout} failed` : 'runs';
      kpiUitleg = `cron runs in the last 24h · ${nFout} failed${kapot.length ? ` · failing: ${schemaRegel(kapot)}` : ''}`;
    } else if (sessie) {
      kpi = String(sessie.sessions_today);
      kpiSub = 'sessions';
      kpiUitleg = `AI sessions today · budget ${sessie.sessions_min}–${sessie.sessions_max} a day`;
    } else if (dienst) {
      kpi = dienst.ok == null ? '?' : dienst.ok ? 'up' : 'down';
      kpiSub = dienst.name;
      kpiUitleg = `${dienst.name} on the VPS`;
    }

    const geheugenUren = app.id === 'axon_memory' && in_.geheugen24u ? perUur(in_.geheugen24u, in_.nu) : null;
    return {
      id: app.id, naam: app.naam, route: app.route, toon, stand, kpi, kpiSub, kpiUitleg, laatst,
      runs: okUren ?? geheugenUren, fouten: foutUren, fix,
      kapot: kapot.map((s) => ({ id: s.id, naam: kortNaam(s.name), keer: s.consecutive_failures ?? 0 })),
    };
  });
}

/** 'Review Desk: bronnen lezen (Gmail, …)' → 'Review Desk'. */
function kortNaam(naam: string): string {
  return naam.split(':')[0].trim() || naam;
}

/** 'Review Desk ×15, Planner ×4' */
function schemaRegel(kapot: readonly Schema[]): string {
  return kapot.map((s) => `${kortNaam(s.name)}${(s.consecutive_failures ?? 0) > 1 ? ` ×${s.consecutive_failures}` : ''}`).join(', ');
}

/* ── Feed: ruwe JSON wordt één zin ─────────────────────────────────────── */

const VOORKEUR = ['status', 'state', 'signal', 'symbol', 'action', 'price', 'change', 'pct', 'message', 'reason', 'result', 'title', 'name', 'count', 'error'];

function waardeTekst(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? (s.length > 40 ? `${s.slice(0, 39)}…` : s) : null;
  }
  return null;
}

function paren(obj: Record<string, unknown>): Array<[string, string]> {
  const sleutels = Object.keys(obj).sort((a, b) => {
    const ia = VOORKEUR.indexOf(a.toLowerCase()); const ib = VOORKEUR.indexOf(b.toLowerCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const uit: Array<[string, string]> = [];
  for (const k of sleutels) {
    const w = waardeTekst(obj[k]);
    if (w != null) uit.push([k.replace(/[_-]+/g, ' ').toLowerCase(), w]);
    if (uit.length === 3) break;
  }
  return uit;
}

/**
 * 'DAX watch {"signal":"long","price":18234.5,...}' → 'DAX watch · signal long · price 18234.5'.
 * Gewone tekst blijft gewone tekst; afgekapte JSON wordt zo goed mogelijk
 * gelezen, en anders weggelaten in plaats van als accolades getoond.
 */
export function eenRegel(tekst: string | null | undefined): string {
  const s = (tekst ?? '').replace(/\s+/g, ' ').trim();
  const i = s.search(/[{[]/);
  if (i < 0) return s;
  const kop = s.slice(0, i).replace(/[:\-–·\s]+$/, '').trim();
  const rest = s.slice(i);
  let delen: Array<[string, string]> = [];
  try {
    const v: unknown = JSON.parse(rest);
    if (Array.isArray(v)) delen = [['items', String(v.length)]];
    else if (v && typeof v === 'object') delen = paren(v as Record<string, unknown>);
  } catch {
    const los: Record<string, unknown> = {};
    for (const m of rest.matchAll(/"([\w-]+)"\s*:\s*("([^"]*)"|-?\d+(?:\.\d+)?|true|false)/g)) {
      los[m[1]] = m[3] ?? (m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2]));
    }
    delen = paren(los);
  }
  const zin = delen.map(([k, w]) => `${k} ${w}`).join(' · ');
  return [kop, zin].filter(Boolean).join(' · ') || 'Event (no readable details)';
}
