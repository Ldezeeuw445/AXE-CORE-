/**
 * De bol van AXE, zwevend op elke pagina met plaat. Zonder HUD-balk: alleen de
 * bol. Aan en uit met de cyaan driehoek in het radiaal dok (bolZichtbaar.ts).
 *
 * Slepen aan de rand (de dunne ring rond de bol); het canvas zelf draai je.
 *
 * Hij leeft: meldt een deel van AXE dat het iets doet (shared/axeActiviteit),
 * dan valt de bol uiteen, vliegt als deeltjes naar dat deel van het scherm,
 * volgt daar even de rand met één regel over wat er gebeurt, en komt terug.
 * Je hoeft niets te zeggen; hij laat zien wat hij doet.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { ACTIVITEIT_GEBEURTENIS, type AxeActiviteit } from '@/shared/axeActiviteit';
import { kiesDoel, type Rechthoek } from '@/domain/bolVlucht';
import { Zwever } from './Zwever';
import { isBezig } from './bezig';
import { useSchilMaten } from './schilMaten';
import { bolCanvas, bolDoorsnee, bolStandaardPlek } from './bolPlek';
import { useBolZichtbaar } from './bolZichtbaar';
import { BolVlucht, type Vlucht } from './BolVlucht';
import type { Maat } from './zweefPositie';

const NAAM = 'bol';
const RAND = 10;

function vindDoel(doel: string): Rechthoek | null {
  const kandidaten = [
    ...document.querySelectorAll<HTMLElement>(`[data-axe-doel="${CSS.escape(doel)}"]`),
  ];
  for (const el of kandidaten) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, b: r.width, h: r.height };
  }
  return null;
}

export function ZwevendeBol() {
  const zichtbaar = useBolZichtbaar();
  const bezig = useVoiceStore((s) => isBezig(s.voiceStatus));
  const schil = useSchilMaten();
  const bolRef = useRef<HTMLDivElement | null>(null);
  const [vlucht, setVlucht] = useState<Vlucht | null>(null);
  const teller = useRef(0);

  useEffect(() => {
    if (!zichtbaar) return;
    const opActiviteit = (e: Event) => {
      const a = (e as CustomEvent<AxeActiviteit>).detail;
      const bol = bolRef.current?.getBoundingClientRect();
      if (!a || !bol || document.hidden) return;
      const gekozen = kiesDoel(a.doelen, vindDoel, { b: window.innerWidth, h: window.innerHeight });
      if (!gekozen) return;
      teller.current += 1;
      setVlucht({
        van: { x: bol.left + bol.width / 2, y: bol.top + bol.height / 2 },
        straal: bol.width / 2 * 0.8,
        rect: gekozen.rect,
        label: a.label.length > 80 ? `${a.label.slice(0, 77)}…` : a.label,
        kleur: a.kleur ?? '#22d3ee',
        id: teller.current,
      });
    };
    window.addEventListener(ACTIVITEIT_GEBEURTENIS, opActiviteit);
    return () => window.removeEventListener(ACTIVITEIT_GEBEURTENIS, opActiviteit);
  }, [zichtbaar]);

  if (!zichtbaar) return null;

  const doorsnee = Math.min(220, bolDoorsnee(schil.venster.b - schil.bandRechts));
  const maat: Maat = { b: doorsnee + 2 * RAND, h: doorsnee + 2 * RAND };
  const standaard = (venster: Maat) => bolStandaardPlek(venster, schil.bandRechts, maat);

  return (
    <>
      <Zwever naam={NAAM} standaard={standaard} maat={maat} className="axe-bol-vrij">
        <div className="axe-bol-vrij__greep" data-greep title="Sleep aan de rand · draai de bol">
          <div
            ref={bolRef}
            className={`axe-bol-plaat__bol axe-bol-vrij__bol${vlucht ? ' axe-bol-vrij__bol--uiteen' : ''}`}
            style={{ '--bol': `${doorsnee}px`, '--bol-canvas': `${bolCanvas(doorsnee)}px`, left: RAND, top: RAND } as CSSProperties}
          >
            <AxeCoreSphere boost={bezig || vlucht ? 1 : 0} />
          </div>
        </div>
      </Zwever>
      <BolVlucht vlucht={vlucht} klaar={() => setVlucht(null)} />
    </>
  );
}
