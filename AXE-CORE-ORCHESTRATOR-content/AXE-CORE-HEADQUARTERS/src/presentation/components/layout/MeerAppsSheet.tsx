/**
 * Bottom-sheet launcher for every nav destination not on the primary bar.
 * Opened from BottomNav "Meer" — same pattern as MobileMenuSheets.
 */
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router';
import { X } from 'lucide-react';
import { meerGroepen } from '@/domain/navRegistry';

export function MeerAppsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (!open || typeof document === 'undefined') return null;

  const groepen = meerGroepen();

  return createPortal(
    <div className="fixed inset-0 z-[110]" data-axe-meer-sheet="open">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Alle apps"
        className="absolute inset-x-0 bottom-0 flex max-h-[72%] flex-col"
        style={{
          background: 'linear-gradient(180deg, rgba(24,24,29,.98), rgba(10,12,16,.99))',
          borderTop: '1px solid rgba(255,255,255,.12)',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -18px 50px rgba(0,0,0,.55)',
          paddingBottom: 'max(14px, var(--axe-sab))',
        }}
      >
        <div className="flex flex-none items-center justify-between px-5 pb-1 pt-4">
          <span className="text-[15px] font-semibold" style={{ color: '#EEF3FA' }}>More</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full"
            style={{ color: '#9CA3AF', background: 'rgba(255,255,255,.06)' }}
          >
            <X size={16} />
          </button>
        </div>
        <p className="px-5 pb-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Every tab that is not in the dock, grouped. Tabs that only forwarded you elsewhere are gone.
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {groepen.map((g) => (
            <section key={g.titel} className="mb-4" aria-label={g.titel}>
              <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>{g.titel}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {g.items.map((item) => {
                  const active = location.pathname === item.path
                    || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`));
                  const oud = item.path === '/crewai';
                  return (
                    <button
                      key={item.path}
                      type="button"
                      data-axe-meer-pad={item.path}
                      onClick={() => { navigate(item.path); onClose(); }}
                      className="text-left rounded-2xl px-3 py-3 transition-colors"
                      style={{
                        background: active ? 'rgba(34,211,238,.12)' : oud ? 'rgba(255,255,255,.02)' : 'rgba(18,20,24,.88)',
                        border: active ? '1px solid rgba(34,211,238,.35)' : oud ? '1px dashed rgba(255,255,255,.12)' : '1px solid rgba(255,255,255,.07)',
                        color: active ? 'var(--accent-cyan)' : oud ? 'var(--text-secondary)' : 'var(--text-primary)',
                      }}
                    >
                      <span className="block text-[13px] font-semibold leading-tight">{item.label}</span>
                      {item.uitleg && (
                        <span className="mt-1 block truncate text-[11px]" style={{ color: 'var(--text-muted)' }} title={item.uitleg}>{item.uitleg}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
