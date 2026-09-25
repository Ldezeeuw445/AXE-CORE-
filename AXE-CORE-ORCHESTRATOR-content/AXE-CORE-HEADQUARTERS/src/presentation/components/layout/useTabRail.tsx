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
import { useUIStore } from '@/presentation/store/uiStore';
import { SchuifVoet } from '@/presentation/components/layout/tabMaatstaf';

const HOST_ID = { links: 'axe-rail-links', rechts: 'axe-rail-rechts' } as const;
const VAST_SLEUTEL = { links: 'railVastL', rechts: 'railVastR' } as const;

/**
 * `vast` houdt de lade open.
 *
 * De lade gaat normaal open als je muis binnen 34px van de rand komt
 * (AxeShellChrome). Dat werkt voor een lade die je zoekt, maar niet voor een
 * paneel dat ANTWOORDT op een klik: je klikt een tegenpartij aan, het detail
 * verschijnt in de lade, en de lade is dicht. De rij licht op en verder
 * gebeurt er niets zichtbaars -- gemeten in de QA van 16 september.
 *
 * Staat er een gekozen record in, dan zet het tabblad `vast` en blijft de lade
 * open tot je hem sluit. Zonder keuze blijft het gewoon de rand-lade.
 *
 * `vast` doet TWEE dingen, en het tweede is waar de eerste versie op stukliep:
 * de rand-lade van de plaat opentrekken (data-rail-r) EN het rechterpaneel
 * zelf. Staat dat ingeklapt, dan is de gastheer `hidden` en portaleert het
 * tabblad zijn detail in een onzichtbare doos -- precies wat je zag: de rij
 * lichtte op en verder gebeurde er niets.
 */
export function TabRail({ kant, children, vast }: { kant: 'links' | 'rechts'; children: ReactNode; vast?: boolean }) {
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

  const setRightPanelOpen = useUIStore(st => st.setRightPanelOpen);
  const setLeftPanelOpen = useUIStore(st => st.setLeftPanelOpen);

  useEffect(() => {
    const wortel = document.documentElement;
    const sleutel = VAST_SLEUTEL[kant];
    /* Alleen op de overgang naar `vast`, niet elke render: daarna mag je het
       paneel gewoon dichtklappen zonder dat het meteen terugkomt. */
    if (vast) (kant === 'rechts' ? setRightPanelOpen : setLeftPanelOpen)(true);
    if (vast) {
      wortel.dataset[sleutel] = 'aan';
      wortel.dataset[kant === 'rechts' ? 'railR' : 'railL'] = 'open';
    } else {
      delete wortel.dataset[sleutel];
    }
    return () => { delete wortel.dataset[sleutel]; };
  }, [kant, vast, setRightPanelOpen, setLeftPanelOpen]);

  /* Elke lade dezelfde vorm als de Browser-lade (UI-MAATSTAF layoutregel 5):
     binnenkaart, scrollend lijf, en links de vaste voet. Dat stond per tab
     zelf te doen, en 8 van de 11 deden het niet (25 sep). Een tab die zelf al
     een SchuifBalk meegeeft, wordt door de CSS plat gemaakt -- geen kaart in
     een kaart. */
  const lade = (
    <div className="axe-schuifbalk axe-schuifbalk--rail">
      <div className="axe-schuifbalk-kaart">
        <div className="axe-schuifbalk-lijf">{children}</div>
        {kant === 'links' && <SchuifVoet />}
      </div>
    </div>
  );
  return gastheer ? createPortal(lade, gastheer) : null;
}
