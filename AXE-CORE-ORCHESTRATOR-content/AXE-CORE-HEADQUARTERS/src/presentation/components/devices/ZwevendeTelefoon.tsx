/**
 * De zwevende iPhone: een iPhone 15 Pro met daarin Luka's eigen apps. Het
 * scherm is een beginscherm (TelefoonScherm); een tik op een tegel of een chip
 * opent de app in het frame, een swipe omhoog of de home-indicator brengt je
 * terug.
 *
 * Alleen het toestel, zonder kopbalk of chip erboven. Aan en uit gaat met het
 * telefoon-icoon in het radiaal dok linksonder (telefoonZichtbaar.ts). Slepen
 * doe je aan de rand van het toestel; het scherm zelf blijft tikbaar, want dat
 * draagt data-geen-greep (zie IphoneFrame en NIET_SLEPEN in Zwever).
 *
 * Schaal .92 (361×784) als het venster dat toelaat. Hij zweeft OVER composer
 * en dok -- dat is de zweeflaag. Bij het tonen komt hij van onder het scherm
 * omhoog (680 ms) en zweeft daarna licht. `prefers-reduced-motion` en
 * `?anim=0` zetten dat stil.
 */
import { useState } from 'react';
import { IphoneFrame } from './IphoneFrame';
import { TelefoonScherm } from './TelefoonScherm';
import { MARGE_ONDER, TELEFOON_ECHT, animatieVlaggen, telefoonSchaal } from './launcher';
import { useTelefoonZichtbaar } from './telefoonZichtbaar';
import { Zwever } from '@/presentation/components/layout/zweef/Zwever';
import { useSchilMaten } from '@/presentation/components/layout/zweef/schilMaten';
import type { Anker, Maat } from '@/presentation/components/layout/zweef/zweefPositie';

const NAAM = 'telefoon';
/**
 * Rechts naast het radiaal dok linksonder (16 + 268 breed), niet eroverheen.
 * De zweeflaag ligt boven de hele schil, dus een telefoon op de plek van het
 * dok bedekt precies de knop waarmee je hem weer wegklikt. Gemeten 13 sep op
 * 1440x900: op links 20 lag hij over de dok-knop en was hij niet meer dicht te
 * krijgen.
 */
const LINKS = 16 + 268 + 8;

function useAnimatie() {
  return useState(() => animatieVlaggen({
    search: window.location.search,
    minderBeweging: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  }))[0];
}

export function ZwevendeTelefoon() {
  const zichtbaar = useTelefoonZichtbaar();
  const schil = useSchilMaten();
  const anim = useAnimatie();
  if (!zichtbaar) return null;

  const schaal = telefoonSchaal(schil.venster.h);
  const anker: Anker = { links: LINKS, onder: MARGE_ONDER };
  const maat: Maat = { b: Math.round(TELEFOON_ECHT.b * schaal), h: Math.round(TELEFOON_ECHT.h * schaal) };

  const lijfKlassen = [
    'axe-telefoon__lijf',
    anim.entree ? 'axe-telefoon__lijf--entree' : '',
    anim.zweef ? 'axe-telefoon__lijf--zweeft' : '',
  ].filter(Boolean).join(' ');

  return (
    <Zwever naam={NAAM} anker={anker} maat={maat} className="axe-telefoon">
      <div className={lijfKlassen} style={{ '--tel-schaal': schaal } as React.CSSProperties} data-greep>
        <IphoneFrame>
          <TelefoonScherm onApp={() => {}} />
        </IphoneFrame>
      </div>
    </Zwever>
  );
}
