/**
 * MemoryGrowthBadge — live library size on Home (Neural Memory area).
 * Shows total durable nodes so you can see the brain grow.
 * Pulses when the library is non-empty / recently grew.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Library } from 'lucide-react';
import {
  loadMemoryGrowthStats,
  type MemoryGrowthStats,
} from '@/infrastructure/persistence/memoryStatsService';

export function MemoryGrowthBadge() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<MemoryGrowthStats | null>(null);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      void loadMemoryGrowthStats()
        .then((s) => {
          if (alive) setStats(s);
        })
        .catch(() => {});
    };
    pull();
    const t = window.setInterval(pull, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const total = stats?.total ?? 0;
  const delta = stats?.delta ?? 0;
  const label =
    total > 0
      ? `${total} nodes`
      : stats
        ? 'empty library'
        : '…';

  const growing = total > 0;
  const justGrew = delta > 0;

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/memory')}
      title={
        stats
          ? `Library: ${stats.noteCount} notes · ${stats.ragCount} facts · ${stats.globalCount} global` +
            (delta > 0 ? `\n+${delta} since last check` : '') +
            (stats.lastManagerMessage ? `\n${stats.lastManagerMessage}` : '')
          : 'Open Memory library'
      }
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-all relative"
      style={{
        background: justGrew
          ? 'rgba(52,211,153,0.22)'
          : growing
            ? 'rgba(16,185,129,0.14)'
            : 'rgba(16,185,129,0.06)',
        border: `1px solid ${justGrew ? 'rgba(52,211,153,0.85)' : growing ? 'rgba(16,185,129,0.55)' : 'rgba(16,185,129,0.25)'}`,
        color: growing ? 'var(--success)' : 'rgba(16,185,129,0.7)',
        boxShadow: justGrew
          ? '0 0 18px rgba(52,211,153,0.45)'
          : total > 20
            ? '0 0 12px rgba(16,185,129,0.2)'
            : 'none',
      }}
      animate={justGrew ? { scale: [1, 1.08, 1] } : growing ? { scale: [1, 1.02, 1] } : {}}
      transition={justGrew ? { duration: 0.6 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      {growing && (
        <span
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: '0 0 0 0 rgba(52,211,153,0.4)',
            animation: 'axe-mem-pulse 2.2s ease-out infinite',
          }}
        />
      )}
      <Library size={11} />
      <span className="font-mono">{label}</span>
      {justGrew && (
        <span className="font-mono text-[9px]" style={{ color: '#6ee7b7' }}>
          +{delta}
        </span>
      )}
      <style>{`
        @keyframes axe-mem-pulse {
          0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.35); }
          70% { box-shadow: 0 0 0 8px rgba(52,211,153,0); }
          100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
        }
      `}</style>
    </motion.button>
  );
}
