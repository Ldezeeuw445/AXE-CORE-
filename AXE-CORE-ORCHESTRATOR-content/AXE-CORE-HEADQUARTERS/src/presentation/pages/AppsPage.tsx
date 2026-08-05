import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { AppWindow, ArrowRight, ExternalLink, RefreshCw, Wrench } from 'lucide-react';
import { sbGetRows, vercelListDeployments, isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { useVoiceStore } from '@/presentation/store/voiceStore';
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
}

type LiveState = 'checking' | 'online' | 'deploying' | 'error' | 'unknown';

const STATE_STYLE: Record<LiveState, { bg: string; fg: string; label: string }> = {
  checking: { bg: 'rgba(148,163,184,0.12)', fg: '#94A3B8', label: 'Checking' },
  online: { bg: 'rgba(16,185,129,0.12)', fg: '#34d399', label: 'Online' },
  deploying: { bg: 'rgba(245,158,11,0.12)', fg: '#fbbf24', label: 'Deploying' },
  error: { bg: 'rgba(239,68,68,0.12)', fg: '#f87171', label: 'Failed' },
  unknown: { bg: 'rgba(255,255,255,0.04)', fg: 'rgba(255,255,255,0.4)', label: 'Unknown' },
};

export default function AppsPage() {
  const navigate = useNavigate();
  const sendMessage = useVoiceStore(s => s.sendMessage);
  const [apps, setApps] = useState<RegisteredApp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, LiveState>>({});

  const load = async () => {
    setLoadError(null);
    try {
      const rows = await sbGetRows<RegisteredApp>('registered_apps', { limit: 100 });
      const list = (rows ?? []).filter(a => a.enabled !== false);
      setApps(list);
      if (isAxeApiConfigured()) {
        const next: Record<string, LiveState> = {};
        await Promise.all(
          list.map(async (app) => {
            if (!app.vercel_project_id) {
              next[app.id] = 'unknown';
              return;
            }
            next[app.id] = 'checking';
            try {
              const deps = await vercelListDeployments(app.vercel_project_id);
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
    void load();
  }, []);

  const onlineCount = Object.values(live).filter(s => s === 'online').length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Registry"
        title="Apps"
        description="Registered product surfaces — status, deploy, and improve via AXE."
        actions={
          <AxeButton variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={12} /> Refresh
          </AxeButton>
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        <StatPill label="Registered" value={apps?.length ?? '—'} tone="cyan" />
        <StatPill label="Online" value={onlineCount} tone="success" />
        <StatPill label="API" value={isAxeApiConfigured() ? 'Linked' : 'Local'} tone="neutral" />
      </div>

      {loadError && (
        <AxeCard className="mb-4" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="text-[12px]" style={{ color: '#f87171' }}>{loadError}</div>
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
          <SectionLabel>Product surfaces</SectionLabel>
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
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: `${app.color || '#22D3EE'}18`,
                            border: `1px solid ${app.color || '#22D3EE'}44`,
                          }}
                        >
                          <AppWindow size={14} style={{ color: app.color || '#22D3EE' }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold truncate" style={{ color: '#F5F0E6' }}>
                            {app.name}
                          </div>
                          <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {app.repo || app.internal_path || '—'}
                          </div>
                        </div>
                      </div>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{ background: st.bg, color: st.fg }}
                      >
                        {st.label}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {app.description || app.notes || 'No description'}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
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
                    </div>
                  </AxeCard>
                </motion.div>
              );
            })}
          </CardGrid>
        </>
      )}
    </PageShell>
  );
}
