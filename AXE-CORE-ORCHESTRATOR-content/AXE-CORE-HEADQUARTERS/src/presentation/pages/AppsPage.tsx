import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { AppWindow, ArrowRight, ExternalLink, Wrench } from 'lucide-react';
import { sbGetRows, vercelListDeployments, isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { useVoiceStore } from '@/presentation/store/voiceStore';

/**
 * Apps — real registry, not a hardcoded list. Rows come from the Supabase
 * `registered_apps` table (see supabase/migrations/20260723_registered_apps.sql);
 * live status comes from each row's Vercel project via axe_api. "Improve
 * with Axe" drops the app's repo context into chat so the
 * branch -> PR -> approved-merge loop can run against any registered app.
 */

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
}

type LiveState = 'checking' | 'online' | 'deploying' | 'error' | 'unknown';

const STATE_STYLE: Record<LiveState, { bg: string; fg: string; label: string }> = {
  checking: { bg: 'rgba(148,163,184,0.15)', fg: '#94A3B8', label: 'checking…' },
  online: { bg: 'rgba(34,197,94,0.15)', fg: '#22C55E', label: 'online' },
  deploying: { bg: 'rgba(234,179,8,0.15)', fg: '#EAB308', label: 'deploying' },
  error: { bg: 'rgba(239,68,68,0.15)', fg: '#F87171', label: 'deploy failed' },
  unknown: { bg: 'rgba(148,163,184,0.12)', fg: '#94A3B8', label: 'no deploy info' },
};

export default function AppsPage() {
  const navigate = useNavigate();
  const sendMessage = useVoiceStore(s => s.sendMessage);
  const [apps, setApps] = useState<RegisteredApp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, LiveState>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = (await sbGetRows('registered_apps', { limit: 50 })) as unknown as RegisteredApp[];
        const enabled = rows.filter(r => r.enabled !== false);
        if (cancelled) return;
        setApps(enabled);
        // Live status per app that has a Vercel project — sequential is fine
        // for a handful of rows, and keeps axe_api load trivial.
        for (const app of enabled) {
          if (!app.vercel_project_id) {
            setLive(prev => ({ ...prev, [app.id]: 'unknown' }));
            continue;
          }
          setLive(prev => ({ ...prev, [app.id]: 'checking' }));
          try {
            const deployments = await vercelListDeployments(1, app.vercel_project_id);
            if (cancelled) return;
            const state = deployments[0]?.state ?? '';
            setLive(prev => ({
              ...prev,
              [app.id]: state === 'READY' ? 'online' : state === 'ERROR' ? 'error' : state ? 'deploying' : 'unknown',
            }));
          } catch {
            if (!cancelled) setLive(prev => ({ ...prev, [app.id]: 'unknown' }));
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openApp = (app: RegisteredApp) => {
    if (app.internal_path) { navigate(app.internal_path); return; }
    if (app.prod_url) window.open(app.prod_url, '_blank', 'noopener');
  };

  const improveWithAxe = (app: RegisteredApp) => {
    navigate('/');
    void sendMessage(
      `Ik wil ${app.name} verbeteren. Repo: ${app.repo} (branch ${app.default_branch}).` +
      ` Verken eerst kort de structuur met [GIT_READ:]/de tree, stel dan concreet voor wat je zou aanpakken,` +
      ` en gebruik voor elke wijziging de change loop (GIT_BRANCH -> GIT_WRITE -> GIT_PR).`,
    );
  };

  return (
    <motion.div
      className="p-6 h-full overflow-y-auto"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <h1 className="text-page-title font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        Apps
      </h1>
      <p className="text-body mb-6" style={{ color: 'var(--text-secondary)' }}>
        Your registered AXE applications — live status from Vercel, improvable by Axe.
      </p>

      {loadError && (
        <div className="rounded-xl px-4 py-3 mb-4 text-sm max-w-2xl" style={{ background: 'rgba(239,68,68,0.08)', color: '#F87171', border: '1px solid rgba(239,68,68,0.18)' }}>
          Could not load the app registry: {loadError}
          {!isAxeApiConfigured && ' (AXE API not configured)'}
          <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            If the `registered_apps` table doesn't exist yet, apply supabase/migrations/20260723_registered_apps.sql.
          </div>
        </div>
      )}

      {!apps && !loadError && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading registry…</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        {(apps ?? []).map(app => {
          const state = STATE_STYLE[live[app.id] ?? 'checking'];
          return (
            <div
              key={app.id}
              className="group relative flex flex-col items-start p-5 rounded-xl border transition-all duration-200 text-left"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-3 mb-3 w-full">
                <div
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{ width: 44, height: 44, backgroundColor: app.color + '15', border: `1px solid ${app.color}30` }}
                >
                  <AppWindow size={22} style={{ color: app.color }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold truncate" style={{ color: '#FFFFFF' }}>{app.name}</h3>
                  <span
                    className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: state.bg, color: state.fg }}
                  >
                    {state.label}
                  </span>
                </div>
              </div>
              <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{app.description}</p>
              {app.repo && (
                <p className="text-[11px] font-mono mb-3" style={{ color: 'var(--text-muted)' }}>{app.repo} · {app.default_branch}</p>
              )}
              <div className="flex items-center gap-3 mt-auto">
                {(app.internal_path || app.prod_url) && (
                  <button
                    onClick={() => openApp(app)}
                    className="flex items-center gap-1 text-xs font-medium"
                    style={{ color: app.color }}
                  >
                    Open app {app.internal_path ? <ArrowRight size={14} /> : <ExternalLink size={13} />}
                  </button>
                )}
                {app.repo && (
                  <button
                    onClick={() => improveWithAxe(app)}
                    className="flex items-center gap-1 text-xs font-medium rounded-lg px-2 py-1"
                    style={{ color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.25)', background: 'rgba(34,211,238,0.06)' }}
                  >
                    <Wrench size={12} /> Improve with Axe
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
