import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { PageHeader, StatPill } from '@/presentation/components/ui/AxeUI';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import type { CoreAgent } from '@/presentation/components/widgets/AgentCard';
import { AgentCard } from '@/presentation/components/widgets/AgentCard';

export default function Agents() {
  const [agents, setAgents] = useState<CoreAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const agentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }
    sb.from('core_agents')
      .select('*')
      .order('role')
      .then(({ data }) => {
        if (data) {
          const filtered = (data as CoreAgent[]).filter(a => {
            const role = (a.role ?? '').toLowerCase();
            const name = (a.name ?? '').toLowerCase();
            return !['trader', 'orchestrator'].some(v => role.includes(v) || name.includes(v));
          });
          setAgents(filtered);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!openId || loading) return;
    const agent = agents.find(a => a.id === openId);
    if (!agent) return;
    setHighlightedId(openId);
    requestAnimationFrame(() => {
      agentRefs.current[openId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clearParams = new URLSearchParams(searchParams);
    clearParams.delete('open');
    setSearchParams(clearParams, { replace: true });
    const timer = setTimeout(() => setHighlightedId(null), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading, agents]);

  const active = agents.filter((a) => a.status === 'active').length;

  return (
    <motion.div
      className="p-6 h-full overflow-y-auto"
      style={{ background: 'var(--bg-base)' }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <PageHeader
        eyebrow="Workforce"
        title="Agent Center"
        description={loading ? 'Loading agents from Supabase…' : 'Live roster from core_agents — status, skills, and routing.'}
      />
      <div className="flex flex-wrap gap-2 mb-5">
        <StatPill label="Active" value={loading ? '—' : active} tone="success" />
        <StatPill label="Total" value={loading ? '—' : agents.length} tone="cyan" />
        <StatPill label="Source" value="core_agents" tone="neutral" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-xl animate-pulse"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.04)' }}
            />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div
          className="rounded-xl px-6 py-14 text-center"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.08)' }}
        >
          <div className="text-[14px] font-medium" style={{ color: '#F5F0E6' }}>No agents yet</div>
          <p className="mt-1.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Populate core_agents in Supabase to see the workforce here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              ref={el => { agentRefs.current[agent.id] = el; }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
            >
              <AgentCard agent={agent} highlighted={highlightedId === agent.id} />
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
