import { isOpenTask } from '@/domain/tasks/taskStatus';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckSquare, Bell, Terminal, X } from 'lucide-react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { useNotifications } from '@/presentation/contexts/NotificationContext';
import { useVoiceStore } from '@/presentation/store/voiceStore';

type CoreTaskRow = {
  id: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

/**
 * Was `status !== 'done' && !== 'approved' && !== 'rejected'`, which counted
 * every completed, failed and cancelled task as still open — a table of 16
 * finished tasks reported "16 open". The durable worker writes `completed`,
 * never `done`, so the one status this excluded is the one nothing ever sets.
 * See domain/tasks/taskStatus for the single definition.
 */
function isOpenStatus(status: string): boolean {
  return isOpenTask(status);
}

function dueAtOf(row: CoreTaskRow): number | null {
  const raw = row.metadata?.dueAt;
  if (typeof raw !== 'string' || !raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'nu';
  if (min < 60) return `${min}m geleden`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}u geleden`;
  return `${Math.round(h / 24)}d geleden`;
}

/**
 * "Mission control" — the glanceable synthesis Home was missing: real open
 * tasks (with overdue called out), real unread notifications (peekable
 * inline, no need to leave Home), and whether AXE is waiting on an approval.
 * Every count here is a live Supabase read, nothing scripted.
 */
export function MissionControlStrip() {
  const navigate = useNavigate();
  const pendingExec = useVoiceStore(s => s.pendingExec);
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const [openTasks, setOpenTasks] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [showNotifPeek, setShowNotifPeek] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    const loadTaskCounts = async () => {
      const { data } = await sb.from('core_tasks').select('id,status,metadata').limit(200);
      const rows = (data ?? []) as CoreTaskRow[];
      const open = rows.filter(r => isOpenStatus(r.status));
      const now = Date.now();
      setOpenTasks(open.length);
      setOverdueTasks(open.filter(r => { const d = dueAtOf(r); return d !== null && d < now; }).length);
    };
    void loadTaskCounts();

    // Polled, not realtime: `core_tasks` isn't in the supabase_realtime
    // publication, so a postgres_changes subscription here can never fire —
    // it would just retry the websocket handshake forever. Found live
    // 2026-08-13 as a real, permanent contributor to a Realtime error burst
    // (923 errors/hour on the project dashboard) that Supabase's own support
    // flagged and asked us to throttle. 30s is cheap and bounded.
    const t = window.setInterval(() => void loadTaskCounts(), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const recentNotifications = notifications.slice(0, 5);

  return (
    <div className="relative flex-shrink-0 flex items-center gap-2 px-1">
      <button
        onClick={() => navigate('/tasks')}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
        style={{
          background: overdueTasks > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${overdueTasks > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border-subtle)'}`,
          color: overdueTasks > 0 ? 'rgb(248,113,113)' : 'var(--text-secondary)',
        }}
      >
        <CheckSquare size={11} />
        {openTasks} open{overdueTasks > 0 && <span style={{ color: 'rgb(248,113,113)' }}> · {overdueTasks} te laat</span>}
      </button>

      {pendingExec && (
        <motion.button
          onClick={() => window.dispatchEvent(new CustomEvent('axe-scroll-to-approval'))}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
          style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.35)', color: 'rgb(251,146,60)' }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Terminal size={11} /> Wacht op goedkeuring
        </motion.button>
      )}

      <div className="relative">
        <button
          onClick={() => setShowNotifPeek(v => !v)}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
          style={{
            background: unreadCount > 0 ? 'var(--tint)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${unreadCount > 0 ? 'var(--tint-line)' : 'var(--border-subtle)'}`,
            color: unreadCount > 0 ? 'var(--accent-cyan)' : 'var(--text-secondary)',
          }}
        >
          <Bell size={11} />
          {unreadCount > 0 ? `${unreadCount} nieuw` : 'geen nieuws'}
        </button>

        <AnimatePresence>
          {showNotifPeek && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-1.5 w-72 rounded-lg overflow-hidden z-30"
              style={{ background: '#0A0A0A', border: '1px solid var(--border-default)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}
            >
              <div className="flex items-center justify-between px-2.5 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Laatste meldingen</span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={markAllAsRead} className="text-[9px]" style={{ color: 'var(--accent-cyan)' }}>Alles gelezen</button>
                  )}
                  <button onClick={() => setShowNotifPeek(false)}><X size={11} style={{ color: 'var(--text-muted)' }} /></button>
                </div>
              </div>
              {recentNotifications.length === 0 ? (
                <div className="px-2.5 py-3 text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>No notifications yet</div>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {recentNotifications.map(n => (
                    <div key={n.id} className="px-2.5 py-1.5 flex flex-col gap-0.5" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: n.read ? 0.55 : 1 }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{n.title}</span>
                        <span className="text-[8px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{relativeTime(n.timestamp)}</span>
                      </div>
                      <span className="text-[9px] line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{n.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
