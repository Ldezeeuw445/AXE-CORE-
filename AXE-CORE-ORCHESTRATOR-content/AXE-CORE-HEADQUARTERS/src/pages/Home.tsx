import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Network, ArrowRight, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { TriangleLogo } from '@/components/axe-core/TriangleLogo';
import { useUIStore } from '@/store/uiStore';

export default function Home() {
  const navigate = useNavigate();
  const { setRightPanelOpen } = useUIStore();

  useEffect(() => {
    setRightPanelOpen(false);
    return () => setRightPanelOpen(true);
  }, [setRightPanelOpen]);

  return (
    <motion.div
      className="h-full overflow-hidden grid place-items-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-center mb-6">
          <TriangleLogo size={58} animate />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>AXE CORE</h1>
          <p className="text-xs-custom mt-2" style={{ color: 'var(--text-muted)' }}>
            AI Operating System · Organization-first control
          </p>
        </div>

        <button
          onClick={() => navigate('/organization')}
          className="group w-full rounded-2xl px-5 py-5 flex items-center justify-between gap-4 text-left transition-all"
          style={{
            background: 'rgba(34,211,238,0.08)',
            border: '1px solid rgba(34,211,238,0.28)',
            boxShadow: '0 0 28px rgba(34,211,238,0.08)',
          }}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-12 w-12 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.28)' }}>
              <Network size={22} style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold" style={{ color: 'var(--accent-cyan)' }}>Organization</div>
              <div className="text-xs-custom mt-0.5" style={{ color: 'var(--text-muted)' }}>
                AXE CORE {'->'} Orchestrator {'->'} Specialists {'->'} Providers {'->'} Models {'->'} Tools {'->'} Infrastructure
              </div>
            </div>
          </div>
          <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" style={{ color: 'var(--accent-cyan)' }} />
        </button>

        <div className="mt-4 flex items-center justify-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <ShieldCheck size={12} />
          <span>Runtime decisions stay internal. This entry is read-only organization visibility.</span>
        </div>
      </div>
    </motion.div>
  );
}
