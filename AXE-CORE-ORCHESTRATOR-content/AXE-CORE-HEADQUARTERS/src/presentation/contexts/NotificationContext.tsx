import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { notificationText, collapseRepeats } from '@/domain/notification';

export interface NotificationItem {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  /** Read out of the message — see domain/notification.ts. */
  title: string;
  /** The rest of the message, after the subject. */
  detail: string;
  /** The stored text, unchanged; grouping is done on this. */
  message: string;
  timestamp: number;
  read: boolean;
  /** How many times this same subject appeared. 1 for a one-off. */
  repeats: number;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  /**
   * Why the list is empty, when it is empty for a bad reason.
   *
   * This exists because of exactly one incident: the load query asked for a
   * column that does not exist, supabase-js returns that as a value rather
   * than throwing, nobody looked, and a bell reading zero was taken for a
   * quiet system for a month while 186 unread rows sat in the table. An empty
   * list and a broken list must not look the same.
   */
  loadError: string | null;
  addNotification: (notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  loadError: null,
  addNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  removeNotification: () => {},
  clearAll: () => {},
});

/**
 * The row as core_notifications ACTUALLY is.
 *
 * Measured 2026-08-27: id, recipient, type, message, read, created_at. There is
 * no `title` and no `source`, and both were being asked for -- the select for
 * `title` returned 42703 and killed the whole load, while inserts naming
 * `source` were rejected and lost. The subject now comes out of the message,
 * which has the double advantage of working for the 186 rows already stored.
 */
type NotificationRow = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
};

const SELECT_COLUMNS = 'id,type,message,read,created_at';

function fromRow(row: NotificationRow): NotificationItem {
  const type = row.type;
  const { title, detail } = notificationText(row.message);
  return {
    id: row.id,
    type: type === 'success' || type === 'warning' || type === 'error' ? type : 'info',
    title,
    detail,
    message: row.message,
    timestamp: new Date(row.created_at).getTime(),
    read: row.read,
    repeats: 1,
  };
}

/**
 * Real notifications, backed by core_notifications (Supabase) — this used to
 * be pure in-memory state with a dead addNotification nobody called, so the
 * bell was permanently empty. Now: hydrated on load, live-updated via a
 * Supabase realtime subscription (so a notification inserted by the VPS cron
 * scheduler shows up without a refresh), and every action here persists.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    sb.from('core_notifications')
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false })
      // 400 rather than 100: with repeats collapsed, a hundred rows was a
      // handful of distinct subjects, and the older ones were simply invisible.
      .limit(400)
      .then(({ data, error }) => {
        // Checked, and kept. Silence was the entire bug.
        if (error) { setLoadError(error.message); return; }
        setLoadError(null);
        if (data) setRows((data as NotificationRow[]).map(fromRow));
      });

    const channel = sb
      .channel('core_notifications_live')
      .on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'core_notifications' },
        (payload: { new: NotificationRow }) => {
          setRows(prev => [fromRow(payload.new), ...prev].slice(0, 400));
        },
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, []);

  const addNotification = useCallback((notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
    const sb = getSupabase();
    if (!sb) return;
    // Optimistic local item so the bell updates instantly; the realtime
    // subscription's INSERT event will arrive for the real row too, but by
    // then this temp id is gone from the DB-driven refresh path — harmless
    // dedupe isn't needed since we don't re-fetch on every insert.
    // Only columns that exist. The title rides in the message under the same
    // "subject: detail" shape every other writer uses, so it reads back out.
    void sb.from('core_notifications').insert({
      type: notification.type,
      message: notification.title ? `${notification.title}: ${notification.message}` : notification.message,
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setRows(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    const sb = getSupabase();
    if (sb) void sb.from('core_notifications').update({ read: true }).eq('id', id);
  }, []);

  const markAllAsRead = useCallback(() => {
    setRows(prev => prev.map(n => ({ ...n, read: true })));
    const sb = getSupabase();
    if (sb) void sb.from('core_notifications').update({ read: true }).eq('read', false);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setRows(prev => prev.filter(n => n.id !== id));
    const sb = getSupabase();
    if (sb) void sb.from('core_notifications').delete().eq('id', id);
  }, []);

  const clearAll = useCallback(() => {
    const ids = rows.map(n => n.id);
    setRows([]);
    const sb = getSupabase();
    if (sb && ids.length > 0) void sb.from('core_notifications').delete().in('id', ids);
  }, [rows]);

  // 173 of the 186 stored rows are the same sentence about a provider dropping
  // out. As 173 lines they bury the twelve that say something else; as one line
  // and a count they are one fact, which is what they are.
  const notifications = collapseRepeats(rows).map(item => ({
    ...item,
    // A group is unread while any occurrence in it is.
    read: rows.filter(r => notificationText(r.message).title === item.title).every(r => r.read),
  }));
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loadError, addNotification, markAsRead, markAllAsRead, removeNotification, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
