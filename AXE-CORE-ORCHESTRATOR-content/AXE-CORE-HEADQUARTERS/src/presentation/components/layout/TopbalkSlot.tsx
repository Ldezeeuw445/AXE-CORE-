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

/**
 * Twee plekken, geen een.
 *
 * Links staat na CORE ACTIVE, rechts vlak voor de klok. De browser had een
 * eigen zwarte werkbalk met navigatieknoppen links en gereedschap rechts; die
 * balk was een tweede kopregel onder de echte en at een hele strook scherm.
 * Zijn knoppen horen in de balk die er al is, aan de kant waar ze stonden.
 */
export type TopbalkKant = 'links' | 'rechts';

const HOSTS: Record<TopbalkKant, string> = {
  links: 'axe-slot-topbalk',
  rechts: 'axe-slot-topbalk-rechts',
};

export function TopbalkSlot({ children, kant = 'links' }: { children: ReactNode; kant?: TopbalkKant }) {
  const id = HOSTS[kant];
  const [gastheer, setGastheer] = useState<HTMLElement | null>(
    () => (typeof document === 'undefined' ? null : document.getElementById(id)),
  );
  useEffect(() => {
    setGastheer(document.getElementById(id));
  }, [id]);
  useEffect(() => {
    if (gastheer) return;
    const obs = new MutationObserver(() => {
      const el = document.getElementById(id);
      if (el) { setGastheer(el); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [gastheer, id]);
  return gastheer ? createPortal(children, gastheer) : null;
}
