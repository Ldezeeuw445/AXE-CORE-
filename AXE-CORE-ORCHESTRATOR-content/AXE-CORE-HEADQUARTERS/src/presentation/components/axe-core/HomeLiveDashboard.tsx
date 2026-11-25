import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Search, Sparkles } from 'lucide-react';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { homeLiveStand, type LiveTaak } from '@/domain/homeLive';
import { taakActieLabel, taakFoutVan, type TaakActie } from '@/domain/taken/taakFout';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import {
  abonnementVerbruik, calendarJobs, codingSeatsHeartbeat, fixDurableTask, keysOverview, ledgerOverview, lockscreenSnapshot, retryDurableTask,
  usageCreditsSnapshot, type LedgerEntry, type LedgerTotal, type LockscreenSnapshot,
} from '@/infrastructure/gateways/axeCoreApiService';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { groepeerAbonnementen, stoelSleutel, type CodingSeat } from '@/domain/codingSeats';
import { haalWachtOpJou } from '@/application/approvals/wachtOpJou';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { laadDevices } from '@/infrastructure/gateways/axeDeviceService';
import { isOnline, type AxeDevice } from '@/domain/axeDevices';
import { useDashModus } from '@/presentation/components/layout/useDashModus';
import { DashKaart, DashLeeg } from '@/presentation/components/layout/dashboardSchil';
import { useNotifications } from '@/presentation/contexts/NotificationContext';
import { useCoreStatusStore } from '@/presentation/store/coreStatusStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { VOICE_STATUS_LABEL } from '@/presentation/store/voiceStatusLabel';
import { useUIStore } from '@/presentation/store/uiStore';
import { railRijen } from '@/domain/tierRouter/agentVenster';
import { serverStand } from '@/domain/agents/serverStatus';
import { STAND } from '@/presentation/components/axe-core/managerStand';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { appVanRegel } from '@/domain/grootboek';
import { appMeta } from '@/domain/apps';
import { listTrades } from '@/infrastructure/persistence/tradingTradesService';
import {
  feedRegels, geledenTekst, kiesMachines, limietRegels, llmTelling, perUur, pnlLijn, providerTegels, recenteToestellen, ringToon, ringWaarde,
  tijdlijnVandaag, type FeedRegel, type Machine, type ProviderSleutel, type TijdJob, type Toon,
} from '@/domain/homeCommandCenter';
import {
  appsGezondheid, eenRegel, fixAlsNodig, type AppGezond, type FixActie, type JobRun, type Schema,
} from '@/domain/homeAppsHealth';
import './homeLive.css';
import './homeCommandCenter.css';

/** Wat Home over de core en de bouw weet; Home rekent het uit, het dashboard toont het. */
export type HomeKern = { label: string; kleur: string };
export type HomeBouw = { commit: string | null; regel: string; oud: boolean };

/* ── Kleine bouwstenen ─────────────────────────────────────────────────── */

function Stip({ toon }: { toon: Toon }) {
  return <i className="axe-hcc-stip" data-toon={toon} aria-hidden="true" />;
}

function Actie({ actie, taskId }: { actie?: TaakActie; taskId?: string }) {
  const nav = useNavigate();
  const [fout, setFout] = useState<string | null>(null);
  if (!actie) return null;
  if (fout) return <span className="axe-home-live-actie" style={{ color: 'var(--err)' }}>{fout}</span>;
  return (
    <button
      type="button"
      className="axe-home-live-actie"
      onClick={(e) => {
        e.stopPropagation();
        if (actie === 'reconnect') nav('/settings');
        else if (actie === 'open') nav('/tasks');
        else if (actie === 'fix' && taskId) {
          void fixDurableTask(taskId).then(verversServerAgents).catch((err) => {
            setFout(`Could not start a lint repair: ${err instanceof Error ? err.message : String(err)}`);
          });
        } else if (actie === 'retry' && taskId) void retryDurableTask(taskId).then(verversServerAgents);
        else nav('/tasks');
      }}
    >
      {taakActieLabel(actie)}
    </button>
  );
}

function recentActie(t: LiveTaak): TaakActie | undefined {
  if (t.stand !== 'failed') return undefined;
  return taakFoutVan(t.fout || t.titel, t.titel).actie;
}

/**
 * Eén Fix-knop: opent de pagina, zet een mislukte taak opnieuw in de rij, of
 * stuurt naar Waiting on you. Nooit een order, betaling, deploy of mail.
 */
function FixKnop({ actie }: { actie: FixActie | null }) {
  const nav = useNavigate();
  const [stand, setStand] = useState<'klaar' | 'bezig' | 'gedaan' | 'fout'>('klaar');
  if (!actie) return null;
  const label = stand === 'bezig' ? '…' : stand === 'gedaan' ? 'Queued' : stand === 'fout' ? 'Failed' : actie.soort === 'wacht' ? 'Review' : 'Fix';
  return (
    <span
      role="button"
      tabIndex={0}
      className="axe-hcc-fix"
      data-axe-hcc-fix={actie.soort}
      data-stand={stand}
      title={actie.uitleg}
      onClick={(e) => {
        e.stopPropagation();
        if (actie.soort === 'opnieuw') {
          if (stand !== 'klaar') return;
          setStand('bezig');
          void retryDurableTask(actie.taskId).then(
            () => { setStand('gedaan'); verversServerAgents(); },
            () => setStand('fout'),
          );
        } else nav(actie.route);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
    >
      {label}
    </span>
  );
}

/** Kaarttitel die naar de detailpagina gaat. */
function Kop({ tekst, onKlik }: { tekst: string; onKlik: () => void }) {
  return <button type="button" className="axe-hcc-koplink" onClick={onKlik}>{tekst}</button>;
}

/** Mini-grafiek van tonen: één segment per provider, groen tot rood. */
function TonenBalk({ tonen }: { tonen: readonly Toon[] }) {
  if (!tonen.length) return null;
  return (
    <span className="axe-hcc-tonen" aria-hidden="true">
      {tonen.map((t, i) => <i key={i} data-toon={t} />)}
    </span>
  );
}

/**
 * Eén compacte kerntegel: stip, label, waarde; eronder een sparkline of
 * mini-grafiek, en alleen bij let-op of fout één Fix-knop.
 */
function KernTegel({ label, waarde, regel, toon, spark, sparkToon, grafiek, fix, onKlik }: {
  label: string; waarde: ReactNode; regel: string; toon: Toon; spark?: readonly number[] | null; sparkToon?: Toon;
  grafiek?: ReactNode; fix?: FixActie | null; onKlik: () => void;
}) {
  const knop = fixAlsNodig(toon, fix ?? null);
  return (
    <button type="button" className="axe-hcc-kernrij" data-axe-hcc-kern={label} data-toon={toon} title={regel} onClick={onKlik}>
      <span className="axe-hcc-kernrij-kop">
        <Stip toon={toon} />
        <span className="axe-hcc-kernrij-label">{label}</span>
        <span className="axe-hcc-kernrij-waarde">{waarde}</span>
      </span>
      <span className="axe-hcc-kernrij-onder">
        {grafiek ?? (spark && spark.length > 1
          ? <Spark waarden={spark} toon={sparkToon ?? (toon === 'uit' || toon === 'stil' ? 'ok' : toon)} />
          : <span className="axe-hcc-kernrij-regel">{regel}</span>)}
        <FixKnop actie={knop} />
      </span>
    </button>
  );
}

/** Eén app in Apps health: stand, KPI, runs en fouten per uur, laatste check, Fix. */
function AppRij({ app, nu, onKlik }: { app: AppGezond; nu: number; onKlik: () => void }) {
  const fouten = app.fouten?.some((n) => n > 0) ? app.fouten : null;
  return (
    <button type="button" className="axe-hcc-app" data-axe-hcc-app={app.id} data-toon={app.toon} onClick={onKlik}>
      <span className="axe-hcc-app-naam">
        <Stip toon={app.toon} />
        <span className="axe-hcc-app-naamtekst"><b>{app.naam}</b><small className="axe-hcc-app-stand">{app.stand}</small></span>
      </span>
      <span className="axe-hcc-app-kpi" title={app.kpiUitleg}>
        <b>{app.kpi}</b><small>{app.kpiSub}</small>
      </span>
      <span className="axe-hcc-app-grafiek" title={app.runs ? 'per hour, last 24h' : 'this app writes no runs'}>
        {app.runs && app.runs.some((n) => n > 0)
          ? <Spark waarden={app.runs} toon="ok" />
          : <span className="axe-hcc-app-geen">no runs 24h</span>}
        {fouten && <Spark waarden={fouten} toon="fout" />}
      </span>
      <span className="axe-hcc-app-tijd">{app.laatst ? geledenTekst(app.laatst, nu) : '–'}</span>
      <span className="axe-hcc-app-fix"><FixKnop actie={app.fix} /></span>
    </button>
  );
}

/** Ring van 0–100. Null = niet gemeten: lege ring met een streepje, nooit een verzonnen getal. */
function Ring({ pct, label }: { pct: number | null; label: string }) {
  const r = 22;
  const omtrek = 2 * Math.PI * r;
  const toon = ringToon(pct);
  return (
    <div className="axe-hcc-ring" data-toon={toon}>
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={r} className="axe-hcc-ring-baan" />
        {pct != null && (
          <circle cx="28" cy="28" r={r} className="axe-hcc-ring-boog"
            strokeDasharray={`${(pct / 100) * omtrek} ${omtrek}`} transform="rotate(-90 28 28)" />
        )}
      </svg>
      <span className="axe-hcc-ring-getal">{pct == null ? '–' : `${pct}%`}</span>
      <span className="axe-hcc-ring-label">{label}</span>
    </div>
  );
}

/** Sparkline van een rij getallen; een vlakke nul-lijn als alles nul is, niets als er geen data is. */
function Spark({ waarden, toon = 'ok' }: { waarden: readonly number[]; toon?: Toon }) {
  if (waarden.length < 2) return null;
  const w = 84; const h = 22;
  const min = Math.min(...waarden); const max = Math.max(...waarden);
  const span = max - min || 1;
  const pad = waarden.map((v, i) => `${i ? 'L' : 'M'}${((i / (waarden.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg className="axe-hcc-spark" data-toon={toon} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${pad} L${w},${h} L0,${h} Z`} className="axe-hcc-spark-vlak" />
      <path d={pad} className="axe-hcc-spark-lijn" />
    </svg>
  );
}

/** Eén KPI: label, getal, één regel, en waar dat kan een sparkline. Klik = de tab erachter. */
function Kpi({ label, waarde, regel, toon, spark, onKlik }: {
  label: string; waarde: ReactNode; regel: string; toon: Toon; spark?: readonly number[]; onKlik: () => void;
}) {
  return (
    <button type="button" className="axe-hcc-kpi" data-axe-hcc-kpi={label} onClick={onKlik}>
      <span className="axe-hcc-kpi-kop"><Stip toon={toon} /><span className="axe-hcc-kpi-label">{label}</span></span>
      <span className="axe-hcc-kpi-rij">
        <span className="axe-hcc-kpi-waarde">{waarde}</span>
        {spark && <Spark waarden={spark} toon={toon === 'uit' ? 'ok' : toon} />}
      </span>
      <span className="axe-hcc-kpi-regel">{regel}</span>
    </button>
  );
}

/* ── Data ──────────────────────────────────────────────────────────────── */

/** Herhaal een fetch op een vaste tik; pauzeert als het venster verborgen is. */
function usePoll<T>(laad: () => Promise<T>, ms: number): { data: T | null; fout: string | null } {
  const [stand, setStand] = useState<{ data: T | null; fout: string | null }>({ data: null, fout: null });
  useEffect(() => {
    let levend = true;
    const ronde = () => {
      if (document.hidden) return;
      laad().then(
        (data) => { if (levend) setStand({ data, fout: null }); },
        (e) => { if (levend) setStand((s) => ({ data: s.data, fout: e instanceof Error ? e.message : String(e) })); },
      );
    };
    const eerste = setTimeout(ronde, 0);
    const t = window.setInterval(ronde, ms);
    return () => { levend = false; clearTimeout(eerste); window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- laad is per mount vast
  }, [ms]);
  return stand;
}

async function telGeheugen(): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const r = await sb.from('core_memory').select('id', { count: 'exact', head: true });
  return r.error ? null : r.count ?? null;
}

async function telVandaag(): Promise<{ klaar: number | null; mislukt: number | null }> {
  const sb = getSupabase();
  if (!sb) return { klaar: null, mislukt: null };
  const middernacht = new Date();
  middernacht.setHours(0, 0, 0, 0);
  const sinds = middernacht.toISOString();
  const [k, m] = await Promise.all([
    sb.from('core_tasks').select('id', { count: 'exact', head: true }).in('status', ['done', 'completed']).gte('updated_at', sinds),
    sb.from('core_tasks').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('updated_at', sinds),
  ]);
  return { klaar: k.count ?? null, mislukt: m.count ?? null };
}

async function laadStoelen(): Promise<CodingSeat[]> {
  const r = await codingSeatsHeartbeat();
  const rijen: CodingSeat[] = (r.seats ?? []).map((s) => {
    const sid = stoelSleutel(s);
    return {
      id: sid, seat_id: sid,
      provider: (s.provider as CodingSeat['provider']) || 'claude',
      label: s.label || sid,
      email: s.logged_in === true ? s.email : null,
      machine: s.machine || s.host || '',
      logged_in: s.logged_in, login_command: s.login_command, current_task: s.current_task,
      rate_limited: s.rate_limited, rate_limit_until: s.rate_limit_until, last_limit_message: s.last_limit_message,
      remaining_note: s.remaining_note, shared_quota_with: s.shared_quota_with ?? [],
      last_seen_at: s.last_seen_at, config_exists: s.config_exists,
    };
  });
  return groepeerAbonnementen(rijen).kaarten.map((g) => g.stoel);
}

async function laadVandaagTijdlijn() {
  const nu = new Date();
  const eind = new Date(nu);
  eind.setHours(23, 59, 59, 999);
  const r = await calendarJobs(nu, eind);
  return (r.items ?? []).map((i): TijdJob => ({
    key: i.key, at: i.at, naam: i.naam, aantal: i.aantal, herhaling: i.herhaling, kleur: appMeta(appVanRegel(i.app)).kleur,
  }));
}

/** Alle sleutelrijen met een provider, over alle apps heen; Home leest alleen status en laatste HTTP-code. */
async function laadProviderSleutels(): Promise<ProviderSleutel[]> {
  const r = await keysOverview();
  return (r.apps ?? []).flatMap((a) => a.keys.map((k) => ({
    provider: k.provider ?? null, status: k.status, usage: k.usage ? { last_status: k.usage.last_status } : null,
  })));
}

/** Cron-runs van de laatste 24 uur (core_job_runs): app, status en tijd. */
async function laadRuns24u(): Promise<JobRun[]> {
  const sb = getSupabase();
  if (!sb) throw new Error('no database connection');
  const sinds = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await sb.from('core_job_runs').select('app, status, created_at').gte('created_at', sinds).limit(6000);
  if (error) throw error;
  return (data ?? []) as JobRun[];
}

/** Alle cron-schema's (core_schedules): alleen wat Apps health nodig heeft. */
async function laadSchemas(): Promise<Schema[]> {
  const sb = getSupabase();
  if (!sb) throw new Error('no database connection');
  const { data, error } = await sb.from('core_schedules')
    .select('id, name, app, enabled, last_status, last_run_at, consecutive_failures').limit(500);
  if (error) throw error;
  return (data ?? []) as Schema[];
}

/** Herinneringen van de laatste 24 uur, alleen de tijd, voor het grafiekje. */
async function laadGeheugen24u(): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) throw new Error('no database connection');
  const sinds = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await sb.from('core_memory').select('created_at').gte('created_at', sinds).limit(2000);
  if (error) throw error;
  return ((data ?? []) as Array<{ created_at: string }>).map((r) => r.created_at);
}

/** Taken van de laatste 24 uur: alleen status en tijd, voor de grafiekjes. */
async function laadTaken24u(): Promise<Array<{ status: string; updated_at: string }>> {
  const sb = getSupabase();
  if (!sb) throw new Error('no database connection');
  const sinds = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await sb.from('core_tasks').select('status, updated_at').gte('updated_at', sinds).limit(5000);
  if (error) throw error;
  return (data ?? []) as Array<{ status: string; updated_at: string }>;
}

function useKlok(): Date {
  const [nu, setNu] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNu(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return nu;
}

/* ── Het dashboard ─────────────────────────────────────────────────────── */

/**
 * Home als command center (Luka, 25 nov: "echt als dat dashboard wat ik
 * stuurde, dat je alles goed en netjes kan zien"). Eén scherm, geen scroll.
 * v4 (t70u): kopstrook met snelle commando's · links compacte kerntegels met
 * sparkline en Fix, en een dicht dienstenraster · midden de core · rechts een
 * lage feed, wat op jou wacht en de providers · onderaan Apps health breed,
 * dan agents, vandaag, limieten en de monitor. Elke kaarttitel opent de tab.
 * Alleen echte data; waar niets gemeten is staat dat er eerlijk.
 */
export function HomeLiveDashboard({ kern, bouw }: { kern?: HomeKern; bouw?: HomeBouw } = {}) {
  useDashModus('home');
  const navigate = useNavigate();
  const nu = useKlok();
  const server = useServerAgents();
  const jobs = useAxeJobStore((s) => s.jobs);
  const voiceStatus = useVoiceStore((s) => s.voiceStatus);
  const providers = useCoreStatusStore((s) => s.status?.providers ?? null);
  const coreProvider = useCoreStatusStore((s) => s.status?.provider ?? null);
  const setPalette = useUIStore((s) => s.setCommandPaletteOpen);
  const { notifications, unreadCount } = useNotifications();

  const stoelen = usePoll(laadStoelen, 30_000).data ?? [];
  const elders = usePoll(() => haalWachtOpJou().then((r) => r.items.filter((i) => i.bron !== 'axe').length), 60_000).data ?? 0;
  const geheugen = usePoll(telGeheugen, 300_000);
  const vandaag = usePoll(telVandaag, 120_000).data;
  const devices = usePoll(laadDevices, 60_000);
  const snapshot = usePoll<LockscreenSnapshot>(lockscreenSnapshot, 60_000);
  const fouten = usePoll<{ entries: LedgerEntry[]; totals: LedgerTotal[] }>(() => ledgerOverview({ hours: 24, failsOnly: true, limit: 20 }), 120_000);
  const taken24 = usePoll(laadTaken24u, 300_000);
  const verbruik = usePoll(() => abonnementVerbruik(), 300_000);
  const credits = usePoll(usageCreditsSnapshot, 300_000);
  const trades = usePoll(() => listTrades({ status: 'closed', limit: 200 }), 600_000);
  const tijdlijn = usePoll(laadVandaagTijdlijn, 300_000);
  const sleutels = usePoll(laadProviderSleutels, 300_000);
  const runs24 = usePoll(laadRuns24u, 300_000);
  const schemas = usePoll(laadSchemas, 300_000);
  const geheugen24 = usePoll(laadGeheugen24u, 600_000);

  const stand = homeLiveStand({
    agents: server.agents,
    jobs,
    extraGoedkeuringen: server.approvals.map((a) => ({
      id: a.id, task_id: a.task_id, wat: a.wat, waarom: a.waarom, title: a.title, detail: a.detail,
    })),
    stoelen,
  });
  const okTal = stand.goedkeuringen.length + elders;

  /* Kopstrook */
  const datum = nu.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const klok = nu.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const kernToon: Toon = kern?.kleur === 'var(--error)' ? 'fout' : kern?.label === 'Online' ? 'ok' : kern ? 'let-op' : 'uit';

  /* Core overview: de providers eerst, want de LLMs-tegel telt ze */
  const provTegels = providerTegels(providers, sleutels.data ?? []);
  const llm = llmTelling(provTegels);
  const stemLabel = voiceStatus === 'idle' ? 'Ready' : VOICE_STATUS_LABEL[voiceStatus];

  /* Diensten en toestellen */
  const toestellen: AxeDevice[] = recenteToestellen(devices.data?.devices ?? [], nu.getTime());
  const diensten = snapshot.data?.services ?? [];
  const stoelenKlaar = stoelen.filter((s) => s.logged_in === true && !s.rate_limited).length;

  /* Feed: vaste, lage kaart; elke regel één zin, ruwe JSON wordt leesbaar */
  const feed: FeedRegel[] = feedRegels({
    meldingen: notifications.map((n) => ({ id: n.id, type: n.type, title: n.title, detail: n.detail, timestamp: n.timestamp, read: n.read })),
    fouten: fouten.data?.entries ?? [],
    recent: stand.recent,
  }, 5).map((r) => ({ ...r, titel: eenRegel(r.titel), sub: eenRegel(r.sub) }));
  const recentOp = new Map(stand.recent.map((t) => [`taak:${t.id}`, t]));

  /* Agents: zes tegels, wie werkt of wacht eerst */
  const rijen = railRijen(jobs, nu.getTime());
  const gewicht = (r: (typeof rijen)[number]) => (r.job?.state === 'waiting' ? 0 : r.job ? 1 : 2);
  const agentTegels = [...rijen].sort((a, b) => gewicht(a) - gewicht(b)).slice(0, 6);

  /* KPI's en grafiekjes: alleen wat echt gemeten is */
  const taken = taken24.data;
  const klaarUren = taken ? perUur(taken.filter((t) => t.status === 'done' || t.status === 'completed').map((t) => t.updated_at), nu.getTime()) : null;
  const foutUren = taken ? perUur(taken.filter((t) => t.status === 'failed').map((t) => t.updated_at), nu.getTime()) : null;
  const som = (r: number[] | null) => (r ? r.reduce((a, b) => a + b, 0) : null);
  const ledgerFout = fouten.data ? fouten.data.totals.filter((t) => /fail|error/i.test(t.status)).reduce((n, t) => n + t.n, 0) : null;
  const limieten = verbruik.data || credits.data
    ? limietRegels(verbruik.data?.accounts ?? [], credits.data?.seats ?? [], nu.getTime()) : [];
  const krapst = limieten.find((l) => l.pct != null) ?? null;
  const pnl = trades.data ? pnlLijn(trades.data) : null;
  const geld = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

  /* Systeemmonitor en providers */
  const machines: Machine[] = kiesMachines(snapshot.data?.systems);
  const dag = tijdlijnVandaag(tijdlijn.data ?? [], nu, 4);
  const tijdItems = dag.eenmalig;

  /* Kerntegels: grafiekjes uit de cron-runs, herinneringen en taken */
  const runs = runs24.data;
  const runUren = runs ? perUur(runs.map((r) => r.created_at), nu.getTime()) : null;
  const runFoutUren = runs ? perUur(runs.filter((r) => /^(fail|failed|error|timeout)$/i.test(r.status)).map((r) => r.created_at), nu.getTime()) : null;
  const runFouten = som(runFoutUren) ?? 0;
  const geheugenUren = geheugen24.data ? perUur(geheugen24.data, nu.getTime()) : null;
  const laatsteFout = stand.recent.find((t) => t.stand === 'failed' && t.taskId && recentActie(t) === 'retry');
  const agentToon: Toon = stand.goedkeuringen.length ? 'let-op' : laatsteFout ? 'let-op' : stand.werkend ? 'ok' : 'uit';
  const agentFix: FixActie | null = stand.goedkeuringen.length
    ? { soort: 'wacht', route: '/wacht', uitleg: `${stand.goedkeuringen.length} waiting for your OK. Open Waiting on you.` }
    : laatsteFout?.taskId ? { soort: 'opnieuw', taskId: laatsteFout.taskId, uitleg: `Retry “${laatsteFout.titel}” (queues a copy; no send, no order).` } : null;
  const systeemToon: Toon = !runs && !vandaag ? 'uit' : runFouten || vandaag?.mislukt ? 'let-op' : 'ok';
  const llmToon: Toon = !llm ? 'uit' : !llm.verbonden ? 'fout' : provTegels.some((p) => p.toon === 'fout') ? 'let-op' : 'ok';

  /* Apps health: de vier apps */
  const apps = appsGezondheid({
    runs: runs24.data, schemas: schemas.data, diensten, sessies: credits.data?.apps ?? [],
    geheugen24u: geheugen24.data, geheugenTotaal: geheugen.data, nu: nu.getTime(),
  });
  const appsMis = apps.filter((a) => a.toon === 'fout' || a.toon === 'let-op').length;

  return (
    <div className="axe-hcc" data-axe-hcc>
      {/* ── Kopstrook ── */}
      <header className="axe-hcc-strip" data-axe-hcc-strip>
        <div className="axe-hcc-strip-klok">
          <b className="font-mono-data">{klok}</b>
          <span>{datum}</span>
        </div>
        <button type="button" className="axe-hcc-strip-pil" onClick={() => navigate('/status')} data-axe-home-kpi="Core">
          <Stip toon={kernToon} />
          <span>System</span>
          <b>{kern?.label ?? 'Checking'}</b>
        </button>
        <button type="button" className="axe-hcc-strip-pil" onClick={() => navigate('/status')} data-axe-home-kpi="Build">
          <Stip toon={bouw?.oud ? 'let-op' : bouw?.commit ? 'ok' : 'uit'} />
          <span>Build</span>
          <b className="font-mono-data">{bouw?.commit ? bouw.commit.slice(0, 8) : '–'}</b>
        </button>
        <button type="button" className="axe-hcc-strip-pil" onClick={() => navigate('/wacht')} data-axe-home-kpi="Waiting">
          <Stip toon={okTal ? 'let-op' : 'ok'} />
          <span>Needs you</span>
          <b>{okTal}</b>
        </button>
        <nav className="axe-hcc-strip-snel" aria-label="Quick commands" data-axe-hcc-snel>
          {([
            ['New task', '/tasks'], ['Ledger', '/ledger'], ['Cron', '/cron-manager'],
            ['Trading', '/trading'], ['Devices', '/devices'], ['Memory', '/memory'],
          ] as const).map(([label, pad]) => (
            <button key={pad} type="button" className="axe-hcc-snelknop" onClick={() => navigate(pad)}>{label}</button>
          ))}
        </nav>
        <span className="axe-hcc-strip-vul" />
        <button type="button" className="axe-hcc-strip-zoek" onClick={() => setPalette(true)} aria-label="Search">
          <Search size={14} />
          <span>Search or jump to…</span>
          <kbd>⌘K</kbd>
        </button>
        <button type="button" className="axe-hcc-strip-knop" onClick={() => navigate('/notifications')} aria-label="Notifications">
          <Bell size={15} />
          {unreadCount > 0 && <span className="axe-hcc-strip-tal">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
        <button type="button" className="axe-hcc-strip-brief" onClick={() => navigate('/brief')}>
          <Sparkles size={14} /> Executive briefing
        </button>
      </header>

      {/* ── KPI's: zes getallen die je in één blik leest, boven de core ── */}
      <div className="axe-hcc-kpis" data-axe-hcc-kpis>
        <Kpi label="Tasks · 24h" waarde={som(klaarUren) ?? '–'} toon={klaarUren ? 'ok' : 'uit'} spark={klaarUren ?? undefined}
          regel={klaarUren ? 'done, per hour' : taken24.fout ? 'Tasks did not answer' : 'Counting…'} onKlik={() => navigate('/tasks')} />
        <Kpi label="Failures · 24h" waarde={som(foutUren) ?? '–'} toon={!foutUren ? 'uit' : som(foutUren) ? 'fout' : 'ok'} spark={foutUren ?? undefined}
          regel={ledgerFout == null ? 'failed tasks, per hour' : `tasks · ${ledgerFout} failed runs in the ledger`} onKlik={() => navigate('/ledger')} />
        <Kpi label="AI sessions today" waarde={credits.data?.spread.paid_today ?? '–'}
          toon={!credits.data ? 'uit' : credits.data.spread.even ? 'ok' : 'let-op'}
          regel={!credits.data ? (credits.fout ? 'Usage did not answer' : 'Loading usage…') : credits.data.spread.even ? 'paid seats, spread evenly' : 'paid seats, spread unevenly'}
          onKlik={() => navigate('/settings')} />
        <Kpi label="App budgets" waarde={credits.data ? `${credits.data.apps_met}/${credits.data.apps_total}` : '–'}
          toon={!credits.data ? 'uit' : credits.data.apps.some((a) => a.stand === 'over') ? 'let-op' : 'ok'}
          regel={credits.data ? `on budget · ${credits.data.apps.filter((a) => a.stand === 'over').length} over, ${credits.data.apps.filter((a) => a.stand === 'under').length} under` : 'No budget data yet'}
          onKlik={() => navigate('/settings')} />
        <Kpi label="Tightest AI limit" waarde={krapst ? `${krapst.pct}%` : '–'} toon={krapst ? krapst.toon : 'uit'}
          regel={krapst ? `${krapst.naam} · ${krapst.regel}` : verbruik.fout ? 'Limits did not answer' : 'No limit measured yet'} onKlik={() => navigate('/settings')} />
        <Kpi label="Trading P&L" waarde={pnl && pnl.length ? geld(pnl[pnl.length - 1]) : '–'}
          toon={!pnl || !pnl.length ? 'uit' : pnl[pnl.length - 1] >= 0 ? 'ok' : 'fout'} spark={pnl && pnl.length > 1 ? pnl : undefined}
          regel={!pnl ? 'Loading trades…' : pnl.length ? `closed trades (${pnl.length}), cumulative` : 'No closed trades yet, so no curve'}
          onKlik={() => navigate('/trading')} />
      </div>

      {/* ── Links: compacte kerntegels en een dichte dienstenraster ── */}
      <div className="axe-hcc-links">
        <DashKaart titel={<Kop tekst="Core overview" onKlik={() => navigate('/status')} />} className="axe-hcc-kaart axe-hcc-kaart--kern" vrij>
          <div className="axe-hcc-kernlijst" data-axe-hcc-kernlijst>
            <KernTegel label="AI core" waarde={kern?.label ?? '–'} toon={kernToon} spark={runUren}
              regel={`${coreProvider ? `Answering via ${coreProvider}` : 'No provider reported yet'} · cron runs per hour`}
              fix={{ soort: 'open', route: '/status', uitleg: 'Open Status to see what the core reports.' }} onKlik={() => navigate('/status')} />
            <KernTegel label="Memory" waarde={geheugen.data != null ? geheugen.data.toLocaleString('en-GB') : '–'} toon={geheugen.data != null ? 'ok' : geheugen.fout ? 'let-op' : 'uit'}
              spark={geheugenUren} regel={geheugen.data != null ? `memories · +${som(geheugenUren) ?? 0} in 24h` : 'Count not available'}
              fix={{ soort: 'open', route: '/memory', uitleg: 'Open Memory.' }} onKlik={() => navigate('/memory')} />
            <KernTegel label="Voice" waarde={stemLabel} toon={voiceStatus === 'idle' ? 'ok' : 'let-op'}
              regel={voiceStatus === 'idle' ? 'Say "Hey AXE" or tap the mic' : 'Voice session active'} onKlik={() => navigate('/settings')} />
            <KernTegel label="Agents" waarde={stand.werkend} toon={agentToon} spark={klaarUren}
              regel={stand.namen.length ? `running: ${stand.namen.slice(0, 3).join(', ')}` : 'None running · tasks done per hour'}
              fix={agentFix} onKlik={() => navigate('/managers')} />
            <KernTegel label="LLMs" waarde={llm ? `${llm.verbonden}/${llm.ingesteld}` : '–'} toon={llmToon}
              grafiek={provTegels.length ? <TonenBalk tonen={provTegels.map((p) => p.toon)} /> : undefined}
              regel={llm ? `answering · ${llm.ingesteld} with a key` : 'No provider check yet'}
              fix={{ soort: 'open', route: '/settings', uitleg: 'Open Settings › keys and providers.' }} onKlik={() => navigate('/settings')} />
            <KernTegel label="System" waarde={runs ? `${runs.length - runFouten}/${runs.length}` : vandaag?.klaar ?? '–'} toon={systeemToon}
              spark={runFouten ? runFoutUren : runUren} sparkToon={runFouten ? 'fout' : 'ok'}
              regel={runs ? `cron runs ok · 24h · ${runFouten} failed` : vandaag?.mislukt == null ? 'Counting…' : `tasks done today · ${vandaag.mislukt} failed`}
              fix={{ soort: 'open', route: '/ledger', uitleg: 'Open the ledger with the failed runs.' }} onKlik={() => navigate('/ledger')} />
          </div>
        </DashKaart>
        <DashKaart titel={<Kop tekst="Services & devices" onKlik={() => navigate('/devices')} />} telling={toestellen.length + diensten.length || undefined} className="axe-hcc-kaart axe-hcc-kaart--diensten" vrij>
          <div className="axe-hcc-dienstlijst" data-axe-hcc-diensten>
            {toestellen.map((d) => {
              const aan = isOnline(d.last_seen);
              return (
                <button type="button" key={`d:${d.device_id}`} className="axe-hcc-dienst" data-toon={aan ? 'ok' : 'uit'}
                  title={`${d.device_name}: ${aan ? 'online' : 'offline'}`} onClick={() => navigate('/devices')}>
                  <Stip toon={aan ? 'ok' : 'uit'} />
                  <span className="axe-hcc-dienst-naam">{d.device_name}{d.ditToestel ? ' (this one)' : ''}</span>
                  <span className="axe-hcc-dienst-stand">{aan ? 'online' : 'offline'}</span>
                </button>
              );
            })}
            {diensten.map((s) => (
              <button type="button" key={`s:${s.id}`} className="axe-hcc-dienst" data-toon={s.ok == null ? 'uit' : s.ok ? 'ok' : 'fout'}
                title={`${s.name}: ${s.ok == null ? 'unknown' : s.ok ? 'online' : 'down'}${s.detail ? ` · ${s.detail}` : ''}`} onClick={() => navigate('/apps')}>
                <Stip toon={s.ok == null ? 'uit' : s.ok ? 'ok' : 'fout'} />
                <span className="axe-hcc-dienst-naam">{s.name}</span>
                <span className="axe-hcc-dienst-stand">{s.ok == null ? 'unknown' : s.ok ? 'online' : 'down'}</span>
              </button>
            ))}
            {stoelen.length > 0 && (
              <button type="button" className="axe-hcc-dienst" data-toon={stoelenKlaar ? 'ok' : 'fout'}
                title={`Coding seats: ${stoelenKlaar}/${stoelen.length} ready`} onClick={() => navigate('/settings')}>
                <Stip toon={stoelenKlaar ? 'ok' : 'fout'} />
                <span className="axe-hcc-dienst-naam">Seats {stoelenKlaar}/{stoelen.length}</span>
                <span className="axe-hcc-dienst-stand">{stoelenKlaar}/{stoelen.length} ready</span>
              </button>
            )}
            {!toestellen.length && !diensten.length && !stoelen.length && (
              <DashLeeg>{devices.fout || snapshot.fout ? 'Services did not answer.' : 'Checking devices and services…'}</DashLeeg>
            )}
          </div>
        </DashKaart>
      </div>

      {/* ── Midden: ruimte voor de core (de bol zelf staat in Home) ── */}
      <div className="axe-hcc-kern" aria-hidden="true" />

      {/* ── Rechts: compacte feed, wat op jou wacht, providers ── */}
      <div className="axe-hcc-rechts">
        <DashKaart titel={<Kop tekst="Live feed" onKlik={() => navigate('/notifications')} />} telling={feed.length || undefined} className="axe-hcc-kaart axe-hcc-kaart--feed" vrij
          actie={<button type="button" className="axe-hcc-kopknop" onClick={() => navigate('/ledger')}>Ledger</button>}>
          <div className="axe-hcc-feed" data-axe-hcc-feed>
            {feed.length === 0 && <DashLeeg>No events in the last 24 hours.</DashLeeg>}
            {feed.map((r) => {
              const taak = recentOp.get(r.id);
              return (
                <button key={r.id} type="button" className="axe-hcc-feedrij" data-soort={r.soort} title={`${r.titel} — ${r.sub}`} onClick={() => navigate(r.route)}>
                  <i className="axe-hcc-feed-streep" aria-hidden="true" />
                  <span className="axe-hcc-feed-tekst">
                    <span className="axe-hcc-feed-kop">{r.titel}</span>
                    {r.sub && <span className="axe-hcc-feed-sub">{r.sub}</span>}
                  </span>
                  {taak ? <Actie actie={recentActie(taak)} taskId={taak.taskId} /> : null}
                  <span className="axe-hcc-feed-tijd">{geledenTekst(r.at, nu.getTime())}</span>
                </button>
              );
            })}
          </div>
        </DashKaart>
        <DashKaart titel={<Kop tekst="Needs you" onKlik={() => navigate('/wacht')} />} telling={okTal || undefined} className={`axe-hcc-kaart axe-hcc-kaart--ok${okTal ? ' is-aandacht' : ''}`}>
          <div data-axe-home-ok>
            {stand.goedkeuringen.length === 0 && !elders && <DashLeeg>Nothing is waiting on you.</DashLeeg>}
            {elders > 0 && (
              <button type="button" className="axe-home-live-actie" data-axe-home-wacht
                style={{ color: 'var(--warn)', textAlign: 'left' }} onClick={() => navigate('/wacht')}>
                {elders} NorthSea {elders === 1 ? 'item is' : 'items are'} waiting · open Waiting on you
              </button>
            )}
            {/* Luka tikt zelf: niets wordt hier automatisch goedgekeurd. */}
            <GoedkeuringActie
              compact
              rijen={stand.goedkeuringen}
              onVraag={(rij) => { if (rij.agentId) navigate(`/managers?open=${encodeURIComponent(rij.agentId)}`); }}
              onBeslis={(rij, akkoord) => { void beslisAgentOk({ akkoord, rij }).then(verversServerAgents); }}
            />
          </div>
        </DashKaart>
        <DashKaart titel={<Kop tekst="LLM providers" onKlik={() => navigate('/settings')} />} telling={provTegels.length || undefined} className="axe-hcc-kaart" vrij>
          <div className="axe-hcc-providers" data-axe-hcc-providers>
            {provTegels.length === 0 && <DashLeeg>No provider check yet.</DashLeeg>}
            {provTegels.slice(0, 10).map((p) => (
              <button type="button" key={p.id} className="axe-hcc-provider" onClick={() => navigate('/settings')} data-toon={p.toon} title={`${p.naam}: ${p.regel}`}>
                <Stip toon={p.toon} />
                <span className="axe-hcc-provider-tekst">
                  <span className="axe-hcc-provider-naam">{p.naam}</span>
                  <span className="axe-hcc-provider-regel">{p.regel}</span>
                </span>
              </button>
            ))}
          </div>
        </DashKaart>
      </div>

      {/* ── Onderaan: Apps health breed, dan agents, vandaag, limieten, monitor ── */}
      <div className="axe-hcc-onder">
        <DashKaart titel={<Kop tekst="Apps health" onKlik={() => navigate('/apps')} />} telling={appsMis || undefined}
          className={`axe-hcc-kaart axe-hcc-kaart--apps${appsMis ? ' is-aandacht' : ''}`} vrij
          actie={<button type="button" className="axe-hcc-kopknop" onClick={() => navigate('/cron-manager')}>Cron</button>}>
          <div className="axe-hcc-apps" data-axe-hcc-apps>
            {apps.map((a) => <AppRij key={a.id} app={a} nu={nu.getTime()} onKlik={() => navigate(a.route)} />)}
          </div>
        </DashKaart>
        <DashKaart titel={<Kop tekst="Agents" onKlik={() => navigate('/managers')} />} telling={stand.werkend || undefined} className="axe-hcc-kaart" vrij
          actie={<button type="button" className="axe-hcc-kopknop" onClick={() => navigate('/managers')}>All</button>}>
          <div className="axe-hcc-agents" data-axe-hcc-agents>
            {agentTegels.map(({ agent, job }) => {
              const srv = server.agents[agent.id];
              const s = job ? STAND[job.state] : srv ? serverStand(srv) : null;
              const label = s?.label || 'idle';
              const kleur = s?.kleur || 'var(--text-muted)';
              return (
                <button key={agent.id} type="button" className="axe-hcc-agent" data-axe-agent={agent.id}
                  onClick={() => navigate(`/managers?open=${encodeURIComponent(agent.id)}`)}>
                  <ManagerAvatar agent={agent} size={20} />
                  <span className="axe-hcc-agent-tekst">
                    <span className="axe-hcc-agent-naam">{agent.kort ?? agent.name}</span>
                    <span className="axe-hcc-agent-stand" style={{ color: kleur }}>{label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </DashKaart>
        <DashKaart titel={<Kop tekst="Today" onKlik={() => navigate('/calendar')} />} telling={tijdItems.length + (dag.herhalend?.jobs ?? 0) || undefined} className="axe-hcc-kaart" vrij
          actie={<button type="button" className="axe-hcc-kopknop" onClick={() => navigate('/calendar')}>Calendar</button>}>
          <div className="axe-hcc-tijdlijn" data-axe-hcc-tijdlijn>
            {dag.herhalend && (
              <div className="axe-hcc-tijd axe-hcc-tijd--herhaal" data-axe-hcc-herhaal title="Crons that run several times today, counted together">
                <span className="axe-hcc-tijd-uur font-mono-data">↻</span>
                <i className="axe-hcc-tijd-punt" aria-hidden="true" />
                <span className="axe-hcc-tijd-titel">{dag.herhalend.regel}</span>
              </div>
            )}
            {tijdItems.length === 0 && !dag.herhalend && (
              <DashLeeg>{tijdlijn.fout ? 'Schedule did not answer.' : tijdlijn.data ? 'Nothing else planned today.' : 'Loading today…'}</DashLeeg>
            )}
            {tijdItems.map((i) => (
              <div key={i.id} className="axe-hcc-tijd">
                <span className="axe-hcc-tijd-uur font-mono-data">{i.tijd}</span>
                <i className="axe-hcc-tijd-punt" style={{ background: i.kleur }} aria-hidden="true" />
                <span className="axe-hcc-tijd-titel">{i.titel}</span>
              </div>
            ))}
          </div>
        </DashKaart>
        <DashKaart titel={<Kop tekst="AI limits" onKlik={() => navigate('/settings')} />} telling={limieten.filter((l) => l.pct != null).length || undefined} className="axe-hcc-kaart" vrij
          actie={<button type="button" className="axe-hcc-kopknop" onClick={() => navigate('/settings')}>Usage</button>}>
          <div className="axe-hcc-limieten" data-axe-hcc-limieten>
            {limieten.length === 0 && (
              <DashLeeg>{verbruik.fout && credits.fout ? 'Usage & Credits did not answer.' : verbruik.data || credits.data ? 'No subscriptions measured.' : 'Loading limits…'}</DashLeeg>
            )}
            {limieten.slice(0, 6).map((l) => (
              <div key={l.id} className="axe-hcc-limiet" data-toon={l.toon} title={`${l.naam}: ${l.regel}`}>
                <span className="axe-hcc-limiet-naam"><Stip toon={l.toon} />{l.naam}</span>
                {l.pct != null
                  ? <span className="axe-hcc-limiet-balk"><i style={{ width: `${Math.max(2, Math.min(100, l.pct))}%` }} /></span>
                  : <span className="axe-hcc-limiet-balk axe-hcc-limiet-balk--leeg" />}
                <span className="axe-hcc-limiet-regel">{l.pct != null ? `${l.pct}%` : ''}</span>
                <span className="axe-hcc-limiet-sub">{l.regel}</span>
              </div>
            ))}
          </div>
        </DashKaart>
        <DashKaart titel={<Kop tekst="System monitor" onKlik={() => navigate('/status')} />} className="axe-hcc-kaart" vrij>
          <div className="axe-hcc-monitor" data-axe-hcc-monitor>
            {machines.length === 0 && (
              <DashLeeg>{snapshot.fout ? 'No live metrics: the VPS snapshot did not answer.' : 'Waiting for the first measurement…'}</DashLeeg>
            )}
            {machines.map((m) => (
              <div key={m.id} className="axe-hcc-machine">
                <span className="axe-hcc-machine-naam"><Stip toon={m.online ? 'ok' : 'uit'} />{m.name}</span>
                <div className="axe-hcc-ringen">
                  <Ring pct={ringWaarde(m.cpu)} label="CPU" />
                  <Ring pct={ringWaarde(m.mem)} label="RAM" />
                  <Ring pct={ringWaarde(m.disk)} label="Disk" />
                </div>
              </div>
            ))}
          </div>
        </DashKaart>
      </div>
    </div>
  );
}
