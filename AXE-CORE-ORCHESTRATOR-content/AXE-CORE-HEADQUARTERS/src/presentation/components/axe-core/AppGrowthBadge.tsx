/**
 * AppGrowthBadge — per-app ThinkThanks growth on Home.
 * Shows total grown + color dots for AXE Core / Companion / Memory / Trading.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Sprout } from 'lucide-react';
import {
  summarizeAppGrowth,
  type TargetApp,
} from '@/infrastructure/persistence/thinkThanksService';

type Row = { app: TargetApp; label: string; color: string; count: number; recent: number };

export function AppGrowthBadge() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);

  const pull = () => {
    try {
      setRows(summarizeAppGrowth());
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    pull();
    const onChange = () => pull();
    window.addEventListener('axe-app-growth', onChange);
    window.addEventListener('axe-thinkthanks-changed', onChange);
    window.addEventListener('axe-thinkthanks-repaired', onChange);
    const t = window.setInterval(pull, 15_000);
    return () => {
      window.removeEventListener('axe-app-growth', onChange);
      window.removeEventListener('axe-thinkthanks-changed', onChange);
      window.removeEventListener('axe-thinkthanks-repaired', onChange);
      window.clearInterval(t);
    };
  }, []);

  const total = rows.reduce((s, r) => s + r.count, 0);
  const recent = rows.reduce((s, r) => s + r.recent, 0);
  const growing = total > 0;
  const justGrew = recent > 0;
  const title = rows
    .map(r => `${r.label}: ${r.count}${r.recent ? ` (+${r.recent}h)` : ''}`)
    .join('\n');

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/thinkthanks')}
      title={total > 0 ? `App growth\n${title}` : 'Open THINKTHANKS — build & integrate to grow apps'}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-all relative"
      style={{
        background: justGrew
          ? 'rgba(34,211,238,0.22)'
          : growing
            ? 'rgba(34,211,238,0.12)'
            : 'rgba(34,211,238,0.05)',
        border: `1px solid ${justGrew ? 'rgba(34,211,238,0.85)' : growing ? 'rgba(34,211,238,0.5)' : 'rgba(34,211,238,0.22)'}`,
        color: growing ? '#22d3ee' : 'rgba(34,211,238,0.65)',
        boxShadow: justGrew ? '0 0 18px rgba(34,211,238,0.4)' : 'none',
      }}
      animate={justGrew ? { scale: [1, 1.08, 1] } : growing ? { scale: [1, 1.02, 1] } : {}}
      transition={justGrew ? { duration: 0.6 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <Sprout size={11} />
      <span className="font-mono">{total > 0 ? `${total} grown` : 'grow'}</span>
      {rows.some(r => r.count > 0) && (
        <span className="flex items-center gap-0.5 ml-0.5">
          {rows.map(r => (
            <span
              key={r.app}
              title={`${r.label}: ${r.count}`}
              className="inline-block rounded-full"
              style={{
                width: 6,
                height: 6,
                background: r.count > 0 ? r.color : 'rgba(255,255,255,0.12)',
                opacity: r.count > 0 ? 1 : 0.35,
                boxShadow: r.recent > 0 ? `0 0 6px ${r.color}` : 'none',
              }}
            />
          ))}
        </span>
      )}
      {justGrew && (
        <span className="font-mono text-[9px]" style={{ color: '#67e8f9' }}>
          +{recent}
        </span>
      )}
    </motion.button>
  );
}
