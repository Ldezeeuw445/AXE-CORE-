/**
 * AppGrowthBadge — shows how many ThinkThanks capabilities were integrated
 * into target apps. Proof on Home that the system is growing end-to-end.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Sprout } from 'lucide-react';
import { listAppGrowth } from '@/infrastructure/persistence/thinkThanksService';

export function AppGrowthBadge() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState(0);

  const pull = () => {
    try {
      const all = listAppGrowth();
      setCount(all.length);
      const hourAgo = Date.now() - 60 * 60 * 1000;
      setRecent(all.filter(e => e.at >= hourAgo).length);
    } catch {
      setCount(0);
      setRecent(0);
    }
  };

  useEffect(() => {
    pull();
    const onChange = () => pull();
    window.addEventListener('axe-app-growth', onChange);
    window.addEventListener('axe-thinkthanks-changed', onChange);
    const t = window.setInterval(pull, 15_000);
    return () => {
      window.removeEventListener('axe-app-growth', onChange);
      window.removeEventListener('axe-thinkthanks-changed', onChange);
      window.clearInterval(t);
    };
  }, []);

  const growing = count > 0;
  const justGrew = recent > 0;

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/thinkthanks')}
      title={
        count > 0
          ? `App growth: ${count} integrated capabilities` +
            (recent > 0 ? `\n+${recent} in the last hour` : '')
          : 'Open THINKTHANKS — build & integrate to grow apps'
      }
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
      <span className="font-mono">{count > 0 ? `${count} grown` : 'grow'}</span>
      {justGrew && (
        <span className="font-mono text-[9px]" style={{ color: '#67e8f9' }}>
          +{recent}
        </span>
      )}
    </motion.button>
  );
}
