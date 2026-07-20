import { useState, useRef, useEffect } from 'react';
import { Bell, Check, X, Trash2 } from 'lucide-react';
import { useNotifications } from '@/app/providers/NotificationContext';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
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
            {notifications.length === 0 ? (
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
                    onClick={() => markAsRead(n.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 shrink-0 w-2 h-2 rounded-full"
                        style={{
                          background: n.type === 'error' ? '#ef4444' : n.type === 'warning' ? '#f59e0b' : n.type === 'success' ? '#22c55e' : 'var(--accent-cyan)',
                          boxShadow: `0 0 6px ${n.type === 'error' ? '#ef4444' : n.type === 'warning' ? '#f59e0b' : n.type === 'success' ? '#22c55e' : 'var(--accent-cyan)'}`,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{n.title}</span>
                          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{formatTime(n.timestamp)}</span>
                        </div>
                        <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
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
