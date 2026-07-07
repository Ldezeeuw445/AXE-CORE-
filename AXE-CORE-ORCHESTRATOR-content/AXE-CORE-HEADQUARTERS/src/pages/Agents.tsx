import { motion } from 'framer-motion';
import { agents } from '@/lib/mockData';
import { AgentCard } from '@/components/widgets/AgentCard';

export default function Agents() {
  return (
    <motion.div
      className="p-6 h-full overflow-y-auto"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <h1
        className="text-page-title font-semibold mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Agent Center
      </h1>
      <p className="text-body mb-6" style={{ color: 'var(--text-secondary)' }}>
        {agents.filter((a) => a.status === 'active').length} active agents · {agents.length} total
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.3 }}
          >
            <AgentCard agent={agent} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
