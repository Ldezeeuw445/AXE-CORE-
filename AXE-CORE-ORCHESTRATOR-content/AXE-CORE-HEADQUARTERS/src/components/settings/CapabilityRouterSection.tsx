import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Zap, CheckCircle2 } from 'lucide-react';
import { requireSupabase } from '@/core/supabase/client';

interface ExtraProvider {
  id: string;
  provider: string;
  model: string;
  label?: string;
  enabled: boolean;
}

interface Capability {
  id: string;
  capability: string;
  display_name: string;
  description: string;
  preferred_provider: string;
  preferred_model: string;
  fallback_provider: string;
  fallback_model: string;
  extra_providers: ExtraProvider[];
  keyword_patterns: string[];
  execution_mode?: 'read' | 'patch' | 'execute';
  enabled: boolean;
}

const CAP_COLORS: Record<string, string> = {
  fast: '#10B981',
  code: '#22D3EE',
  analysis: '#3B82F6',
  reasoning: '#8B5CF6',
  privacy: '#F59E0B',
  creative: '#EC4899',
};

function CapabilityCard({ cap }: { cap: Capability }) {
  const color = CAP_COLORS[cap.capability] ?? '#6B7280';
  const executionMode = cap.execution_mode ?? 'read';
  const providers = [
    { id: 'primary', label: 'Primary', provider: cap.preferred_provider, model: cap.preferred_model, enabled: true },
    { id: 'fallback', label: 'Fallback', provider: cap.fallback_provider, model: cap.fallback_model, enabled: true },
    ...cap.extra_providers.map(p => ({
      id: p.id,
      label: p.label ?? 'Extra',
      provider: p.provider,
      model: p.model,
      enabled: p.enabled,
    })),
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${color}25`, background: `${color}08` }}>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: cap.enabled ? color : '#6B7280', boxShadow: cap.enabled ? `0 0 8px ${color}` : 'none' }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color }}>{cap.display_name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-mono" style={{
                background: executionMode === 'execute'
                  ? 'rgba(245,158,11,0.15)'
                  : executionMode === 'patch'
                    ? 'rgba(34,211,238,0.15)'
                    : 'rgba(148,163,184,0.15)',
                color: executionMode === 'execute'
                  ? '#F59E0B'
                  : executionMode === 'patch'
                    ? '#22D3EE'
                    : '#94A3B8',
              }}>
                {executionMode}
              </span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{cap.description}</p>
          </div>
        </div>
        <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
          {providers.length} providers
        </span>
      </div>

      <div className="px-4 pb-4 space-y-2" style={{ borderTop: `1px solid ${color}15` }}>
        <div className="pt-3 space-y-1.5">
          {providers.map(provider => (
            <div
              key={provider.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{
                background: provider.enabled === false ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.04)',
                opacity: provider.enabled === false ? 0.55 : 1,
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase" style={{ background: `${color}20`, color }}>
                  {provider.label}
                </span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{provider.provider}</span>
                <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{provider.model}</span>
              </div>
              <CheckCircle2 size={11} style={{ color: provider.enabled === false ? 'var(--text-muted)' : 'var(--success)' }} />
            </div>
          ))}
        </div>

        {cap.keyword_patterns.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cap.keyword_patterns.map((kw, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                {kw}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.1)' }}>
          <Zap size={12} style={{ color: '#22D3EE', flexShrink: 0 }} />
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            AXE Core kiest deze route intern. Deze kaart is alleen inzicht, geen editor.
          </p>
        </div>
      </div>
    </div>
  );
}

export function CapabilityRouterSection() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const sb = requireSupabase();
        const { data } = await sb.from('core_capabilities').select('*').order('display_name');
        if (!alive) return;
        setCapabilities((data ?? []).map(c => ({ ...c, extra_providers: c.extra_providers ?? [] })));
      } catch (e) {
        console.warn('capabilities load failed', e);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Capability Router</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Read-only monitor. AXE Core beslist automatisch welke capability, provider en route gebruikt wordt.
          </p>
        </div>
        <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw size={13} className="animate-spin" />
          <span className="text-xs">Loading from Supabase…</span>
        </div>
      ) : capabilities.length === 0 ? (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>No capabilities found in Supabase</div>
      ) : (
        <div className="space-y-2">
          {capabilities.map(cap => <CapabilityCard key={cap.id} cap={cap} />)}
        </div>
      )}
    </div>
  );
}
