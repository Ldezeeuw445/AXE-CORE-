/**
 * De standwissel, in de kopbalk.
 *
 * Staat hier en niet alleen in Settings omdat het een keuze is die je maakt
 * terwijl je kijkt: je wilt zien wat het met het scherm doet dat op dat moment
 * voor je staat, niet met het instellingenscherm. Drie klikken heen en drie
 * terug maakt van een vergelijking een herinnering.
 *
 * ## Twee knoppen, geen schakelaar
 *
 * Dit was één knop die van icoon wisselde (lagen / vierkant). Zo'n knop laat
 * alleen zien waar je BENT, of alleen waar je heen gaat -- en welke van de twee
 * is nooit af te lezen. De demo doet het als een paar: zon en maan naast
 * elkaar, de actieve licht op. Je ziet in één oogopslag welke stand aan staat
 * én dat er een andere is.
 *
 * Dezelfde bron als de kaart in Settings -- allebei useLook, dus ze kunnen niet
 * uit de pas lopen.
 */
import { useLook } from '@/presentation/hooks/useLook';

/* Streken, geen vlakken: de iconen in de kopregel zijn allemaal lijntekening,
   en een gevulde zon tussen lijnen leest als een andere soort ding. */
const streek = {
  width: 15,
  height: 15,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function LookToggle() {
  const [look, setLook] = useLook();
  const glass = look === 'glass';

  return (
    <div className="axe-daynight" role="group" aria-label="Licht of donker">
      <button
        type="button"
        className="axe-dn-btn"
        aria-pressed={glass}
        aria-label="Light"
        title="Light pane"
        onClick={() => setLook('glass')}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" {...streek}>
          <circle cx="10" cy="10" r="3.6" />
          <path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.5 1.5M14.2 14.2l1.5 1.5M15.7 4.3l-1.5 1.5M5.8 14.2l-1.5 1.5" />
        </svg>
      </button>
      <button
        type="button"
        className="axe-dn-btn"
        aria-pressed={!glass}
        aria-label="Dark"
        title="Black pane"
        onClick={() => setLook('black')}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" {...streek}>
          <path d="M16 11.5A6.5 6.5 0 1 1 8.5 4a5 5 0 0 0 7.5 7.5z" />
        </svg>
      </button>
    </div>
  );
}
