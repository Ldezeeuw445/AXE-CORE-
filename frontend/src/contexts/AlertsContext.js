import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { alerts as alertsApi } from "../lib/api";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

const Ctx = createContext(null);
export const useAlerts = () => useContext(Ctx);

const POLL_MS = 15000;

export function AlertsProvider({ children }) {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [unread, setUnread] = useState(0);
  const [rules, setRules] = useState([]);
  const lastEventIdsRef = useRef(new Set());

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await alertsApi.events(60, false);
      const incoming = data?.items || [];
      // Detect new events for toasts
      const known = lastEventIdsRef.current;
      const news = incoming.filter((e) => !known.has(e.id));
      // Only toast if we've already loaded at least once (skip first-load)
      if (known.size > 0 && news.length > 0) {
        news.slice(0, 3).forEach((e) => {
          toast.message(`⚠ ${e.name}`, {
            description: e.summary,
            duration: 6000,
          });
        });
      }
      lastEventIdsRef.current = new Set(incoming.map((e) => e.id));
      setEvents(incoming);
      setUnread(data?.unread || 0);
    } catch (e) {
      console.error("alerts refresh", e);
    }
  }, [token]);

  const refreshRules = useCallback(async () => {
    if (!token) return;
    try { const r = await alertsApi.rules(); setRules(r || []); }
    catch (e) { console.error("alerts rules", e); }
  }, [token]);

  useEffect(() => {
    if (!token) { setEvents([]); setUnread(0); setRules([]); return; }
    refresh(); refreshRules();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [token, refresh, refreshRules]);

  const ack = useCallback(async (id) => {
    try { await alertsApi.ackEvent(id); await refresh(); } catch {}
  }, [refresh]);

  const ackAll = useCallback(async () => {
    try { await alertsApi.ackAll(); await refresh(); } catch {}
  }, [refresh]);

  return (
    <Ctx.Provider value={{ events, unread, rules, refresh, refreshRules, ack, ackAll }}>
      {children}
    </Ctx.Provider>
  );
}
