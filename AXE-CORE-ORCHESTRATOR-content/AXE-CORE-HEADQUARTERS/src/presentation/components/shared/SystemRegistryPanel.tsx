import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Database, ShieldCheck, Cpu, Workflow, CircleDot } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { loadSystemRegistry, type RegistrySection, type RegistryItem } from '@/application/system/systemRegistryService';

function statusColor(status: RegistryItem['status']): string {
  switch (status) {
    case 'online':
    case 'healthy':
      return 'var(--success)';
    case 'configured':
      return 'var(--accent-cyan)';
    case 'degraded':
      return 'var(--warning)';
    case 'offline':
      return 'var(--error)';
    default:
      return 'var(--text-muted)';
  }
}

function SectionCard({ section }: { section: RegistrySection }) {
  const active = section.items.filter(item => item.status === 'online' || item.status === 'healthy' || item.status === 'configured').length;
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs-custom font-medium" style={{ color: 'var(--text-primary)' }}>{section.title}</p>
          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{section.description}</p>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(148,163,184,0.12)', color: 'var(--text-muted)' }}>
          {active}/{section.items.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {section.items.slice(0, 5).map(item => (
          <div key={item.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="rounded-full" style={{ width: 6, height: 6, background: statusColor(item.status), boxShadow: item.status === 'online' || item.status === 'healthy' ? `0 0 8px ${statusColor(item.status)}` : 'none', flexShrink: 0 }} />
                <span className="text-[10px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
              </div>
              {item.detail && <p className="text-[9px] truncate ml-3.5" style={{ color: 'var(--text-muted)' }}>{item.detail}</p>}
            </div>
            <span className="text-[9px] uppercase font-mono" style={{ color: statusColor(item.status) }}>{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SystemRegistryPanel() {
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [sections, setSections] = useState<RegistrySection[]>([]);

  const load = async () => {
    setLoading(true);
    const snapshot = await loadSystemRegistry();
    setSections(snapshot.sections);
    setGeneratedAt(snapshot.generatedAt);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    const sectionCounts = sections.map(section => section.items.length);
    return sectionCounts.reduce((a, b) => a + b, 0);
  }, [sections]);

  return (
    <WidgetCard title="SYSTEM REGISTRY" headerAction={
      <button onClick={load} className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        refresh
      </button>
    }>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>Single source of truth for AXE Core runtime state.</p>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {summary} records · {generatedAt ? new Date(generatedAt).toLocaleString() : 'loading…'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
            <ShieldCheck size={11} />
            <span>read-only</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-3" style={{ color: 'var(--text-muted)' }}>
            <CircleDot size={11} className="animate-pulse" />
            <span className="text-xs">Loading registry…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {sections.map(section => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>
        )}

        <div className="space-y-2 pt-1">
          <div className="rounded-xl p-3" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.1)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Database size={12} style={{ color: 'var(--accent-cyan)' }} />
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>Registry</span>
            </div>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Providers, models, services, agents, workflows and capabilities are visible from the same source.</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Cpu size={12} style={{ color: 'var(--success)' }} />
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>AXE Core</span>
            </div>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>This is the reference state AXE Core uses to decide what it can do.</p>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
