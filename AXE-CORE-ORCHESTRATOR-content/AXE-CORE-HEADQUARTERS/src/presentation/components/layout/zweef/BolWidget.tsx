/**
 * De bol van Home, op de plaat van de browsertab. Zonder kaart eromheen -- de
 * scène-regel uit DESIGN.md: de bol is het enige dat rechtstreeks op de plaat
 * mag staan. Eronder, op 10 px, één ruit-chip als greep en HUD: AXE Core, of
 * hij werkt, hoeveel herinneringen er zijn, en drie knoppen (Home, pin, hide).
 *
 * Hij staat in de marge rechts van de band en past daarin (bolPlek.ts): de
 * kaarten van de startpagina liggen op de plaat en de bol mag er niet achter
 * verdwijnen. Sleept de gebruiker hem zelf over de band, dan is dat zijn keuze.
 *
 * Het canvas zelf sleep je niet; dat draait de bol. De chip is de greep.
 * Plek, pin en verborgen worden onthouden; `?reset=1` vergeet ze.
 */
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { Zwever } from './Zwever';
import { ZweefIcoon } from './ZweefIcoon';
import { isBezig } from './bezig';
import { teller, useGeheugenTotaal } from './geheugenTeller';
import { useSchilMaten } from './schilMaten';
import { bolCanvas, bolDoorsnee, bolStandaardPlek, bolZweverMaat } from './bolPlek';
import { bewaarVlag, laadVlag, type Maat } from './zweefPositie';

const NAAM = 'bol';
const CHIP: Maat = { b: 120, h: 26 };

export function BolWidget() {
  const navigate = useNavigate();
  const [verborgen, setVerborgen] = useState(() => laadVlag(NAAM, 'verborgen', window.localStorage));
  const [vast, setVast] = useState(() => laadVlag(NAAM, 'vast', window.localStorage));
  const totaal = useGeheugenTotaal();
  const bezig = useVoiceStore((s) => isBezig(s.voiceStatus));
  const schil = useSchilMaten();
  const doorsnee = bolDoorsnee(schil.venster.b - schil.bandRechts);
  const maat = bolZweverMaat(doorsnee);
  const standaard = (venster: Maat) => bolStandaardPlek(venster, schil.bandRechts, maat);

  const zet = (vlag: 'verborgen' | 'vast', aan: boolean) => {
    bewaarVlag(NAAM, vlag, aan, window.localStorage);
    if (vlag === 'verborgen') setVerborgen(aan); else setVast(aan);
  };

  if (verborgen) {
    return (
      <Zwever naam={NAAM} standaard={standaard} maat={CHIP} vast>
        <button type="button" className="axe-ruit axe-zwever__chip" title="Show AXE Core" onClick={() => zet('verborgen', false)}>
          <ZweefIcoon naam="bol" /> AXE Core
        </button>
      </Zwever>
    );
  }

  return (
    <Zwever naam={NAAM} standaard={standaard} maat={maat} vast={vast} className="axe-bol-plaat">
      <div className="axe-bol-plaat__bol" style={{ '--bol': `${doorsnee}px`, '--bol-canvas': `${bolCanvas(doorsnee)}px` } as CSSProperties}>
        <AxeCoreSphere boost={bezig ? 1 : 0} />
      </div>
      <div className={`axe-ruit axe-hud${bezig ? ' axe-ruit--actief' : ''}`} data-greep>
        <span className="axe-hud__tip axe-ruit" aria-hidden="true">drag · pin · hide</span>
        <i className={`axe-stip ${bezig ? 'c-warn' : 'c-ok'}`} />
        <span>AXE Core</span>
        <span className="axe-hud__sep">·</span>
        <span className={bezig ? 'c-warn' : 'c-ok'}>{bezig ? 'thinking' : 'live'}</span>
        {totaal !== null && (
          <>
            <span className="axe-hud__sep">·</span>
            <span className="axe-hud__teller" title="memories">{teller(totaal)}</span>
          </>
        )}
        <span className="axe-hud__knoppen">
          <button type="button" className="axe-zweefknop" title="Back to Home" onClick={() => navigate('/')}>
            <ZweefIcoon naam="home" />
          </button>
          <button type="button" className={`axe-zweefknop${vast ? ' axe-zweefknop--aan' : ''}`} title={vast ? 'Unpin' : 'Pin'} onClick={() => zet('vast', !vast)}>
            <ZweefIcoon naam="speld" />
          </button>
          <button type="button" className="axe-zweefknop" title="Hide" onClick={() => zet('verborgen', true)}>
            <ZweefIcoon naam="kruis" />
          </button>
        </span>
      </div>
    </Zwever>
  );
}
