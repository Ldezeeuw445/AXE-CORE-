/**
 * Het radiaal menu linksonder.
 *
 * Dicht is het één ronde knop. Druk je erop, dan komt de ring eromheen met de
 * tabs erop, en het midden wordt een kruis om hem weer te sluiten.
 *
 * ## Waarom het rekenwerk hier niet staat
 *
 * De posities komen uit `domain/radiaal.ts`, met tests: één item, nul items,
 * een halve ring, en de valkuil dat bij een volle ring de eerste en de laatste
 * op dezelfde plek vallen. Staat hier `Math.cos`, dan is er iets fout.
 *
 * ## De hoeken
 *
 * De ring loopt niet helemaal rond: de tabs staan over 260 graden, met een gat
 * aan de LINKERkant. Daar staat de driehoek, en die hoort niet tussen de tabs
 * te staan -- hij is iets anders. Nul graden is boven, met de klok mee (zie
 * radiaal.ts), dus de eerste tab staat rechtsboven en ze lopen met de klok mee
 * naar linksonder.
 *
 * ## Waarom hij het gesprek niet in de weg zit
 *
 * Hij staat boven de navigatie én boven de chatplaat, op --axe-chat-onder --
 * dezelfde gemeten maat die Terrain en Neural gebruiken. Zonder die maat zou
 * hij bij een ingeklapte chat ergens in het niets hangen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Menu, PanelRightOpen, Smartphone, StickyNote, X } from 'lucide-react';
import { radiaalPosities } from '@/domain/radiaal';
import { useCoreViewStore } from '@/presentation/store/coreViewStore';

/** Afstand van het midden tot een tab. */
const STRAAL = 92;
/** Maat van een tab-knop. */
const TAB = 42;
/** Over hoeveel graden de tabs verdeeld worden, en waar de eerste staat. */
const BOOG = 260;
const START = 20;

interface Tab {
  id: string;
  label: string;
  /** Een icoon, of een letter -- de N is geen icoon maar een letterteken. */
  teken: React.ReactNode;
  doe: () => void;
}

export function RadiaalDok({ opDriehoek }: { opDriehoek?: () => void }) {
  const navigate = useNavigate();
  const setShowAwareness = useCoreViewStore(s => s.setShowAwareness);
  const [open, setOpen] = useState(false);
  const [zweeft, setZweeft] = useState<string | null>(null);
  const wortel = useRef<HTMLDivElement | null>(null);

  const sluit = useCallback(() => { setOpen(false); setZweeft(null); }, []);

  useEffect(() => {
    if (!open) return;
    const opToets = (e: KeyboardEvent) => { if (e.key === 'Escape') sluit(); };
    const opKlik = (e: MouseEvent) => {
      if (wortel.current && !wortel.current.contains(e.target as Node)) sluit();
    };
    window.addEventListener('keydown', opToets);
    window.addEventListener('mousedown', opKlik);
    return () => {
      window.removeEventListener('keydown', opToets);
      window.removeEventListener('mousedown', opKlik);
    };
  }, [open, sluit]);

  const tabs: Tab[] = [
    { id: 'telefoon', label: 'Telefoon', teken: <Smartphone size={18} />, doe: () => navigate('/mobile') },
    { id: 'notities', label: 'Notities', teken: <StickyNote size={18} />, doe: () => navigate('/obsidian') },
    // Een sierlijke hoofdletter N, geen icoon. Als letterteken en niet als svg:
    // hij hoort mee te kleuren en mee te schalen met de rest van de ring.
    { id: 'notion', label: 'Notion', teken: <span className="axe-dok-n">N</span>, doe: () => navigate('/knowledge') },
    // Dit was een route zonder deur: /browser-desktop stond in App.tsx en was
    // vanuit de app nergens te bereiken. Nu wel.
    { id: 'venster', label: 'Extra venster', teken: <PanelRightOpen size={18} />, doe: () => navigate('/browser-desktop') },
    { id: 'meldingen', label: 'Meldingen', teken: <Bell size={18} />, doe: () => setShowAwareness(true) },
  ];

  const punten = radiaalPosities(tabs.length, { straal: STRAAL, startHoek: START, boog: BOOG });
  const vak = (STRAAL + TAB) * 2;

  return (
    <div ref={wortel} className="axe-dok" data-open={open ? 'ja' : 'nee'} style={{ width: vak, height: vak }}>
      {/* De ring zelf: een schijf met een dikke rand, puur decor. Als eigen
          element en niet als schaduw op de knop, want hij moet ONDER de tabs
          liggen en erboven mag niets gebeuren. */}
      <div className="axe-dok-ring" aria-hidden="true" />

      {tabs.map((tab, i) => {
        const punt = punten[i];
        return (
          <button
            key={tab.id}
            type="button"
            className="axe-dok-tab"
            title={tab.label}
            aria-label={tab.label}
            tabIndex={open ? 0 : -1}
            onMouseEnter={() => setZweeft(tab.id)}
            onMouseLeave={() => setZweeft(null)}
            onClick={() => { tab.doe(); sluit(); }}
            style={{
              width: TAB,
              height: TAB,
              marginLeft: -TAB / 2,
              marginTop: -TAB / 2,
              // Dicht liggen ze op het midden, met een kleine vertraging per
              // tab zodat de ring uitvouwt in plaats van verschijnt.
              transform: open ? `translate(${punt.x}px, ${punt.y}px)` : 'translate(0, 0) scale(0.4)',
              transitionDelay: `${open ? i * 30 : 0}ms`,
              opacity: open ? 1 : 0,
              pointerEvents: open ? 'auto' : 'none',
            }}
          >
            {tab.teken}
            {/* Het label staat naast de ring en niet eronder: onderaan het
                scherm is geen ruimte, en een tooltip die half wegvalt is
                geen tooltip. */}
            {zweeft === tab.id && <span className="axe-dok-label">{tab.label}</span>}
          </button>
        );
      })}

      {/* De cyane driehoek, links buiten de ring. Hij is geen tab -- daarom
          staat hij in het gat van de boog en niet ertussen. Wat hij doet komt
          van buiten (opDriehoek), zodat hij ergens op aangesloten kan worden
          zonder dit bestand aan te raken. */}
      <button
        type="button"
        className="axe-dok-driehoek"
        title="AXE"
        aria-label="AXE"
        tabIndex={open ? 0 : -1}
        onClick={() => { opDriehoek?.(); sluit(); }}
        style={{
          transform: open ? 'translate(-124px, 0) scale(1)' : 'translate(0, 0) scale(0.4)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <span className="axe-dok-driehoek-vorm" aria-hidden="true" />
      </button>

      <button
        type="button"
        className="axe-dok-knop"
        aria-expanded={open}
        aria-label={open ? 'Menu sluiten' : 'Menu openen'}
        onClick={() => setOpen(v => !v)}
      >
        {open ? <X size={19} /> : <Menu size={19} />}
      </button>
    </div>
  );
}
