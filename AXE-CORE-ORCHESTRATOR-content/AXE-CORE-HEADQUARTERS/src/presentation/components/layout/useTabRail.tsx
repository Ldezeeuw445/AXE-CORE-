/**
 * Een pagina vult de schuifbalken van de schil.
 *
 * ## Waarom een portal en geen context met state
 *
 * De eerste versie hield het gemelde stuk JSX in React-state. Dat is een lus:
 * een React-element is elke render een nieuw object, dus de vergelijking
 * `vorige === nieuw` is altijd onwaar, dus elke render zette state, dus de
 * provider rendeerde, dus de pagina rendeerde, dus er was een nieuw element.
 * Die versie is uitgeleverd en draaide op de trading-tab.
 *
 * Een portal heeft dat probleem niet: er is geen staat om te vergelijken. De
 * schil zet een leeg vakje neer, de pagina rendert erin, en React ruimt het op
 * als de pagina weggaat. Precies wat PlaatSlots al deed -- ik had daar meteen
 * naar moeten kijken in plaats van iets nieuws te bedenken.
 *
 * Of de standaardinhoud verborgen moet worden, beslist de CSS met `:has()` op
 * een leeg vakje. Ook dat is geen staat, dus ook dat kan niet uit de pas lopen.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const HOST_ID = { links: 'axe-rail-links', rechts: 'axe-rail-rechts' } as const;

export function TabRail({ kant, children }: { kant: 'links' | 'rechts'; children: ReactNode }) {
  const [gastheer, setGastheer] = useState<HTMLElement | null>(
    () => (typeof document === 'undefined' ? null : document.getElementById(HOST_ID[kant])),
  );

  useEffect(() => {
    if (gastheer) return;
    const obs = new MutationObserver(() => {
      const el = document.getElementById(HOST_ID[kant]);
      if (el) { setGastheer(el); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [kant, gastheer]);

  return gastheer ? createPortal(children, gastheer) : null;
}
