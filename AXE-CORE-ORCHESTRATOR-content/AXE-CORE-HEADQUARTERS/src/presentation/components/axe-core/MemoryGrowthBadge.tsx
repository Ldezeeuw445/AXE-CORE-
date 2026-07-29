/**
 * MemoryGrowthBadge — live library size on Home (Neural Memory area).
 * Shows total durable nodes so you can see the brain grow.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
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
    void loadMemoryGrowthStats()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {});
    const t = window.setInterval(() => {
      void loadMemoryGrowthStats()
        .then((s) => {
          if (alive) setStats(s);
        })
        .catch(() => {});
    }, 45_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const total = stats?.total ?? 0;
  const label =
    total > 0
      ? `${total} nodes`
      : stats
        ? 'empty library'
        : '…';

  return (
    <button
      type="button"
      onClick={() => navigate('/memory')}
      title={
        stats
          ? `Library: ${stats.noteCount} notes · ${stats.ragCount} facts · ${stats.globalCount} global` +
            (stats.lastManagerMessage ? `\n${stats.lastManagerMessage}` : '')
          : 'Open Memory library'
      }
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-all"
      style={{
        background:
          total > 0 ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.06)',
        border: `1px solid ${total > 0 ? 'rgba(16,185,129,0.55)' : 'rgba(16,185,129,0.25)'}`,
        color: total > 0 ? '#34d399' : 'rgba(16,185,129,0.7)',
        boxShadow: total > 20 ? '0 0 12px rgba(16,185,129,0.2)' : 'none',
      }}
    >
      <Library size={11} />
      <span className="font-mono">{label}</span>
    </button>
  );
}
