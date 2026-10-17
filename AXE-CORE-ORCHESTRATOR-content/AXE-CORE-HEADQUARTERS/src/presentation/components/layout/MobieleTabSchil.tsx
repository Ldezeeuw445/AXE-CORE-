/**
 * Schil van elke telefoontab behalve Home en lock.
 * Vol scherm in de plaat, trek-omlaag-ververs, geen zijwaartse scroll.
 * Desktop ziet dit component niet — AppShell hangt hem alleen aan opPlaatMobiel.
 */
import { useCallback, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';

const DREMPEL = 64;

export function MobieleTabSchil({ children }: { children: ReactNode }) {
  const vak = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [trek, setTrek] = useState(0);
  const [bezig, setBezig] = useState(false);

  const ververs = useCallback(() => {
    setBezig(true);
    window.dispatchEvent(new Event('axe-mobiel-ververs'));
    void Promise.resolve(verversServerAgents()).finally(() => {
      window.setTimeout(() => {
        setBezig(false);
        setTrek(0);
      }, 400);
    });
  }, []);

  const opStart = (e: TouchEvent) => {
    const el = vak.current;
    if (!el || el.scrollTop > 0) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0]?.clientY ?? null;
  };
  const opBeweeg = (e: TouchEvent) => {
    if (startY.current == null || bezig) return;
    const y = e.touches[0]?.clientY ?? startY.current;
    setTrek(Math.max(0, Math.min(88, y - startY.current)));
  };
  const opEind = () => {
    if (startY.current == null) return;
    if (trek >= DREMPEL) ververs();
    else setTrek(0);
    startY.current = null;
  };

  return (
    <div
      ref={vak}
      className="axe-mobiel-tab-schil"
      data-axe-mobiel-tab
      onTouchStart={opStart}
      onTouchMove={opBeweeg}
      onTouchEnd={opEind}
      onTouchCancel={opEind}
    >
      <div
        className="axe-mobiel-ververs"
        data-bezig={bezig ? 'ja' : undefined}
        style={{ height: bezig ? 36 : trek }}
        aria-hidden="true"
      >
        {(bezig || trek > 20) && <span>{bezig ? 'Refreshing' : 'Release to refresh'}</span>}
      </div>
      <div className="axe-mobiel-tab-lijf">{children}</div>
    </div>
  );
}
