import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowRight, ExternalLink, Home, Plus, RefreshCw, Smartphone, Trash2, Wrench } from 'lucide-react';
import { sbGetRows, sbDeleteRow, vercelListDeployments, isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import {
  androidShellAvailable, isAppInstalled, openAndroidApp, openPhoneHomeScreen,
} from '@/infrastructure/gateways/androidAppsBridge';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import AppLogo from '@/presentation/components/apps/AppLogo';
import AddAppDialog from '@/presentation/components/apps/AddAppDialog';
import {
  PageShell, PageHeader, AxeCard, AxeButton, StatPill, EmptyState, CardGrid, SectionLabel,
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

export default function AppsPage() {
  const navigate = useNavigate();
  const sendMessage = useVoiceStore(s => s.sendMessage);
  const [apps, setApps] = useState<RegisteredApp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const [adding, setAdding] = useState(false);
  const onPhone = androidShellAvailable();

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
            // NO VERCEL PROJECT IS NOT THE SAME AS NOT RUNNING.
            //
            // This returned 'unknown' for anything without a Vercel id, so
            // Axon Memory — live on Cloudflare at app.axon-memory.com and
            // answering 200 — was labelled Unknown on a dashboard whose whole
            // job is saying what is up. A status has to come from an
            // observation, and the URL is the observation available here.
            // A native app is not a deployment. Ledger is either installed on
            // the phone or it is not, and asking Vercel or fetching a URL
            // would answer a question nobody asked — so the tile reports what
            // it can actually observe: whether the package is present.
            if (app.android_package && !app.vercel_project_id) {
              next[app.id] = onPhone
                ? (isAppInstalled(app.android_package) ? 'online' : 'error')
                : 'unknown';
              return;
            }
            if (!app.vercel_project_id) {
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
              return;
            }
            next[app.id] = 'checking';
            try {
              const deps = await vercelListDeployments(1, app.vercel_project_id);
              const latest = Array.isArray(deps) ? deps[0] : null;
              const st = String(
                (latest as { readyState?: string; state?: string })?.readyState
                ?? (latest as { state?: string })?.state
                ?? '',
              ).toUpperCase();
              if (st.includes('READY') || st === 'SUCCESS') next[app.id] = 'online';
              else if (st.includes('ERROR') || st.includes('FAIL')) next[app.id] = 'error';
              else if (st) next[app.id] = 'deploying';
              else next[app.id] = 'unknown';
            } catch {
              next[app.id] = 'unknown';
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

  const onlineCount = Object.values(live).filter(s => s === 'online').length;

  return (
    <PageShell>
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

      {loadError && (
        <AxeCard className="mb-4" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="text-[12px]" style={{ color: 'var(--error)' }}>{loadError}</div>
        </AxeCard>
      )}

      {apps === null ? (
        <EmptyState title="Loading apps…" description="Fetching registered_apps registry." />
      ) : apps.length === 0 ? (
        <EmptyState
          title="No apps registered"
          description="Add rows to registered_apps in Supabase, or open an internal surface from navigation."
          action={
            <AxeButton onClick={() => navigate('/')}>
              Back to Home <ArrowRight size={12} />
            </AxeButton>
          }
        />
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
              return (
                <motion.div
                  key={app.id}
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
                            one that is. Same states, honest labels. */}
                        {app.android_package && !app.vercel_project_id
                          ? (state === 'online' ? 'Installed' : state === 'error' ? 'Not installed' : st.label)
                          : st.label}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {app.description || app.notes || 'No description'}
                    </p>
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

      {adding && (
        <AddAppDialog onClose={() => setAdding(false)} onAdded={() => void load()} />
      )}
    </PageShell>
  );
}
