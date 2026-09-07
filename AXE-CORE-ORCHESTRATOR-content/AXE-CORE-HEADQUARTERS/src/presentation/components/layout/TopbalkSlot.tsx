/**
 * Wat een tab in de topbalk hangt.
 *
 * Zelfde gedachte als TabRail: de schil zet een leeg vakje neer, de pagina
 * rendert erin. TopNav hoeft van geen enkele tab te weten wat hij is.
 *
 * Hier hoort wat ALTIJD zichtbaar moet zijn zolang je op die tab bent -- de
 * kill switch op trading, de batch-knop hier. Niet de dingen die je af en toe
 * nodig hebt; die horen in een schuifbalk.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function TopbalkSlot({ children }: { children: ReactNode }) {
  const [gastheer, setGastheer] = useState<HTMLElement | null>(
    () => (typeof document === 'undefined' ? null : document.getElementById('axe-slot-topbalk')),
  );
  useEffect(() => {
    if (gastheer) return;
    const obs = new MutationObserver(() => {
      const el = document.getElementById('axe-slot-topbalk');
      if (el) { setGastheer(el); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [gastheer]);
  return gastheer ? createPortal(children, gastheer) : null;
}
