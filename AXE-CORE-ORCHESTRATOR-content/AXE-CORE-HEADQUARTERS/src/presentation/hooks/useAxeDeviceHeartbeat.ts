import { useEffect } from 'react';
import { useAuth } from '@/presentation/contexts/AuthContext';
import { isIngebed } from '@/presentation/components/layout/zweef/ingebed';
import { heartbeatDitToestel } from '@/infrastructure/gateways/axeDeviceService';

const INTERVAL_MS = 25_000;

/**
 * Zegt tegen AXE dat deze installatie er is. Alleen ingelogd, en niet in het
 * telefoon-iframe op Home (die kopie mag geen tweede heartbeat sturen).
 */
export function useAxeDeviceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || isIngebed()) return;
    let stop = false;
    const tik = () => {
      if (stop || document.visibilityState === 'hidden') return;
      void heartbeatDitToestel();
    };
    tik();
    const id = window.setInterval(tik, INTERVAL_MS);
    const opZicht = () => { if (document.visibilityState === 'visible') tik(); };
    document.addEventListener('visibilitychange', opZicht);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', opZicht);
    };
  }, [user]);
}
