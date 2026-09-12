/**
 * De telefoon die linksonder over Home zweeft: een iPhone 15 Pro met daarin
 * Luka's eigen apps. Het scherm is een beginscherm (TelefoonScherm); een tik
 * op een tegel of een chip opent de app in het frame, een swipe omhoog of de
 * home-indicator brengt je terug.
 *
 * Schaal .92 (361×784) als het venster dat toelaat. Hij zweeft OVER composer
 * en dok — dat is de zweeflaag — dus hij mag groot zijn. Bij het openen van
 * Home komt hij van onder het scherm omhoog (680 ms) en zweeft daarna licht.
 * `prefers-reduced-motion` en `?anim=0` zetten dat stil.
 *
 * De kopbalk is de greep. Draaien, pinnen, verbergen, en de open app worden
 * onthouden. Dicht bij de linkerrand of de onderkant gelaten klemt hij vast
 * (kleefAanRand).
 */
import { useState } from 'react';
import { IphoneFrame } from './IphoneFrame';
import { TelefoonScherm } from './TelefoonScherm';
import { KOP_HOOGTE, MARGE_ONDER, TELEFOON_ECHT, animatieVlaggen, telefoonSchaal, type TelefoonApp } from './launcher';
import { Zwever } from '@/presentation/components/layout/zweef/Zwever';
import { ZweefIcoon } from '@/presentation/components/layout/zweef/ZweefIcoon';
import { useSchilMaten } from '@/presentation/components/layout/zweef/schilMaten';
import { bewaarVlag, laadVlag, type Anker, type Maat } from '@/presentation/components/layout/zweef/zweefPositie';

const NAAM = 'telefoon';
const LINKS = 20;
const CHIP: Maat = { b: 236, h: 34 };

function useAnimatie() {
  return useState(() => animatieVlaggen({
    search: window.location.search,
    minderBeweging: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  }))[0];
}

export function ZwevendeTelefoon() {
  const [verborgen, setVerborgen] = useState(() => laadVlag(NAAM, 'verborgen', window.localStorage));
  const [vast, setVast] = useState(() => laadVlag(NAAM, 'vast', window.localStorage));
  const [liggend, setLiggend] = useState(() => laadVlag(NAAM, 'liggend', window.localStorage));
  const [app, setApp] = useState<TelefoonApp | null>(null);
  const schil = useSchilMaten();
  const schaal = telefoonSchaal(schil.venster.h);
  const anim = useAnimatie();
  const anker: Anker = { links: LINKS, onder: MARGE_ONDER };

  const b = Math.round(TELEFOON_ECHT.b * schaal);
  const h = Math.round(TELEFOON_ECHT.h * schaal);
  const staand: Maat = { b, h: h + KOP_HOOGTE };
  const liggendMaat: Maat = { b: h, h: b + KOP_HOOGTE };
  const chipAnker: Anker = { links: LINKS, onder: MARGE_ONDER + staand.h - CHIP.h };

  const zet = (vlag: 'verborgen' | 'vast' | 'liggend', aan: boolean) => {
    bewaarVlag(NAAM, vlag, aan, window.localStorage);
    if (vlag === 'verborgen') setVerborgen(aan);
    else if (vlag === 'vast') setVast(aan);
    else setLiggend(aan);
  };

  if (verborgen) {
    return (
      <Zwever naam={NAAM} anker={chipAnker} maat={CHIP} vast>
        <button type="button" className="axe-ruit axe-zwever__chip" title="Show iPhone" onClick={() => zet('verborgen', false)}>
          <ZweefIcoon naam="telefoon" /> iPhone 15 Pro
        </button>
      </Zwever>
    );
  }

  const lijfKlassen = [
    'axe-telefoon__lijf',
    anim.entree ? 'axe-telefoon__lijf--entree' : '',
    anim.zweef ? 'axe-telefoon__lijf--zweeft' : '',
  ].filter(Boolean).join(' ');

  return (
    <Zwever
      naam={NAAM}
      anker={anker}
      maat={liggend ? liggendMaat : staand}
      vast={vast}
      className={liggend ? 'axe-telefoon axe-telefoon--liggend' : 'axe-telefoon'}
    >
      <div
        className={lijfKlassen}
        style={{ '--tel-schaal': schaal, '--tel-h': `${h}px` } as React.CSSProperties}
      >
        <div className="axe-ruit axe-telefoon__kop" data-greep>
          <ZweefIcoon naam="telefoon" /> iPhone 15 Pro · <span className={app ? 'c-accent' : 'c-ok'}>{app ? app.naam : 'home'}</span>
          <span className="axe-groei" />
          <button type="button" className={`axe-zweefknop ${liggend ? 'axe-zweefknop--aan' : ''}`} title="Rotate" onClick={() => zet('liggend', !liggend)}>
            <ZweefIcoon naam="herlaad" />
          </button>
          <button type="button" className={`axe-zweefknop ${vast ? 'axe-zweefknop--aan' : ''}`} title={vast ? 'Unpin' : 'Pin'} onClick={() => zet('vast', !vast)}>
            <ZweefIcoon naam="speld" />
          </button>
          <button type="button" className="axe-zweefknop" title="Hide" onClick={() => zet('verborgen', true)}>
            <ZweefIcoon naam="kruis" />
          </button>
        </div>
        <IphoneFrame>
          <TelefoonScherm onApp={setApp} />
        </IphoneFrame>
      </div>
    </Zwever>
  );
}
