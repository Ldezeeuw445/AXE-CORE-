/**
 * De sloten van de plaat.
 *
 * ## Het probleem dat dit oplost
 *
 * Elke pagina tekende zijn eigen chroom: een kopregel hier, een zijpaneel daar,
 * een rij knoppen onderaan. Geteld: van 37 pagina's hebben er 22 een eigen
 * kopregel en 5 eigen zijpanelen. De schil wist daar niets van, dus stonden er
 * dozen op de plaat -- en de enige manier om die weg te krijgen was per geval
 * met !important overschrijven, wat de leesbaarheid sloopt van juist de
 * panelen die je moet kunnen lezen.
 *
 * De oorzaak is niet de opmaak maar het eigendom: de pagina bezit de indeling.
 * Hier draait dat om. De schil bezit de indeling en houdt plekken vrij; een
 * pagina levert alleen INHOUD aan zo'n plek. Daarmee kán een pagina geen doos
 * meer tekenen -- niet omdat het verboden is, maar omdat ze de ruimte niet
 * meer heeft.
 *
 * ## Hoe het werkt
 *
 * De schil rendert lege gastheren (zie AppShell). Een pagina rendert
 * `<PlaatPanel side="left">` waar het in haar eigen boom ook maar uitkomt, en
 * die inhoud wordt via een portal in de gastheer gezet. Zo hoeft geen enkele
 * pagina te weten waar hij in de schil terechtkomt, en hoeft de schil niets te
 * weten van pagina's.
 *
 * Portals en niet context-met-render-props, om één reden: een pagina die
 * halverwege haar boom een paneel wil, hoeft dan niets aan haar structuur te
 * veranderen. Dat maakt het migreren van 37 pagina's een kwestie van knippen en
 * plakken in plaats van herschrijven.
 *
 * ## Panelen zijn NIET doorzichtig
 *
 * De plaat is doorzichtig, de panelen erop niet. Een leeslijst of een terminal
 * door een sterrenhemel heen lezen is onbruikbaar; de plaat hoort de ACHTERGROND
 * te zijn, niet het papier. Ze zweven wel: los van de rand, met ruimte eromheen,
 * zodat je ziet dat ze op de plaat liggen in plaats van erin gesneden zijn.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type SlotNaam = 'links' | 'rechts' | 'dock';

const SLOT_ID: Record<SlotNaam, string> = {
  links: 'axe-slot-links',
  rechts: 'axe-slot-rechts',
  dock: 'axe-slot-dock',
};

/**
 * De gastheer voor een slot, of null zolang de schil nog niet gerenderd is.
 *
 * Een pagina kan mounten voordat de schil zijn gastheren heeft neergezet (bij
 * de eerste render van een route gebeurt dat gegarandeerd), dus dit kijkt in
 * een effect en zet dan pas state -- vandaar dat de eerste render null geeft en
 * de tweede het echte element. Zonder die tweede render valt het paneel stil
 * weg, wat het vervelendste soort bug is: niets kapot, alleen niets te zien.
 */
function useSlotGastheer(naam: SlotNaam): HTMLElement | null {
  const [gastheer, setGastheer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const gevonden = document.getElementById(SLOT_ID[naam]);
    if (gevonden) { setGastheer(gevonden); return; }

    /* Alleen kijken ZOLANG de gastheer er nog niet is, en dan meteen stoppen.
     *
     * Dit stond eerst als een blijvende observer op document.body met
     * subtree:true -- dus hij vuurde bij elke DOM-wijziging in de hele app.
     * Een Three.js-scene werkt zijn labels per frame bij, dus dat waren
     * duizenden callbacks per seconde voor een element dat na de eerste render
     * al gevonden was. Een waarnemer die blijft kijken nadat hij heeft
     * gevonden wat hij zocht is puur kosten.
     *
     * De schil kan later verschijnen (na inloggen bijvoorbeeld), dus de
     * observer moet er wél zijn -- alleen niet langer dan nodig. */
    if (!('MutationObserver' in window)) return;
    const obs = new MutationObserver(() => {
      const el = document.getElementById(SLOT_ID[naam]);
      if (!el) return;
      setGastheer(el);
      obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [naam]);

  return gastheer;
}

/** Waar de schil de sloten neerzet. Alleen AppShell gebruikt dit. */
export function PlaatSlotHosts() {
  return (
    <>
      <div id={SLOT_ID.links} className="axe-slot axe-slot--links" />
      <div id={SLOT_ID.rechts} className="axe-slot axe-slot--rechts" />
      <div id={SLOT_ID.dock} className="axe-slot axe-slot--dock" />
    </>
  );
}

/**
 * Een zwevend paneel aan de linker- of rechterkant, voor deze tab.
 *
 * `title` is optioneel maar bijna altijd de moeite: een paneel zonder kop
 * dwingt de lezer te raden waar hij naar kijkt.
 */
export function PlaatPanel({
  side,
  title,
  width,
  fill,
  children,
}: {
  side: 'left' | 'right';
  title?: string;
  /** Breder dan de standaard 268px, voor inhoud die het echt nodig heeft --
   *  een terminal op 268px is te smal om een commando in te lezen. Het slot
   *  groeit mee; wat er verder in datzelfde slot hangt ook. */
  width?: number;
  /** Neem de volle hoogte van het slot. Voor een terminal of een lijst die
   *  moet kunnen scrollen in plaats van de kolom uit te rekken. */
  fill?: boolean;
  children: ReactNode;
}) {
  const gastheer = useSlotGastheer(side === 'left' ? 'links' : 'rechts');

  /* De breedte staat op het SLOT, niet op het paneel: twee panelen in dezelfde
     kolom horen even breed te zijn, anders wordt het een trapje. */
  useEffect(() => {
    if (!gastheer || !width) return;
    const vorige = gastheer.style.width;
    gastheer.style.width = `${width}px`;
    return () => { gastheer.style.width = vorige; };
  }, [gastheer, width]);

  if (!gastheer) return null;

  return createPortal(
    <section className="axe-paneel" data-vul={fill ? 'ja' : undefined}>
      {title ? <h2 className="axe-paneel-kop">{title}</h2> : null}
      <div className="axe-paneel-body">{children}</div>
    </section>,
    gastheer,
  );
}

/**
 * Inhoud rechtstreeks in een slot, zonder paneelomhulsel.
 *
 * Voor onderdelen die hun eigen panelen al meebrengen -- de weergaven die uit
 * de oude opzet komen hebben vaak een kolom van kaarten in plaats van één
 * paneel. Die wil je niet nóg een keer inpakken; je wilt alleen dat ze op de
 * juiste plek hangen. Het gedeelde materiaal krijgen ze via de css op
 * `.axe-slot > *`, niet via een extra div.
 */
export function PlaatSlot({ slot, children }: { slot: SlotNaam; children: ReactNode }) {
  const gastheer = useSlotGastheer(slot);
  if (!gastheer) return null;
  return createPortal(children, gastheer);
}

/**
 * De rij knoppen onderaan het midden -- dieptekiezers, weergaveknoppen, wat de
 * tab daar ook nodig heeft. Ligt boven de chatplaat, want het hoort bij wat je
 * ziet, niet bij wat je typt.
 */
export function PlaatDock({ children }: { children: ReactNode }) {
  const gastheer = useSlotGastheer('dock');
  if (!gastheer) return null;
  return createPortal(<div className="axe-dock">{children}</div>, gastheer);
}

/**
 * Een BESTAAND element in een slot hangen, zonder het te herschrijven.
 *
 * ## Waarom deze omweg bestaat
 *
 * Niet alle oude chroom is React. NeuralBrain bouwt zijn panelen als één HTML-
 * string en werkt ze daarna imperatief bij via getElementById -- honderden
 * regels bedrading die aan die ids hangen. Dat omzetten naar PlaatPanel is een
 * herschrijving met echt risico: elke gemiste id is een paneel dat stilletjes
 * niet meer bijwerkt, en dat merk je pas dagen later.
 *
 * Dus verhuizen we het element in plaats van het na te bouwen. De ids blijven,
 * de bedrading blijft, de gebeurtenissen blijven -- appendChild verplaatst een
 * knoop zonder hem opnieuw te maken. Wat verandert is alleen WAAR hij hangt, en
 * dat is precies wat we wilden veranderen: de schil bepaalt de plaats.
 *
 * Bij opruimen gaat hij terug naar zijn oorspronkelijke ouder. Zonder dat
 * blijft hij in het slot achter als een spook wanneer de pagina weg is --
 * React ruimt hem niet op, want React weet niet dat hij daar staat.
 *
 * Dit is een brug, geen eindstation. Een paneel dat ooit React wordt, gebruikt
 * gewoon PlaatPanel.
 */
export function useSlotAdoptie(
  selectors: Partial<Record<SlotNaam, string>>,
  actief: boolean,
) {
  useEffect(() => {
    if (!actief) return;

    const verhuisd: Array<{ el: HTMLElement; ouder: Node; naast: Node | null }> = [];

    /* Eén tik uitstel: het element komt uit dangerouslySetInnerHTML en de
       slot-gastheren uit de schil; welke van de twee er eerder staat is niet
       gegarandeerd. Wachten tot na de render dekt beide volgordes. */
    const klaar = requestAnimationFrame(() => {
      for (const [naam, selector] of Object.entries(selectors)) {
        const gastheer = document.getElementById(SLOT_ID[naam as SlotNaam]);
        const el = selector ? document.querySelector<HTMLElement>(selector) : null;
        if (!gastheer || !el || el.parentNode === gastheer) continue;
        verhuisd.push({ el, ouder: el.parentNode!, naast: el.nextSibling });
        gastheer.appendChild(el);
      }
    });

    return () => {
      cancelAnimationFrame(klaar);
      for (const { el, ouder, naast } of verhuisd) {
        try { ouder.insertBefore(el, naast); } catch { /* ouder is al weg */ }
      }
    };
  }, [selectors, actief]);
}
