/**
 * De rand om een zwevend venster (notities, telefoon): een sleepstrook bovenin, vastpinnen,
 * sluiten en een greep om te vergroten. Het venster is randloos en transparant; dit tekent wat de OS-rand
 * niet meer doet. Slepen, vergroten en sluiten laat dit aan Tauri zelf (zie zwevendeVensters.ts).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Pin, PinOff, X } from 'lucide-react';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { closeCurrentAuxWindow } from '@/infrastructure/gateways/windowManagerService';
import { bewaarFrame, type ZwevendType } from '@/infrastructure/gateways/zwevendeVensters';

async function huidig() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export function FloatChrome({ type, titel, kop, kind }: { type: ZwevendType; titel: string; kop?: ReactNode; kind: ReactNode }) {
  const [boven, setBoven] = useState(true);

  // Transparant tot aan de rand: anders staat er een zwart vlak achter de afgeronde hoeken.
  useEffect(() => {
    const prev = [document.documentElement.style.background, document.body.style.background];
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => { document.documentElement.style.background = prev[0]; document.body.style.background = prev[1]; };
  }, []);

  // Plek en maat onthouden, zodat het venster er de volgende keer weer staat -- ook op het tweede scherm.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let weg: Array<() => void> = [];
    let stop = false;
    void (async () => {
      const w = await huidig();
      let timer: number | undefined;
      const bewaar = async () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(async () => {
          try {
            const [p, s, f] = await Promise.all([w.outerPosition(), w.outerSize(), w.scaleFactor()]);
            bewaarFrame(type, { x: Math.round(p.x / f), y: Math.round(p.y / f), b: Math.round(s.width / f), h: Math.round(s.height / f) });
          } catch { /* venster is net dicht */ }
        }, 250);
      };
      const a = await w.onMoved(bewaar);
      const b = await w.onResized(bewaar);
      if (stop) { a(); b(); return; }
      weg = [a, b];
      void bewaar();
    })();
    return () => { stop = true; weg.forEach(f => f()); };
  }, [type]);

  const pin = async () => {
    const nieuw = !boven;
    setBoven(nieuw);
    if (isTauriRuntime()) await (await huidig()).setAlwaysOnTop(nieuw);
  };
  const vergroot = async (richting: 'SouthEast' | 'SouthWest') => {
    if (isTauriRuntime()) await (await huidig()).startResizeDragging(richting);
  };

  return (
    <div className="axe-float" data-type={type}>
      <header className="axe-float__kop" data-tauri-drag-region>
        <span className="axe-float__titel" data-tauri-drag-region>{titel}</span>
        <span className="axe-float__midden" data-tauri-drag-region>{kop}</span>
        <button type="button" onClick={() => void pin()} aria-pressed={boven} title={boven ? 'Stays on top of everything' : 'Pin on top'} aria-label="Pin on top">
          {boven ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        <button type="button" onClick={() => void closeCurrentAuxWindow()} title="Close" aria-label="Close"><X size={15} /></button>
      </header>
      <div className="axe-float__lijf">{kind}</div>
      <i className="axe-float__greep axe-float__greep--zo" onMouseDown={() => void vergroot('SouthEast')} aria-hidden="true" />
      <i className="axe-float__greep axe-float__greep--zw" onMouseDown={() => void vergroot('SouthWest')} aria-hidden="true" />
    </div>
  );
}
