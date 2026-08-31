/**
 * 2×2 workspace — Home · Trading · Browser · Code Editor.
 * Toggle via TopNav LayoutGrid; same origin iframes keep each pane independent.
 */
import { useNavigate } from 'react-router';
import { Home, LineChart, Compass, FileCode, Maximize2, X } from 'lucide-react';
import { useUIStore } from '@/presentation/store/uiStore';
import { motion, AnimatePresence } from 'framer-motion';

const PANES = [
  { path: '/', label: 'Home', icon: Home, color: 'var(--accent-cyan)' },
  { path: '/trading-intel', label: 'Trading', icon: LineChart, color: 'var(--warning)' },
  { path: '/browser', label: 'Browser', icon: Compass, color: '#a855f7' },
  { path: '/code-editor', label: 'Code', icon: FileCode, color: 'var(--success)' },
] as const;

export function SplitWorkspace() {
  const open = useUIStore(s => s.splitViewOpen);
  const setOpen = useUIStore(s => s.setSplitViewOpen);
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex flex-col"
          style={{ background: '#000', paddingTop: 'env(safe-area-inset-top)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-between px-3"
            style={{ height: 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-[11px] font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Split workspace · 4 panes
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition-all hover:bg-white/5"
              style={{ color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}
            >
              <Maximize2 size={12} />
              Single view
            </button>
          </div>

          <div className="flex-1 min-h-0 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))] grid-rows-4 sm:grid-rows-2 gap-px" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {PANES.map((pane) => {
              const Icon = pane.icon;
              return (
                <div key={pane.path} className="relative flex flex-col min-h-0 bg-black">
                  <div
                    className="flex-shrink-0 flex items-center justify-between px-2"
                    style={{ height: 28, background: 'var(--bg-surface)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon size={11} style={{ color: pane.color }} />
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>{pane.label}</span>
                    </div>
                    <button
                      type="button"
                      title="Open full screen"
                      onClick={() => { setOpen(false); navigate(pane.path); }}
                      className="p-1 rounded hover:bg-white/5"
                    >
                      <Maximize2 size={10} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </div>
                  <iframe
                    title={pane.label}
                    src={pane.path}
                    className="flex-1 w-full border-0 bg-black"
                    style={{ minHeight: 0 }}
                  />
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
