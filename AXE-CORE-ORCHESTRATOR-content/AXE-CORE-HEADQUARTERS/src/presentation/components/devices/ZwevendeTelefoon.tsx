/**
 * De telefoon die linksonder over Home zweeft: een iPhone 15 Pro met daarin de
 * mobiele AXE, live. Het scherm is een iframe naar onze eigen app op #/mobile;
 * dezelfde bundel, dezelfde opslag, dus wat je in de telefoon ziet is wat de
 * echte telefoon ook zou tonen.
 *
 * De kopbalk is de greep. Draaien maakt de zwever breed in plaats van hoog,
 * pinnen zet hem vast op zijn plek, verbergen laat alleen een chip achter op
 * dezelfde plek zodat hij met één klik terug is. Alle drie worden onthouden.
 */
import { useState } from 'react';
import { IphoneFrame } from './IphoneFrame';
import { Zwever } from '@/presentation/components/layout/zweef/Zwever';
import { ZweefIcoon } from '@/presentation/components/layout/zweef/ZweefIcoon';
import { bewaarVlag, laadVlag, type Anker, type Maat } from '@/presentation/components/layout/zweef/zweefPositie';

const NAAM = 'telefoon';
const ANKER: Anker = { links: 28, onder: 26 };
const STAAND: Maat = { b: 204, h: 486 };
const LIGGEND: Maat = { b: 486, h: 250 };
const CHIP: Maat = { b: 236, h: 34 };
/* De chip staat waar de kopbalk stond: zelfde linkerkant, en van onderen
   gerekend het verschil in hoogte erbij. */
const CHIP_ANKER: Anker = { links: ANKER.links, onder: (ANKER.onder ?? 0) + STAAND.h - CHIP.h };

function mobieleUrl(): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#/mobile`;
}

export function ZwevendeTelefoon() {
  const [verborgen, setVerborgen] = useState(() => laadVlag(NAAM, 'verborgen', window.localStorage));
  const [vast, setVast] = useState(() => laadVlag(NAAM, 'vast', window.localStorage));
  const [liggend, setLiggend] = useState(() => laadVlag(NAAM, 'liggend', window.localStorage));

  const zet = (vlag: 'verborgen' | 'vast' | 'liggend', aan: boolean) => {
    bewaarVlag(NAAM, vlag, aan, window.localStorage);
    if (vlag === 'verborgen') setVerborgen(aan);
    else if (vlag === 'vast') setVast(aan);
    else setLiggend(aan);
  };

  if (verborgen) {
    return (
      <Zwever naam={NAAM} anker={CHIP_ANKER} maat={CHIP} vast>
        <button type="button" className="axe-ruit axe-zwever__chip" title="Show iPhone" onClick={() => zet('verborgen', false)}>
          <ZweefIcoon naam="telefoon" /> iPhone 15 Pro
        </button>
      </Zwever>
    );
  }

  return (
    <Zwever
      naam={NAAM}
      anker={ANKER}
      maat={liggend ? LIGGEND : STAAND}
      vast={vast}
      className={liggend ? 'axe-telefoon axe-telefoon--liggend' : 'axe-telefoon'}
    >
      <div className="axe-ruit axe-telefoon__kop" data-greep>
        <ZweefIcoon naam="telefoon" /> iPhone 15 Pro · <span className="c-ok">live</span>
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
        <iframe src={mobieleUrl()} title="AXE mobile" loading="lazy" />
      </IphoneFrame>
    </Zwever>
  );
}
