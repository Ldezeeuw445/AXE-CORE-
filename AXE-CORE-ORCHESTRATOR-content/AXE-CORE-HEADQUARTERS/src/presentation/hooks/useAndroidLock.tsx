/**
 * Houdt de Samsung op slot tot de PIN klopt, en sluit weer bij achtergrond.
 * Desktop slaat dit over.
 */
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { isAndroidTauriRuntime, isAndroidShellRuntime } from '@/infrastructure/config/apiUrl';
import { androidSlotLaatDoor, bewaarTerugPad, isOntgrendeld, vergrendel } from '@/domain/androidPin';

function androidOppervlakActief(): boolean {
  return isAndroidTauriRuntime() || isAndroidShellRuntime();
}

export function AndroidLockGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [, setTik] = useState(0);

  useEffect(() => {
    if (!androidOppervlakActief()) return;
    if (!androidSlotLaatDoor(location.pathname)) bewaarTerugPad(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (!androidOppervlakActief()) return;
    const opZicht = () => {
      if (document.visibilityState === 'hidden') vergrendel();
      setTik((n) => n + 1);
    };
    document.addEventListener('visibilitychange', opZicht);
    window.addEventListener('pagehide', opZicht);
    return () => {
      document.removeEventListener('visibilitychange', opZicht);
      window.removeEventListener('pagehide', opZicht);
    };
  }, []);

  if (!androidOppervlakActief()) return <>{children}</>;
  if (isOntgrendeld()) return <>{children}</>;
  if (androidSlotLaatDoor(location.pathname)) return <>{children}</>;
  return <Navigate to="/lock" replace />;
}
