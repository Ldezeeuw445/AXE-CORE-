import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getSupabase } from '@/lib/supabaseClient';
import type { CoreAgent } from '@/components/widgets/AgentCard';
import { AgentCard } from '@/components/widgets/AgentCard';

export default function Agents() {
  const [agents, setAgents] = useState<CoreAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }
    sb.from('core_agents')
      .select('*')
      .order('role')
      .then(({ data }) => {
        if (data) setAgents(data as CoreAgent[]);
        setLoading(false);
      });
  }, []);

  const active = agents.filter((a) => a.status === 'active').length;

  return (
    <motion.div
      className="p-6 h-full overflow-y-auto"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <h1
        className="text-page-title font-semibold mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        Agent Center
      </h1>
      <p className="text-body mb-6" style={{ color: 'var(--text-secondary)' }}>
        {loading
          ? 'Loading agents from Supabase…'
          : `${active} active · ${agents.length} total · live from core_agents`}
      </p>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-xl animate-pulse"
              style={{ backgroundColor: 'var(--bg-surface)' }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
            >
              <AgentCard agent={agent} />
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
