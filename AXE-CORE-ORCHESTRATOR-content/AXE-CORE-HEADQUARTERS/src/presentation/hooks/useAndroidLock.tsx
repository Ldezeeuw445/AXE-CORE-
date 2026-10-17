/**
 * Houdt de Samsung op slot tot de cijfer-PIN klopt, en sluit weer bij achtergrond.
 *
 * Na de native lockscreen (swipe) mag er geen tweede particle-scherm komen.
 * Geen PIN of kapotte opslag: meteen de telefoon-Home. Alleen een échte
 * cijfer-PIN toont het keypad. Desktop slaat dit over.
 */
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { isAndroidTauriRuntime, isAndroidShellRuntime } from '@/infrastructure/config/apiUrl';
import {
  androidPinPad,
  bewaarTerugPad,
  isOntgrendeld,
  naOntgrendelenPad,
  ontgrendel,
  telefoonPinNodig,
  vergrendel,
} from '@/domain/androidPin';

function androidOppervlakActief(): boolean {
  return isAndroidTauriRuntime() || isAndroidShellRuntime();
}

export function AndroidLockGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [tik, setTik] = useState(0);
  /** null = nog bezig; false = geen PIN; true = keypad. */
  const [pinNodig, setPinNodig] = useState<boolean | null>(
    () => (androidOppervlakActief() && !isOntgrendeld() ? null : false),
  );

  useEffect(() => {
    if (!androidOppervlakActief()) return;
    if (!androidPinPad(location.pathname)) bewaarTerugPad(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (!androidOppervlakActief()) return;
    const opZicht = () => {
      if (document.visibilityState === 'hidden') {
        vergrendel();
        setPinNodig(null);
      }
      setTik((n) => n + 1);
    };
    document.addEventListener('visibilitychange', opZicht);
    window.addEventListener('pagehide', opZicht);
    return () => {
      document.removeEventListener('visibilitychange', opZicht);
      window.removeEventListener('pagehide', opZicht);
    };
  }, []);

  useEffect(() => {
    if (!androidOppervlakActief()) return;
    if (isOntgrendeld()) {
      queueMicrotask(() => setPinNodig(false));
      return;
    }
    let alive = true;
    void telefoonPinNodig().then((nodig) => {
      if (!alive) return;
      if (isOntgrendeld()) {
        setPinNodig(false);
        return;
      }
      if (!nodig) ontgrendel();
      setPinNodig(nodig);
    }).catch(() => {
      if (!alive) return;
      ontgrendel();
      setPinNodig(false);
    });
    return () => { alive = false; };
  }, [tik, location.pathname]);

  if (!androidOppervlakActief()) return <>{children}</>;

  if (isOntgrendeld() || pinNodig === false) {
    if (location.pathname === '/lock' || location.pathname === '/lock/pin') {
      return <Navigate to={naOntgrendelenPad()} replace />;
    }
    return <>{children}</>;
  }

  if (pinNodig === null) {
    return (
      <div
        data-axe-lock-wacht
        className="h-[100dvh] w-full bg-black"
        aria-busy="true"
        aria-label="Unlocking"
      />
    );
  }

  if (location.pathname === '/login') return <>{children}</>;
  if (location.pathname === '/lock/pin') return <>{children}</>;
  return <Navigate to="/lock/pin" replace />;
}
