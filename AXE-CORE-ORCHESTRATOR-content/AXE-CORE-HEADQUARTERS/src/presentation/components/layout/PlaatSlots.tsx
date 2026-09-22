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

export type SlotNaam = 'links' | 'rechts' | 'dock' | 'rail' | 'topbalk';

/**
 * Exported so anything that adopts an EXISTING (non-React) element into a slot
 * -- see `useSlotAdoptie` below -- can still find that element by id after the
 * move, without hardcoding host ids that could drift from this table. See
 * `NeuralBrain.tsx`'s `q()` for the concrete case this exists for.
 */
export const SLOT_ID: Record<SlotNaam, string> = {
  links: 'axe-slot-links',
  rechts: 'axe-slot-rechts',
  dock: 'axe-slot-dock',
  rail: 'axe-slot-rail',
  /* De topbalk. Zo kan een tab er iets in hangen dat over de hele app geldt --
     de kill switch en de autopilot horen bovenin, niet in een paneel dat je
     eerst moet openen. De schil hoeft daarvoor niets van trading te weten. */
  topbalk: 'axe-slot-topbalk',
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

/**
 * Referentietelling voor `axe-slot--hoog`, gedeeld door alle drie de wegen die
 * de klasse zetten (`PlaatPanel`, `PlaatSlot`, `useSlotAdoptie`).
 *
 * ## Waarom een teller en geen boolean
 *
 * Neural, Terrain en Architecture wisselen via `AnimatePresence` (Home.tsx /
 * HomeStage.tsx, `exit={{opacity:0}}` met 250ms). Dat betekent dat de
 * VERTREKKENDE weergave nog gewoon gemount blijft -- effecten, cleanup en al
 * -- voor de hele duur van zijn exit-animatie, TERWIJL de binnenkomende
 * weergave al mount en zijn eigen `axe-slot--hoog` claim probeert te leggen op
 * hetzelfde gedeelde gastheer-element (`#axe-slot-links`/`#axe-slot-rechts`).
 * Voor 250ms lang kunnen dus twee (of bij een snelle heen-en-terug-wissel:
 * drie) instanties tegelijk gemount zijn op dezelfde gastheer.
 *
 * Een boolean "heb ik hem zelf gezet" (het oude patroon, hieronder nog te
 * zien in de git-historie) gaat hier stuk: instantie B mount, ziet de klasse
 * al staan (want instantie A had hem gezet en is nog niet opgeruimd), en
 * concludeert dus "iemand anders zorgt hiervoor" -- B registreert zichzelf
 * NOOIT als eigenaar. Zodra A dan alsnog opruimt (zijn exit-animatie is
 * voorbij), haalt A de klasse weg ONDER B vandaan, terwijl B nog springlevend
 * is en hem nog nodig heeft. Van buiten is dat precies Neural's "eerst goed,
 * dan valt hij terug" -- de klasse verdwijnt niet DIRECT bij het wisselen,
 * maar pas zodra de vorige instantie zijn (vertraagde) opruiming voltooit,
 * wat de flap een fractie later laat gebeuren dan de wissel zelf -- en kan,
 * bij de verkeerde volgorde, de klasse ook blijvend LATEN STAAN op een
 * gastheer die niemand meer gebruikt (het spook-obstakel dat
 * AxePresenceDock.tsx op een geheel andere tab zou kunnen zien).
 *
 * Een teller lost dit op ONGEACHT de volgorde: elke claim verhoogt, elke
 * vrijgave verlaagt, en de klasse gaat pas weg als de teller op nul staat.
 * Wie hem als tweede claimt terwijl hij al aanstaat telt gewoon mee (was
 * eerst een no-op); wie vrijgeeft terwijl er nog een ander telt laat hem
 * gewoon staan. Correct bij elke overlap, zonder dat de volgorde van mount/
 * unmount ertoe doet. */
const hoogTellers = new Map<Element, number>();

function hoogClaim(gastheer: Element): void {
  const volgende = (hoogTellers.get(gastheer) ?? 0) + 1;
  hoogTellers.set(gastheer, volgende);
  if (volgende === 1) gastheer.classList.add('axe-slot--hoog');
}

function hoogVrijgeven(gastheer: Element): void {
  const huidige = hoogTellers.get(gastheer);
  if (huidige === undefined) return; // al vrijgegeven, of nooit geclaimd -- niets te doen
  const volgende = huidige - 1;
  if (volgende <= 0) {
    hoogTellers.delete(gastheer);
    gastheer.classList.remove('axe-slot--hoog');
  } else {
    hoogTellers.set(gastheer, volgende);
  }
}

/** Waar de schil de sloten neerzet. Alleen AppShell gebruikt dit. */
export function PlaatSlotHosts() {
  return (
    <>
      <div id={SLOT_ID.links} className="axe-slot axe-slot--links" />
      <div id={SLOT_ID.rechts} className="axe-slot axe-slot--rechts" />
      <div id={SLOT_ID.dock} className="axe-slot axe-slot--dock" />
      {/* De linkerrail, overgenomen door de pagina. Leeg blijft hij weg en
          houdt de gewone zijbalk zijn plek; vult een tab hem, dan schuift dít
          uit als je de rand raakt -- zelfde gebaar, andere inhoud. */}
      <div id={SLOT_ID.rail} className="axe-slot axe-slot--rail" />
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
  accent,
  width,
  fill,
  actions,
  composer,
  hoog,
  children,
}: {
  side: 'left' | 'right';
  title?: string;
  /** De kleur van de kop. Panelen zijn allemaal hetzelfde materiaal, dus zonder
   *  kleur moet je elke keer lezen waar je naar kijkt. Eén mat accent per soort
   *  paneel maakt het een oogopslag: cyaan is AXE, groen is de machine, oranje
   *  is wat jij aan het maken bent. Mat, want het is een kopje en geen melding. */
  accent?: 'cyaan' | 'groen' | 'oranje';
  /** Een eigen breedte afdwingen. Gebruik dit bijna nooit.
   *
   *  De sloten staan nu naast de chatplaat en ontlenen hun breedte aan de
   *  ruimte die daar overblijft -- dat is wat de onderste band één geheel
   *  maakt. Een paneel dat zijn eigen maat opdringt breekt die band, en dan
   *  staat er weer een los ding op de plaat in plaats van een indeling. */
  width?: number;
  /** Neem de volle hoogte van het slot. Voor een terminal of een lijst die
   *  moet kunnen scrollen in plaats van de kolom uit te rekken. */
  fill?: boolean;
  /** Knoppen rechts in de kop, zoals de chatplaat van AXE er heeft. Voor wat
   *  deze tab hier te bedienen heeft -- dan hoeft de pagina er geen eigen balk
   *  voor te tekenen. */
  actions?: ReactNode;
  /** De invoerbalk, als los blok onder het paneel. Komt op dezelfde hoogte als
   *  de AXE-composer, want het is hetzelfde gebaar. */
  composer?: ReactNode;
  /** Volle hoogte in plaats van de onderband -- zie PlaatSlot.hoog. */
  hoog?: boolean;
  children: ReactNode;
}) {
  const gastheer = useSlotGastheer(side === 'left' ? 'links' : 'rechts');

  useEffect(() => {
    if (!gastheer || !hoog) return;
    // Referentietelling (zie hoogClaim/hoogVrijgeven hierboven), niet een kale
    // add/remove: twee panelen die overlappen op dezelfde gastheer (Terrain
    // wisselt via AnimatePresence, zie useSlotAdoptie's uitleg) mogen elkaars
    // klasse niet onder elkaar vandaan trekken.
    hoogClaim(gastheer);
    return () => hoogVrijgeven(gastheer);
  }, [gastheer, hoog]);

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
    <>
      <section className="axe-paneel" data-vul={fill ? 'ja' : undefined}>
        {title || actions ? (
          <h2 className="axe-paneel-kop" data-accent={accent}>
            {title}
            {actions ? <span className="axe-paneel-acties">{actions}</span> : null}
          </h2>
        ) : null}
        <div className="axe-paneel-body">{children}</div>
      </section>
      {/* De invoer als APART blok eronder, precies zoals de AXE-composer onder
          de chatplaat staat. Erin zou het een vak in een vak zijn, en dan staat
          hij ook niet op dezelfde hoogte als die van AXE -- terwijl het
          hetzelfde gebaar is op dezelfde regel. */}
      {composer ? <div className="axe-paneel-composer">{composer}</div> : null}
    </>,
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
export function PlaatSlot({ slot, hoog, children }: {
  slot: SlotNaam;
  /**
   * Neem de volle hoogte van de plaat in plaats van alleen de onderband.
   *
   * De sloten lopen normaal van de chatplaat tot onder de composer -- dat is
   * de onderband van tabs die er panelen in hangen. De code-editor doet dat
   * niet meer (terminal onder de editor, agent in de balk). De
   * geheugenverkenners willen iets anders: kolommen naast het beeld, van onder
   * de kopbalk tot boven de chat, zoals in de oude AXE Core.
   *
   * Alleen wie er zelf om vraagt krijgt dit: PlaatSlot zet de klasse op de
   * gastheer en haalt hem er bij het verlaten weer af.
   */
  hoog?: boolean;
  children: ReactNode;
}) {
  const gastheer = useSlotGastheer(slot);

  // De klasse hoort op de GASTHEER, want die is gepositioneerd -- niet op wat
  // erin geportaleerd wordt. Opruimen bij het verlaten, anders houdt de
  // volgende tab de hoge stand.
  //
  // Referentietelling, net als PlaatPanel en useSlotAdoptie hierboven/onder:
  // Terrain (deze weg) en Neural (useSlotAdoptie) wisselen via dezelfde
  // AnimatePresence in Home.tsx/HomeStage.tsx, dus tijdens een wissel kunnen
  // een vertrekkende en een binnenkomende instantie allebei even gemount zijn
  // op hetzelfde gastheer-element. Terrain toonde de race niet zo zichtbaar
  // als Neural, maar dat was timing (een synchrone add/remove komt hier
  // toevallig vaker "op tijd" uit dan useSlotAdoptie's met-een-frame-
  // vertraagde rAF-pad), niet een andere, veiligere bookhouding -- de kale
  // add/remove hieronder was BOVEN referentietelling niet raceveilig.
  useEffect(() => {
    if (!gastheer || !hoog) return;
    hoogClaim(gastheer);
    return () => hoogVrijgeven(gastheer);
  }, [gastheer, hoog]);

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
  /**
   * De hoge stand voor de sloten waarin geadopteerd wordt -- zie PlaatSlot.hoog.
   *
   * PlaatSlot en PlaatPanel konden dit al, maar deze brug niet, en Neural loopt
   * juist via deze brug. Het gevolg was dat Neural als enige van de drie
   * verkenners in de onderband bleef hangen terwijl de andere twee de klasse
   * wel kregen -- van buiten precies één symptoom ("de panelen staan onderaan
   * en zijn afgesneden"), van binnen een andere oorzaak. Vandaar hier ook.
   */
  hoog = false,
) {
  useEffect(() => {
    if (!actief) return;

    const verhuisd: Array<{ el: HTMLElement; ouder: Node; naast: Node | null }> = [];
    const hoogGeclaimd: HTMLElement[] = [];

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
        /* De klasse op de gastheer, want die is gepositioneerd.
         *
         * ALTIJD claimen, nooit eerst checken of hij al aanstaat -- dat was
         * precies de race (zie hoogClaim/hoogVrijgeven's uitleg hierboven).
         * Deze weg heeft het extra probleem dat de claim een heel
         * animatieframe LATER komt dan de synchrone PlaatSlot/PlaatPanel-weg
         * (de rAF hierboven): tijdens een snelle Neural<->Terrain-wissel via
         * AnimatePresence kan de vertrekkende instantie de klasse allang
         * gezet hebben voordat deze rAF hier vuurt. Een boolean-teller die
         * dat als "al goed" leest registreert zichzelf dan nooit als
         * claimant, en verliest de klasse zodra de vertrekkende instantie
         * (met vertraging, via zijn eigen cleanup) opruimt -- exact de "eerst
         * goed, dan valt hij terug"-flip. De teller telt gewoon mee, ongeacht
         * of hij nul of al hoger was. */
        if (hoog) {
          hoogClaim(gastheer);
          hoogGeclaimd.push(gastheer);
        }
      }
    });

    return () => {
      cancelAnimationFrame(klaar);
      for (const { el, ouder, naast } of verhuisd) {
        try { ouder.insertBefore(el, naast); } catch { /* ouder is al weg */ }
      }
      for (const g of hoogGeclaimd) hoogVrijgeven(g);
    };
  }, [selectors, actief, hoog]);
}

/**
 * De linkerrail overnemen voor deze tab.
 *
 * De uitschuivende zijbalk is een gebaar dat je op elke pagina kent: muis naar
 * de rand, en er komt iets tevoorschijn. Wat daar staat hoeft niet overal
 * hetzelfde te zijn -- op de code-editor is de bestandsboom precies wat je daar
 * wilt hebben, en niet de standaardwidgets.
 *
 * Zolang een pagina dit niet gebruikt blijft de gewone zijbalk staan. Vult ze
 * hem wel, dan verdwijnt die (zie axe-look.css) -- twee dingen op dezelfde plek
 * die allebei uitschuiven is geen keuze maar een botsing.
 */
export function PlaatRail({ title, children }: { title?: string; children: ReactNode }) {
  const gastheer = useSlotGastheer('rail');
  if (!gastheer) return null;
  return createPortal(
    <>
      {title ? <h2 className="axe-paneel-kop">{title}</h2> : null}
      <div className="axe-rail-body">{children}</div>
    </>,
    gastheer,
  );
}
