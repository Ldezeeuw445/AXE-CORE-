/**
 * De plek in een telefoonlade waar een zijslot heen schuift zolang die lade
 * open is. De gastheer zelf en de parkeerplaats staan in ladeSloten.ts.
 */
import { useLayoutEffect, useRef } from 'react';
import { SLOT_ID } from '@/presentation/components/layout/PlaatSlots';
import { terugNaarParkeerplaats, type LadeNaam } from '@/presentation/components/layout/ladeSloten';

export function LadeSlot({ naam }: { naam: LadeNaam }) {
  const plekRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const plek = plekRef.current;
    const gastheer = document.getElementById(SLOT_ID[naam]);
    if (!plek || !gastheer || gastheer.dataset.lade !== naam) return;
    plek.appendChild(gastheer);
    return () => terugNaarParkeerplaats(gastheer);
  }, [naam]);
  return <div ref={plekRef} className="axe-lade-slotplek" />;
}
