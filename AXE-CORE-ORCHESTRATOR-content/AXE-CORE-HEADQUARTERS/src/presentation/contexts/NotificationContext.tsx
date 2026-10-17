import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { notificationText, collapseRepeats } from '@/domain/notification';
import { pasBadgeToe } from '@/infrastructure/pwa/appBadge';
import { kiesSysteemMeldingen, BEGINSTAND } from '@/domain/systeemMelding';
import { toonSysteemMeldingen } from '@/infrastructure/ui/systeemMelding';
import { startNotificationFeed } from '@/application/system/notificationFeed';
import { useAuth } from '@/presentation/contexts/AuthContext';

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
  const { user } = useAuth();
  const userId = user?.id;
  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const systeemStand = useRef(BEGINSTAND);

  useEffect(() => {
    if (!userId) return;
    const sb = getSupabase();
    // Nieuwe gebruiker of herstart: wat er dan al staat is de nulstand.
    systeemStand.current = BEGINSTAND;
    const feed = startNotificationFeed<NotificationItem>({
      load: async signal => {
        if (!sb) throw new Error('Supabase is not configured');
        const { data, error } = await sb.from('core_notifications')
          .select(SELECT_COLUMNS).order('created_at', { ascending: false })
          .limit(400).abortSignal(signal);
        if (error) throw new Error(error.message);
        return (data as NotificationRow[] ?? []).map(fromRow);
      },
      changed: items => {
        setRows(items);
        // Ook buiten de bel laten weten wat er binnenkomt (Tauri: het
        // meldingscentrum van macOS). Welke wel en welke niet: domain/systeemMelding.ts.
        const uit = kiesSysteemMeldingen(items, systeemStand.current, Date.now());
        systeemStand.current = uit.stand;
        toonSysteemMeldingen(uit.tonen);
      },
      failed: setLoadError,
    });

    const channel = sb
      ? sb
      .channel('core_notifications_live')
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'core_notifications' },
        // UPDATE/DELETE horen erbij: gelezen op Samsung moet ook op de Mac
        // gelezen zijn. REST-polling blijft doorlopen bij een kapotte stream.
        () => feed.refresh(),
      )
      .subscribe() : null;

    return () => { feed.stop(); if (sb && channel) void sb.removeChannel(channel); };
  }, [userId]);

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

  // Het cijfertje op het app-icoon gelijk houden met wat hier staat.
  //
  // De service worker zet bij een push een neutraal stipje, want die kent het
  // totaal niet. Zodra de app open is weten we het wél, dus dan komt het echte
  // aantal erop -- en verdwijnt de badge zodra je alles gelezen hebt. Zonder
  // dit blijft het stipje staan tot je het toestel herstart.
  useEffect(() => { pasBadgeToe(unreadCount); }, [unreadCount]);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loadError, addNotification, markAsRead, markAllAsRead, removeNotification, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
