import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Activity, ArrowRight, ExternalLink, Home, Plus, Power, RefreshCw, Smartphone, Trash2, Wrench } from 'lucide-react';
import {
  sbGetRows, sbDeleteRow, isAxeApiConfigured,
  vpsStatus, buildStatus, vpsServiceRestart, type VpsStatus, type BuildStatus,
  northseaPipelineSummary, northseaSystemHealth, northseaCommunicationsMetrics, northseaTab,
  type NorthseaPipelineSummary, type NorthseaSystemHealth, type NorthseaCommunicationsMetrics,
} from '@/infrastructure/gateways/axeCoreApiService';
import {
  androidShellAvailable, isAppInstalled, openAndroidApp, openPhoneHomeScreen,
} from '@/infrastructure/gateways/androidAppsBridge';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { openEpisode, closeEpisode } from '@/infrastructure/persistence/agentFeedbackService';
import AppLogo from '@/presentation/components/apps/AppLogo';
import AddAppDialog from '@/presentation/components/apps/AddAppDialog';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { SchuifBalk } from '@/presentation/components/layout/tabMaatstaf';
import {
  PageHeader, AxeCard, AxeButton, StatPill, EmptyState, CardGrid, SectionLabel,
} from '@/presentation/components/ui/AxeUI';

interface RegisteredApp {
  id: string;
  name: string;
  description: string;
  repo: string;
  default_branch: string;
  vercel_project_id: string;
  prod_url: string;
  color: string;
  internal_path: string;
  notes: string;
  enabled: boolean;
  icon_url: string | null;
  android_package: string | null;
  user_added: boolean;
  sort_order: number | null;
}

type LiveState = 'checking' | 'online' | 'deploying' | 'error' | 'unknown';

const STATE_STYLE: Record<LiveState, { bg: string; fg: string; label: string }> = {
  checking: { bg: 'rgba(148,163,184,0.12)', fg: '#94A3B8', label: 'Checking' },
  online: { bg: 'rgba(16,185,129,0.12)', fg: 'var(--success)', label: 'Online' },
  deploying: { bg: 'rgba(245,158,11,0.12)', fg: 'var(--warning)', label: 'Deploying' },
  error: { bg: 'rgba(239,68,68,0.12)', fg: 'var(--error)', label: 'Failed' },
  unknown: { bg: 'rgba(255,255,255,0.04)', fg: 'rgba(255,255,255,0.4)', label: 'Unknown' },
};

// Which registered_apps row maps to which real VPS systemd unit (main.py's
// _VPS_SERVICES) — keyed on the unique `name` column seeded in
// 20260723_registered_apps.sql. Trading OS has no entry here on purpose: it
// is an internal tab (internal_path '/trading'), not a separate deploy
// target, so there is nothing on the VPS to health-check for it — fabricating
// one would be exactly the "guessed status" this feature replaces.
const VPS_SERVICE_BY_APP_NAME: Record<string, string> = {
  'AXE CORE HQ': 'axe-core-api',
  'AXE Companion': 'axe-companion',
};

// Apps whose registered_apps row would otherwise imply a status this
// dashboard cannot honestly claim — confirmed by a dedicated investigation
// (see the App Manager Vercel-removal pass), not guessed from a URL fetch or
// Vercel's API (which this page no longer calls, full stop — see the load()
// comment below). Each entry overrides both the card's status badge and adds
// an explicit detail line, regardless of what prod_url/vercel_project_id
// happen to hold on the row:
//  - AXE Companion runs on the VPS today, but DNS still points at the
//    disabled Vercel deployment, so nothing public actually resolves to it.
//  - Trading OS has never been a separate deployment — it is an internal
//    tab, hence no VPS_SERVICE_BY_APP_NAME entry for it either.
//  - Axon Memory has its own domain and its own Supabase project, neither of
//    which this app can independently verify — so instead of trusting a
//    no-cors fetch as a stand-in for "launched", it says plainly that this
//    dashboard doesn't know.
const NOT_LAUNCHED_STATUS: Record<string, { badge: string; detail: string }> = {
  'AXE Companion': {
    badge: 'Not launched',
    detail: 'Not launched — runs on the VPS (axe-companion service), DNS not yet cut over from the disabled Vercel deployment.',
  },
  'Trading OS': {
    badge: 'No deployment',
    detail: 'Not a separate deployment — runs as a tab inside AXE CORE.',
  },
  'Axon Memory': {
    badge: 'Status unknown',
    detail: 'Status unknown from AXE CORE — check directly.',
  },
};

interface AppHealthCheck {
  checking: boolean;
  vps?: VpsStatus;
  build?: BuildStatus;
  error?: string;
  checkedAt?: number;
}

// NorthSea Commodity is a real business Luka runs, not a deploy target — it
// has no registered_apps row and no VPS systemd unit of its own here, so it
// gets its own card below the registry grid rather than a slot inside it
// (same reasoning as Trading OS having no VPS_SERVICE_BY_APP_NAME entry
// above). Revenue is carried explicitly as `commissie_bedragen`/`waarde_ingevuld`
// counts (from the existing /northsea/tab/rapporten) rather than a dollar
// figure: as of writing, zero opportunities have a commission amount filled
// in, so a dollar total would be fabricated — the count is the honest number.
interface NorthseaRevenueCounts {
  deals: number;
  gewonnen: number;
  commissie_bedragen: number;
  waarde_ingevuld: number;
}

interface NorthseaSummaryState {
  loading: boolean;
  pipeline?: NorthseaPipelineSummary;
  health?: NorthseaSystemHealth;
  comms?: NorthseaCommunicationsMetrics;
  revenue?: NorthseaRevenueCounts;
  error?: string;
}

export default function AppsPage() {
  const navigate = useNavigate();
  const sendMessage = useVoiceStore(s => s.sendMessage);
  const [apps, setApps] = useState<RegisteredApp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const [adding, setAdding] = useState(false);
  const [health, setHealth] = useState<Record<string, AppHealthCheck>>({});
  const [restarting, setRestarting] = useState<Record<string, boolean>>({});
  const [northsea, setNorthsea] = useState<NorthseaSummaryState>({ loading: false });
  const onPhone = androidShellAvailable();

  // NorthSea Commodity summary — read-only, no confirm needed. Four calls:
  // three governed NorthSea MCP tools (pipeline/health/comms — main.py's
  // /northsea/pipeline-summary, /northsea/system-health,
  // /northsea/communications-metrics) plus the existing /northsea/tab/rapporten
  // for the honest commission count. This is a dashboard, not an agent acting
  // on the world, so unlike checkHealth() above it does not open a loop episode.
  const loadNorthsea = async () => {
    setNorthsea(prev => ({ ...prev, loading: true, error: undefined }));
    try {
      const [pipeline, healthData, comms, rapporten] = await Promise.all([
        northseaPipelineSummary(),
        northseaSystemHealth(),
        northseaCommunicationsMetrics(),
        northseaTab('rapporten'),
      ]);
      setNorthsea({
        loading: false, pipeline, health: healthData, comms,
        revenue: {
          deals: rapporten.totaal.deals,
          gewonnen: rapporten.totaal.gewonnen,
          commissie_bedragen: rapporten.totaal.commissie_bedragen,
          waarde_ingevuld: rapporten.totaal.waarde_ingevuld,
        },
      });
    } catch (e) {
      setNorthsea({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  // Real health check for the rows that map to a VPS systemd unit — replaces
  // the no-cors-fetch guess above for those two rows specifically. Backed by
  // main.py's /vps/status + /build/status (see axeCoreApiService.ts).
  //
  // Loop wiring (LOOP_AGENTS 'apps'): a health check has a real, observed
  // outcome (a live systemd state, not a guess), so it earns an episode —
  // opened before the call and closed with the actual result, same shape as
  // Tasks.tsx's 'task' wiring.
  const checkHealth = async (app: RegisteredApp) => {
    const serviceKey = VPS_SERVICE_BY_APP_NAME[app.name];
    setHealth(prev => ({ ...prev, [app.id]: { checking: true } }));
    const episodeId = await openEpisode({ agent: 'apps', subject: `${app.name} health check` });
    try {
      const [vps, build] = await Promise.all([vpsStatus(), buildStatus()]);
      const svc = serviceKey ? vps.services[serviceKey] : undefined;
      const healthy = serviceKey ? svc?.active === true : vps.ok;
      setHealth(prev => ({ ...prev, [app.id]: { checking: false, vps, build, checkedAt: Date.now() } }));
      void closeEpisode(
        episodeId,
        healthy ? 'good' : 'poor',
        serviceKey ? `${serviceKey}: ${svc?.state ?? (svc?.active === null ? 'unknown' : 'inactive')}` : 'vps status fetched',
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setHealth(prev => ({ ...prev, [app.id]: { checking: false, error: message, checkedAt: Date.now() } }));
      void closeEpisode(episodeId, 'poor', message);
    }
  };

  // Destructive: restarts a live systemd unit on the VPS. Gated behind an
  // explicit confirm (same window.confirm pattern this page already uses for
  // Remove, above) — this is the only caller of vpsServiceRestart() in the
  // app, and it is never invoked without that confirmation.
  const restartService = async (app: RegisteredApp, service: string) => {
    if (!window.confirm(
      `Restart ${service} on the VPS? This briefly interrupts the live ${app.name} API.`,
    )) return;
    setRestarting(prev => ({ ...prev, [app.id]: true }));
    const episodeId = await openEpisode({ agent: 'apps', subject: `${app.name} restart (${service})` });
    try {
      const res = await vpsServiceRestart(service);
      void closeEpisode(episodeId, res.ok ? 'good' : 'poor', res.note);
      // The server dispatches the restart fire-and-forget, so the unit may
      // still be bouncing the moment this resolves — give it a few seconds
      // before re-checking rather than reading "still restarting" as failed.
      setTimeout(() => void checkHealth(app), 4_000);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLoadError(message);
      void closeEpisode(episodeId, 'poor', message);
    } finally {
      setRestarting(prev => ({ ...prev, [app.id]: false }));
    }
  };

  const load = async () => {
    try {
      const rows = await sbGetRows<RegisteredApp>('registered_apps', {
        limit: 100, orderBy: 'sort_order', orderDir: 'asc',
      });
      // Cleared on SUCCESS rather than on start. Clearing it first was a
      // synchronous setState in the effect body (the lint rule this file was
      // already failing), and it also blanked a real error the moment a
      // refresh began — so a failing reload looked like a working one until
      // it finished failing again.
      setLoadError(null);
      const list = (rows ?? []).filter(a => a.enabled !== false);
      setApps(list);
      if (isAxeApiConfigured) {
        const next: Record<string, LiveState> = {};
        await Promise.all(
          list.map(async (app) => {
            // This dashboard never asks Vercel's API for status — see
            // NOT_LAUNCHED_STATUS and VPS_SERVICE_BY_APP_NAME above for why.
            // Order matters: a hardcoded honest label wins over any network
            // check, a real VPS systemd check wins over a guess, and only
            // apps with neither fall back to an actual observation (native
            // install, or reachability) — never a fabricated "Online".
            if (NOT_LAUNCHED_STATUS[app.name]) {
              next[app.id] = 'unknown';
              return;
            }

            // Real systemd state from main.py's /vps/status — the same
            // source checkHealth()/the "Check health" button use — instead
            // of ever asking Vercel. AXE CORE HQ's row still carries a
            // vercel_project_id (historical; the column stays because other
            // code depends on it existing), but that value is never read
            // here or sent anywhere.
            const vpsServiceKey = VPS_SERVICE_BY_APP_NAME[app.name];
            if (vpsServiceKey) {
              next[app.id] = 'checking';
              try {
                const vps = await vpsStatus();
                const svc = vps.services[vpsServiceKey];
                next[app.id] = svc?.active === true ? 'online' : svc?.active === false ? 'error' : 'unknown';
              } catch {
                next[app.id] = 'unknown';
              }
              return;
            }

            // A native app is not a deployment: whether the package is
            // present on this phone is the only honest thing to check.
            if (app.android_package && !app.prod_url) {
              next[app.id] = onPhone
                ? (isAppInstalled(app.android_package) ? 'online' : 'error')
                : 'unknown';
              return;
            }

            if (!app.prod_url) {
              next[app.id] = 'unknown';
              return;
            }
            next[app.id] = 'checking';
            try {
              // no-cors: this is a cross-origin GET to a site we do not
              // control, so the response is opaque. Reaching it at all is
              // the signal; a body we cannot read would tell us no more.
              await fetch(app.prod_url, { mode: 'no-cors', signal: AbortSignal.timeout(8_000) });
              next[app.id] = 'online';
            } catch {
              next[app.id] = 'error';
            }
          }),
        );
        setLive(next);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setApps([]);
    }
  };

  useEffect(() => {
    // Deferred by a tick on purpose. `load` awaits before its first setState,
    // but the lint rule reads the effect body statically and cannot see that,
    // so calling it directly has failed `set-state-in-effect` at error level
    // for as long as this page has existed. A microtask makes the async
    // boundary explicit without duplicating the fetch into the effect.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);

  }, []);

  useEffect(() => {
    if (!isAxeApiConfigured) return;
    const t = setTimeout(() => void loadNorthsea(), 0);
    return () => clearTimeout(t);

  }, []);

  const onlineCount = Object.values(live).filter(s => s === 'online').length;

  const naarApp = (id: string) =>
    document.getElementById(`axe-app-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <>
    <TabRail kant="links">
      <SchuifBalk
        groepen={[
          {
            titel: 'Apps',
            items: (apps ?? []).map((app) => {
              const st = STATE_STYLE[live[app.id] ?? 'unknown'];
              return {
                id: app.id,
                label: `${app.name} · ${st.label}`,
                icoon: <span className="inline-block h-2 w-2 rounded-full" style={{ background: st.fg }} />,
                onKies: () => naarApp(app.id),
              };
            }),
          },
          {
            titel: 'Actions',
            items: [
              { id: 'add', label: 'Add app', icoon: <Plus size={13} />, onKies: () => setAdding(true) },
              { id: 'refresh', label: 'Refresh', icoon: <RefreshCw size={13} />, onKies: () => void load() },
            ],
          },
        ]}
      />
    </TabRail>
    <div className="axe-tabruimte flex min-h-0 flex-1 flex-col overflow-hidden pt-4">
      <div className="flex-none">
      <PageHeader
        eyebrow="Registry"
        title="Apps"
        description="Registered product surfaces — status, deploy, and improve via AXE."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <AxeButton size="sm" onClick={() => setAdding(true)}>
              <Plus size={12} /> Add app
            </AxeButton>
            {/* Only on the phone: there is no "home screen" to reach from the
                desktop app, and a button that cannot work is worse than none. */}
            {onPhone && (
              <AxeButton variant="secondary" size="sm" onClick={() => openPhoneHomeScreen()}>
                <Home size={12} /> Home screen
              </AxeButton>
            )}
            <AxeButton variant="secondary" size="sm" onClick={() => void load()}>
              <RefreshCw size={12} /> Refresh
            </AxeButton>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        <StatPill label="Registered" value={apps?.length ?? '—'} tone="cyan" />
        <StatPill label="Online" value={onlineCount} tone="success" />
        <StatPill label="API" value={isAxeApiConfigured ? 'Linked' : 'Local'} tone="neutral" />
      </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {loadError && (
        <AxeCard className="mb-4" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="text-[12px]" style={{ color: 'var(--error)' }}>{loadError}</div>
        </AxeCard>
      )}

      {apps === null ? (
        <div className="flex h-full items-center justify-center">
        <EmptyState title="Loading apps…" description="Fetching registered_apps registry." />
        </div>
      ) : apps.length === 0 ? (
        <div className="flex h-full items-center justify-center">
        <EmptyState
          title="No apps registered"
          description="Add rows to registered_apps in Supabase, or open an internal surface from navigation."
          action={
            <AxeButton onClick={() => navigate('/')}>
              Back to Home <ArrowRight size={12} />
            </AxeButton>
          }
        />
        </div>
      ) : (
        <>
          {/* One list, ordered by sort_order — the four product surfaces sit at
              10–40 and anything Luka adds lands at 500, so his own apps group
              at the end without needing a second grid of duplicated card. */}
          <SectionLabel>Apps</SectionLabel>
          <CardGrid cols={3}>
            {apps.map((app, i) => {
              const state = live[app.id] ?? 'unknown';
              const st = STATE_STYLE[state];
              const vpsServiceKey = VPS_SERVICE_BY_APP_NAME[app.name];
              const notLaunched = NOT_LAUNCHED_STATUS[app.name];
              const h = health[app.id];
              return (
                <motion.div
                  key={app.id}
                  id={`axe-app-${app.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                >
                  <AxeCard hover className="h-full flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <AppLogo name={app.name} iconUrl={app.icon_url} color={app.color} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold truncate" style={{ color: '#F5F0E6' }}>
                            {app.name}
                          </div>
                          <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {app.repo || app.internal_path || app.android_package || '—'}
                          </div>
                        </div>
                      </div>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{ background: st.bg, color: st.fg }}
                      >
                        {/* "Failed" is the wrong word for an app that simply is
                            not on the phone, and "Online" is the wrong word for
                            one that is. Same states, honest labels. A
                            NOT_LAUNCHED_STATUS entry outranks both — see the
                            comment on that map for why. */}
                        {notLaunched
                          ? notLaunched.badge
                          : app.android_package && !app.prod_url
                            ? (state === 'online' ? 'Installed' : state === 'error' ? 'Not installed' : st.label)
                            : st.label}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {app.description || app.notes || 'No description'}
                    </p>
                    {/* Honest, hardcoded status for apps this dashboard knows
                        are not actually launched/reachable the way their row
                        might imply — see NOT_LAUNCHED_STATUS above. */}
                    {notLaunched && (
                      <div className="text-[10px] leading-relaxed -mt-1.5" style={{ color: 'var(--text-muted)' }}>
                        {notLaunched.detail}
                      </div>
                    )}
                    {/* Real VPS health, only for the rows that map to an
                        actual systemd unit — genuine pass/fail from
                        /vps/status + /build/status, not the opaque
                        reachable-or-not guess the card badge above shows. */}
                    {vpsServiceKey && (h?.checking || h?.error || h?.vps) && (
                      <div className="text-[10px] leading-relaxed -mt-1.5" style={{ color: 'var(--text-muted)' }}>
                        {h?.checking ? (
                          'Checking VPS…'
                        ) : h?.error ? (
                          <span style={{ color: 'var(--error)' }}>Health check failed: {h.error}</span>
                        ) : h?.vps ? (
                          <>
                            <span style={{
                              color: h.vps.services[vpsServiceKey]?.active ? 'var(--success)' : 'var(--error)',
                            }}
                            >
                              {vpsServiceKey}: {h.vps.services[vpsServiceKey]?.state
                                ?? (h.vps.services[vpsServiceKey]?.active === null ? 'unknown' : 'inactive')}
                            </span>
                            {h.build?.applicable && (
                              <>
                                {' · '}{h.build.branch ?? '?'} @ {h.build.commit?.short_sha ?? '?'}
                                {h.build.uncommitted_files ? ` (${h.build.uncommitted_files} uncommitted)` : ''}
                                {h.build.stale_vs_latest_commit ? ' · stale build' : ''}
                              </>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      {/* First, because on the phone it is the whole point of
                          the row — and it opens the real app, not a page about
                          it. Hidden off-device: nothing there can launch it. */}
                      {onPhone && app.android_package && (
                        <AxeButton
                          size="sm"
                          variant="primary"
                          disabled={state === 'error'}
                          onClick={() => {
                            if (!openAndroidApp(app.android_package as string)) {
                              setLoadError(`Could not open ${app.name} — ${app.android_package} is not installed on this phone.`);
                            }
                          }}
                        >
                          <Smartphone size={11} /> Open app
                        </AxeButton>
                      )}
                      {app.internal_path && (
                        <AxeButton size="sm" variant="primary" onClick={() => navigate(app.internal_path)}>
                          Open <ArrowRight size={11} />
                        </AxeButton>
                      )}
                      {app.prod_url && (
                        <AxeButton
                          size="sm"
                          variant="secondary"
                          onClick={() => window.open(app.prod_url, '_blank', 'noopener,noreferrer')}
                        >
                          <ExternalLink size={11} /> Live
                        </AxeButton>
                      )}
                      {/* Real VPS health check — only for rows mapped to an
                          actual systemd unit (see VPS_SERVICE_BY_APP_NAME). */}
                      {vpsServiceKey && (
                        <AxeButton
                          size="sm"
                          variant="ghost"
                          disabled={h?.checking}
                          onClick={() => void checkHealth(app)}
                        >
                          <Activity size={11} /> {h?.checking ? 'Checking…' : 'Check health'}
                        </AxeButton>
                      )}
                      {/* Destructive, confirm-gated, and only for AXE CORE
                          HQ's own service — restarting axe-companion from
                          here isn't part of this pass. */}
                      {vpsServiceKey === 'axe-core-api' && (
                        <AxeButton
                          size="sm"
                          variant="ghost"
                          disabled={restarting[app.id]}
                          onClick={() => void restartService(app, 'axe-core-api')}
                        >
                          <Power size={11} /> {restarting[app.id] ? 'Restarting…' : 'Restart API'}
                        </AxeButton>
                      )}
                      {/* "Improve" means AXE editing its own source, which is
                          meaningless for a bank app it did not write. */}
                      {!app.user_added && (
                        <AxeButton
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void sendMessage(
                              `Improve app ${app.name}. Repo: ${app.repo || 'n/a'}. Path: ${app.internal_path || 'n/a'}.`,
                            )
                          }
                        >
                          <Wrench size={11} /> Improve
                        </AxeButton>
                      )}
                      {/* Only rows Luka added himself can be removed here: the
                          four product surfaces are the registry, not clutter,
                          and deleting one from a phone tap is not recoverable. */}
                      {app.user_added && (
                        <AxeButton
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!window.confirm(`Remove ${app.name} from the Apps tab?`)) return;
                            try {
                              await sbDeleteRow('registered_apps', app.id);
                              await load();
                            } catch (e) {
                              setLoadError(e instanceof Error ? e.message : String(e));
                            }
                          }}
                        >
                          <Trash2 size={11} /> Remove
                        </AxeButton>
                      )}
                    </div>
                  </AxeCard>
                </motion.div>
              );
            })}
          </CardGrid>
        </>
      )}

      {/* NorthSea Commodity — a real business, not a deploy target (see the
          NorthseaSummaryState comment above). Own section below the registry
          grid, read-only, no confirm dialogs: three governed NorthSea MCP
          reads plus the existing Reports-tab totals. */}
      {isAxeApiConfigured && (
        <>
          <SectionLabel>NorthSea Commodity</SectionLabel>
          <AxeCard className="mb-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="text-[13px] font-semibold" style={{ color: '#F5F0E6' }}>
                  NorthSea Commodity
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Live deal pipeline — read-only, via the NorthSea MCP.
                </div>
              </div>
              <AxeButton size="sm" variant="ghost" disabled={northsea.loading} onClick={() => void loadNorthsea()}>
                <RefreshCw size={11} /> {northsea.loading ? 'Loading…' : 'Refresh'}
              </AxeButton>
            </div>

            {northsea.error && (
              <div className="text-[11px] mb-2" style={{ color: 'var(--error)' }}>
                Could not reach NorthSea: {northsea.error}
              </div>
            )}

            {northsea.pipeline && (() => {
              const metric = (name: string) => northsea.pipeline?.metrics.find(m => m.name === name)?.value ?? '—';
              const stageEntries = Object.entries(northsea.pipeline.by_stage);
              const gateEntries = Object.entries(northsea.pipeline.by_gate_passed).filter(([, v]) => v > 0);
              return (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <StatPill label="Open" value={metric('pipeline_open')} tone="cyan" />
                    <StatPill label="Active" value={metric('active')} tone="success" />
                    <StatPill label="Blocked" value={metric('blocked_open')} tone="warn" />
                    <StatPill label="Awaiting approval" value={metric('awaiting_approval')} tone="warn" />
                    <StatPill label="Won" value={metric('won')} tone="neutral" />
                  </div>
                  <div className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Stage: {stageEntries.length
                      ? stageEntries.map(([k, v]) => `${k} ${v}`).join(' · ')
                      : '—'}
                  </div>
                  <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                    Gates passed: {gateEntries.length ? gateEntries.map(([k, v]) => `${k} ${v}`).join(' · ') : 'none yet'}
                  </div>
                </>
              );
            })()}

            {/* Revenue is never omitted, even though it is zero — see the
                NorthseaRevenueCounts comment above for why this is a count,
                not a fabricated dollar figure. */}
            <div
              className="text-[11px] mb-2"
              style={{ color: northsea.revenue && northsea.revenue.commissie_bedragen > 0 ? 'var(--success)' : 'var(--text-muted)' }}
            >
              {northsea.revenue == null
                ? (northsea.loading ? 'Revenue: loading…' : 'Revenue: unknown — /northsea/tab/rapporten did not load.')
                : northsea.revenue.commissie_bedragen === 0
                  ? `Revenue: $0 — no commission recorded yet on any of ${northsea.revenue.deals} deal(s) (${northsea.revenue.gewonnen} won).`
                  : `Commission recorded on ${northsea.revenue.commissie_bedragen} of ${northsea.revenue.deals} deal(s) — dollar total not aggregated here.`}
            </div>

            {northsea.comms && (
              <div className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Comms (last {northsea.comms.window_weeks}w): {northsea.comms.inbound_total} inbound
                {' · '}{Object.values(northsea.comms.by_channel).reduce((sum, v) => sum + v, 0) - northsea.comms.inbound_total} other
                {' · '}{northsea.comms.bounced_total} bounced
              </div>
            )}

            {northsea.health && (
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Health: database {northsea.health.database.reachable ? 'reachable' : 'unreachable'}
                {northsea.health.scheduler.last_status ? ` · scheduler last run ${northsea.health.scheduler.last_status}` : ''}
                {typeof northsea.health.crewai.available === 'boolean'
                  ? ` · CrewAI ${northsea.health.crewai.available ? 'available' : 'unavailable'}` : ''}
              </div>
            )}
          </AxeCard>
        </>
      )}

      {adding && (
        <AddAppDialog onClose={() => setAdding(false)} onAdded={() => void load()} />
      )}
      </div>
    </div>
    </>
  );
}
