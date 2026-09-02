import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Check, X, Trash2 } from 'lucide-react';
import { useNotifications } from '@/presentation/contexts/NotificationContext';
import { meaningVar, meaningVarDim } from '@/domain/meaning';
import { meaningOfNotification, notificationTarget } from '@/domain/notification';
import { cn } from '@/shared/utils';

export function NotificationBell() {
  const { notifications, unreadCount, loadError, markAsRead, markAllAsRead, removeNotification, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg transition-colors"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 flex items-center justify-center text-[9px] font-bold rounded-full"
            style={{
              width: 14,
              height: 14,
              background: 'var(--accent-cyan)',
              color: '#000',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] flex flex-col rounded-xl overflow-hidden"
          style={{
            background: '#0A0A0A',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
            zIndex: 9999,
          }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  title="Mark all as read"
                >
                  <Check size={14} />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  title="Clear all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* An empty list and a broken list must not look the same. They did:
                the load query asked for a column that does not exist, and a
                bell reading zero was taken for a quiet system for a month
                while 186 unread rows sat in the table. */}
            {loadError ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 px-6 text-center">
                <Bell size={24} style={{ color: meaningVar('broken'), opacity: 0.5 }} />
                <span className="text-xs" style={{ color: meaningVar('broken') }}>Meldingen konden niet geladen worden</span>
                <span className="text-[10px] font-mono-data" style={{ color: 'var(--text-muted)' }}>{loadError}</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Bell size={24} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No notifications yet</span>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn('px-4 py-3 transition-colors cursor-pointer', !n.read && 'bg-white/[0.02]')}
                    onClick={() => {
                      markAsRead(n.id);
                      // Only when there is somewhere to actually act on it.
                      // A link that lands on a plausible-looking page teaches
                      // people that clicking is a waste, and then they stop
                      // clicking the ones that would have helped.
                      const target = notificationTarget(n.message);
                      if (target) { setOpen(false); navigate(target.route); }
                    }}
                    title={notificationTarget(n.message)?.why ? `Klik: naar ${notificationTarget(n.message)?.why}` : undefined}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 shrink-0 w-2 h-2 rounded-full"
                        // Was a fourth set of greens and reds: #22c55e appears
                        // nowhere else in the app, and #ef4444 is not --error.
                        // On the one surface whose whole premise is that colour
                        // carries information.
                        style={{
                          background: meaningVar(meaningOfNotification(n.type)),
                          boxShadow: `0 0 6px ${meaningVar(meaningOfNotification(n.type))}`,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{n.title}</span>
                          <span className="text-[10px] shrink-0 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                            {/* 173 of 186 rows were the same sentence. As a
                                count it is one fact; as 173 lines it buried the
                                twelve that said something else. */}
                            {n.repeats > 1 && (
                              <span
                                className="px-1.5 py-0.5 rounded-full font-mono-data"
                                style={{ background: meaningVarDim(meaningOfNotification(n.type)), color: meaningVar(meaningOfNotification(n.type)) }}
                                title={`${n.repeats}× — laatste hieronder`}
                              >
                                {n.repeats}×
                              </span>
                            )}
                            {formatTime(n.timestamp)}
                          </span>
                        </div>
                        {n.detail && (
                          <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{n.detail}</p>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                        className="p-1 rounded transition-colors shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
