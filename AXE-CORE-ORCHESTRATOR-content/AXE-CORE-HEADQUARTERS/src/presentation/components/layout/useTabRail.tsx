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

  /* De waarnemer blijft kijken, ook nadat hij de host gevonden heeft.
   *
   * Hier stond `if (gastheer) return` met een disconnect na de eerste vondst.
   * Dat gaat goed zolang de host blijft staan -- maar de zijbalk wisselt tussen
   * ingeklapt en uitgeschoven, en bij die wissel wordt het element VERVANGEN.
   * De oude knoop is dan losgekoppeld van de pagina, en dit portaal bleef
   * daarin tekenen: de inhoud van de tab was er nog, alleen nergens te zien.
   *
   * Vergelijken op identiteit en niet op id: er is er altijd maar één met dit
   * id, dus zodra `document.getElementById` iets ANDERS teruggeeft dan wat we
   * vasthouden, is de host vervangen en moeten we mee verhuizen. */
  useEffect(() => {
    const zoek = () => {
      const el = document.getElementById(HOST_ID[kant]);
      setGastheer((huidig) => (el === huidig ? huidig : el));
    };
    zoek();
    const obs = new MutationObserver(zoek);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [kant]);

  return gastheer ? createPortal(children, gastheer) : null;
}
