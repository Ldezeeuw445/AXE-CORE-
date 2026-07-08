import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Network,
  Cpu,
  Wrench,
  Server,
  User,
  RefreshCw,
  ShieldCheck,
  Activity,
  Database,
} from 'lucide-react';
import {
  loadAxeOrganization,
  type OrganizationNode,
  type OrganizationNodeKind,
} from '@/services/systemRegistryService';

const KIND_STYLE: Record<OrganizationNodeKind, { icon: typeof Brain; color: string }> = {
  user: { icon: User, color: '#E5E7EB' },
  core: { icon: Brain, color: '#22D3EE' },
  orchestrator: { icon: Network, color: '#A78BFA' },
  specialist: { icon: Activity, color: '#10B981' },
  provider: { icon: Cpu, color: '#F59E0B' },
  model: { icon: Database, color: '#3B82F6' },
  tool: { icon: Wrench, color: '#EC4899' },
  infrastructure: { icon: Server, color: '#EF4444' },
};

function statusColor(status: OrganizationNode['status']) {
  if (status === 'online' || status === 'healthy') return 'var(--success)';
  if (status === 'configured') return 'var(--accent-cyan)';
  if (status === 'degraded') return 'var(--warning)';
  if (status === 'offline') return 'var(--error)';
  return 'var(--text-muted)';
}

function flatten(node: OrganizationNode): OrganizationNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

function NodeButton({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: OrganizationNode;
  depth: number;
  selectedId: string;
  onSelect: (node: OrganizationNode) => void;
}) {
  const style = KIND_STYLE[node.kind];
  const Icon = style.icon;
  const active = selectedId === node.id;

  return (
    <div>
      <button
        onClick={() => onSelect(node)}
        className="w-full grid items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all"
        style={{
          gridTemplateColumns: '18px minmax(0, 1fr) auto',
          marginLeft: depth * 18,
          width: `calc(100% - ${depth * 18}px)`,
          background: active ? `${style.color}18` : 'rgba(255,255,255,0.025)',
          border: `1px solid ${active ? `${style.color}55` : 'rgba(255,255,255,0.06)'}`,
        }}
      >
        <Icon size={14} style={{ color: style.color }} />
        <div className="min-w-0">
          <div className="text-xs font-medium truncate" style={{ color: active ? style.color : 'var(--text-primary)' }}>
            {node.label}
          </div>
          {node.detail && (
            <div className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>
              {node.detail}
            </div>
          )}
        </div>
        <span className="rounded-full" style={{ width: 7, height: 7, background: statusColor(node.status), boxShadow: node.status === 'online' || node.status === 'healthy' ? `0 0 8px ${statusColor(node.status)}` : 'none' }} />
      </button>
      {node.children.map(child => (
        <NodeButton key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function MetaValue({ label, value }: { label: string; value: unknown }) {
  const display = Array.isArray(value)
    ? value.length ? value.join(', ') : 'none'
    : value === null || value === undefined || value === ''
      ? 'not registered'
      : String(value);

  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-[11px] mt-1 break-words" style={{ color: 'var(--text-primary)' }}>{display}</div>
    </div>
  );
}

function DetailPanel({ node }: { node: OrganizationNode }) {
  const style = KIND_STYLE[node.kind];
  const Icon = style.icon;
  const prompt = typeof node.meta?.prompt === 'string' ? node.meta.prompt : '';

  return (
    <div className="h-full rounded-2xl overflow-hidden" style={{ background: '#050807', border: `1px solid ${style.color}26` }}>
      <div className="p-4 flex items-start justify-between gap-3" style={{ borderBottom: `1px solid ${style.color}1f` }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg grid place-items-center" style={{ background: `${style.color}16`, border: `1px solid ${style.color}33` }}>
            <Icon size={18} style={{ color: style.color }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate" style={{ color: style.color }}>{node.label}</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{node.kind} · {node.source}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase font-mono" style={{ color: statusColor(node.status) }}>
          <span className="rounded-full" style={{ width: 7, height: 7, background: statusColor(node.status) }} />
          {node.status}
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-73px)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <MetaValue label="detail" value={node.detail} />
          <MetaValue label="children" value={node.children.length} />
          <MetaValue label="memory" value={node.meta?.memory} />
          <MetaValue label="skills" value={node.meta?.skills} />
          <MetaValue label="preferred models" value={node.meta?.preferredModels} />
          <MetaValue label="fallback models" value={node.meta?.fallbackModels} />
          <MetaValue label="permissions" value={node.meta?.permissions} />
          <MetaValue label="learning state" value={node.meta?.learningState ?? node.meta?.learningStatus} />
          <MetaValue label="activity" value={node.meta?.activity ?? node.meta?.lastTestAt ?? node.meta?.last_seen} />
          <MetaValue label="endpoint" value={node.meta?.baseUrl} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Prompt</div>
            <div className="flex items-center gap-1.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
              <ShieldCheck size={11} />
              read-only
            </div>
          </div>
          <pre className="text-[10px] leading-relaxed max-h-72 overflow-y-auto rounded-lg p-3"
            style={{ background: '#030505', border: '1px solid rgba(255,255,255,0.06)', color: prompt ? 'rgba(165,243,252,0.75)' : 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
            {prompt || 'Prompt is not registered in Supabase for this node.'}
          </pre>
        </div>

        {node.children.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Children</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {node.children.map(child => {
                const childStyle = KIND_STYLE[child.kind];
                return (
                  <div key={child.id} className="rounded-lg px-3 py-2" style={{ background: `${childStyle.color}0d`, border: `1px solid ${childStyle.color}22` }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium truncate" style={{ color: childStyle.color }}>{child.label}</span>
                      <span className="rounded-full" style={{ width: 6, height: 6, background: statusColor(child.status) }} />
                    </div>
                    {child.detail && <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>{child.detail}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Organization() {
  const [loading, setLoading] = useState(true);
  const [root, setRoot] = useState<OrganizationNode | null>(null);
  const [selected, setSelected] = useState<OrganizationNode | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const snapshot = await loadAxeOrganization();
    setRoot(snapshot.root);
    setSelected(snapshot.root.children[0] ?? snapshot.root);
    setGeneratedAt(snapshot.generatedAt);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const allNodes = useMemo(() => root ? flatten(root) : [], [root]);
  const specialistCount = allNodes.filter(node => node.kind === 'specialist').length;
  const liveCount = allNodes.filter(node => node.status === 'online' || node.status === 'healthy' || node.status === 'configured').length;

  return (
    <motion.div className="h-full flex flex-col overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>Organization</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            {loading ? 'Loading AXE CORE organization...' : `${liveCount}/${allNodes.length} registered · ${specialistCount} specialists · ${generatedAt ? new Date(generatedAt).toLocaleTimeString() : ''}`}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--accent-cyan)' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.35fr)] gap-3 p-4 flex-1 min-h-0 overflow-y-auto xl:overflow-hidden">
        <div className="rounded-2xl p-3 overflow-y-auto min-h-[420px]" style={{ background: '#030505', border: '1px solid rgba(255,255,255,0.06)' }}>
          {loading || !root ? (
            <div className="h-full grid place-items-center text-xs" style={{ color: 'var(--text-muted)' }}>Loading organization...</div>
          ) : (
            <NodeButton node={root} depth={0} selectedId={selected?.id ?? ''} onSelect={setSelected} />
          )}
        </div>
        <div className="min-h-[520px]">
          {selected ? <DetailPanel node={selected} /> : (
            <div className="h-full grid place-items-center rounded-2xl text-xs" style={{ color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}>
              Select a node
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
