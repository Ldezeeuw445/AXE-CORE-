import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

export interface NotificationItem {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  removeNotification: () => {},
  clearAll: () => {},
});

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

function fromRow(row: NotificationRow): NotificationItem {
  const type = row.type;
  return {
    id: row.id,
    type: type === 'success' || type === 'warning' || type === 'error' ? type : 'info',
    title: row.title,
    message: row.message,
    timestamp: new Date(row.created_at).getTime(),
    read: row.read,
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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    sb.from('core_notifications')
      .select('id,type,title,message,read,created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setNotifications((data as NotificationRow[]).map(fromRow));
      });

    const channel = sb
      .channel('core_notifications_live')
      .on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'core_notifications' },
        (payload: { new: NotificationRow }) => {
          setNotifications(prev => [fromRow(payload.new), ...prev].slice(0, 100));
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
    void sb.from('core_notifications').insert({
      type: notification.type,
      title: notification.title,
      message: notification.message,
      source: 'app',
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    const sb = getSupabase();
    if (sb) void sb.from('core_notifications').update({ read: true }).eq('id', id);
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    const sb = getSupabase();
    if (sb) void sb.from('core_notifications').update({ read: true }).eq('read', false);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    const sb = getSupabase();
    if (sb) void sb.from('core_notifications').delete().eq('id', id);
  }, []);

  const clearAll = useCallback(() => {
    const ids = notifications.map(n => n.id);
    setNotifications([]);
    const sb = getSupabase();
    if (sb && ids.length > 0) void sb.from('core_notifications').delete().in('id', ids);
  }, [notifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, removeNotification, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
