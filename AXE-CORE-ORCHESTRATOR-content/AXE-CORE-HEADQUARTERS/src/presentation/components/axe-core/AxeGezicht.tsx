/**
 * Het AXE-gezicht: het driehoekje met twee ogen uit het Managers-tabblad
 * (vorm van TriangleLogo.tsx, met ronde hoeken), elk in zijn eigen kleur.
 * Luka, 19 nov 2026: déze avatars horen ook in de notch -- AXE, de managers,
 * en één voor Claude. (Niet de ronde notch-bol overal; dat was mijn fout.)
 *
 * De ogen zeggen wat hij doet:
 *  rust   twee rechte ogen
 *  werkt  ogen kijken opzij, blauw badge met drie puntjes
 *  wacht  halfdichte ogen, amber stip ("jouw beurt")
 *  fout   platte streepjes, rode stip
 *  klaar  blije boogjes
 *
 * Zonder `levend` staat hij stil (lijsten, tabbladen). Met `levend` leeft hij
 * (Luka 27 nov: "levend, zoals op de foto's"): ademen, knipperen, rondkijken,
 * per stemming anders. Alleen transform/opacity, dus de compositor doet het
 * werk; de blur achter de notch die op 18 nov CPU kostte, is sinds v3 weg.
 * `fase` schuift het ritme op, zodat een rij gezichten niet in koor knippert.
 *
 * v5 (Luka 27 nov t78u): knipperen en kijken komen uit gezichtLeven.ts, met
 * spreiding (geen loop meer); de held schuift een fractie mee met de muis
 * (parallax), en een nieuwe stemming vloeit over in plaats van te springen.
 */
import { type RefObject, useEffect, useRef } from 'react';
import { knippertOoit, volgendeBlik, volgendeKnipper } from '../../../domain/overlay/gezichtLeven';
import './AxeGezicht.css';

/** Minder beweging gevraagd? Dan geen klokjes, niets. */
function wilMinderBeweging(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * v5 (Luka 27 nov t78u: "realistischer, echt premium"): knipperen en kijken
 * met spreiding in plaats van een vaste CSS-loop. Zet alleen een attribuut en
 * twee CSS-variabelen op het eigen <svg> (geen React-render per knipper); de
 * CSS doet de beweging met transform, dus de compositor.
 */
function useLevendeOgen(ref: RefObject<SVGSVGElement | null>, stemming: Stemming, aan: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!aan || !el || wilMinderBeweging()) return;
    const klokjes = new Set<ReturnType<typeof setTimeout>>();
    const na = (ms: number, f: () => void) => {
      const t = setTimeout(() => { klokjes.delete(t); f(); }, ms);
      klokjes.add(t);
    };
    const knipper = () => {
      const k = volgendeKnipper(stemming);
      na(k.over, () => {
        if (document.hidden) return knipper();
        el.setAttribute('data-knip', '');
        na(k.dicht, () => {
          el.removeAttribute('data-knip');
          if (k.dubbel) na(150 + k.dicht, () => { el.setAttribute('data-knip', ''); na(k.dicht, () => el.removeAttribute('data-knip')); });
          knipper();
        });
      });
    };
    const kijk = () => {
      const b = volgendeBlik(stemming);
      if (!b) return;
      na(b.over, () => {
        el.style.setProperty('--axe-oog-x', String(b.x));
        el.style.setProperty('--axe-oog-y', String(b.y));
        el.style.setProperty('--axe-sprong', `${b.sprong}ms`);
        kijk();
      });
    };
    if (knippertOoit(stemming)) knipper();
    kijk();
    return () => {
      klokjes.forEach(clearTimeout);
      el.removeAttribute('data-knip');
      el.style.removeProperty('--axe-oog-x');
      el.style.removeProperty('--axe-oog-y');
    };
  }, [ref, stemming, aan]);
}

export type Stemming = 'rust' | 'werkt' | 'wacht' | 'fout' | 'klaar';

/** AXE Core: zijn eigen cyaan uit roster.ts. */
export const AXE_CYAAN = '#22D3EE';
/** Claude: warm koraal, zodat je hem naast AXE meteen herkent. */
export const CLAUDE_KORAAL = '#E07A5F';

/** Driehoek met ronde hoeken, in hetzelfde 64×64-vak als TriangleLogo. */
const DRIEHOEK =
  'M32 7.5c2.3 0 4.4 1.25 5.5 3.3l20.2 35.8c2.2 3.9-.6 8.7-5.1 8.7H11.4' +
  'c-4.5 0-7.3-4.8-5.1-8.7L26.5 10.8A6.3 6.3 0 0 1 32 7.5z';

const OOG = '#101319';

function Ogen({ stemming }: { stemming: Stemming }) {
  switch (stemming) {
    case 'werkt':
      return (<>
        <rect x="27.6" y="34" width="4.6" height="10.5" rx="2.3" fill={OOG} />
        <rect x="36.2" y="34" width="4.6" height="10.5" rx="2.3" fill={OOG} />
      </>);
    case 'wacht':
      return (<>
        <rect x="25.4" y="38.5" width="4.6" height="5" rx="2.3" fill={OOG} />
        <rect x="34" y="38.5" width="4.6" height="5" rx="2.3" fill={OOG} />
      </>);
    case 'fout':
      return (<>
        <rect x="22.5" y="39" width="8" height="3.2" rx="1.6" fill={OOG} />
        <rect x="33.5" y="39" width="8" height="3.2" rx="1.6" fill={OOG} />
      </>);
    case 'klaar':
      return (<>
        <path d="M23.5 42 q3.6 -5.5 7.2 0" stroke={OOG} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M33.3 42 q3.6 -5.5 7.2 0" stroke={OOG} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      </>);
    default:
      return (<>
        <rect x="25.4" y="34" width="4.6" height="10.5" rx="2.3" fill={OOG} />
        <rect x="34" y="34" width="4.6" height="10.5" rx="2.3" fill={OOG} />
      </>);
  }
}

export function AxeGezicht({
  kleur = AXE_CYAAN,
  stemming = 'rust',
  size = 28,
  label,
  levend = false,
  fase = 0,
  volg = false,
}: {
  kleur?: string;
  stemming?: Stemming;
  size?: number;
  label?: string;
  /** Knipperen, en rondkijken als hij werkt. Alleen waar hij groot staat
   *  (de notch); in lijsten met tien gezichten wordt het onrustig. */
  levend?: boolean;
  /** Seconden voorsprong in het ritme (knipperen, ademen); per gezicht anders. */
  fase?: number;
  /** Ogen volgen de muis via --axe-kijk-x/-y op een ouder (alleen de held). */
  volg?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useLevendeOgen(ref, stemming, levend);
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label ? `${label} · ${stemming}` : stemming}
      data-stemming={stemming}
      data-levend={levend ? '' : undefined}
      data-volg={volg ? '' : undefined}
      className="axe-gezicht"
      style={{
        ['--axe-fase' as string]: `${-Math.abs(fase)}s`,
        flexShrink: 0,
        display: 'block',
        overflow: 'visible',
        // In de glasstand staat dit driehoekje op een lichte bureaubladfoto.
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.55))',
      }}
    >
      <g className="axe-gezicht__lijf">
        <path d={DRIEHOEK} fill={kleur} className="axe-gezicht__vorm" />
        {/* Fijne lichtrand bovenop: diepte zonder gloed. */}
        <path d={DRIEHOEK} fill="none" stroke="#fff" strokeOpacity={levend ? 0.18 : 0} strokeWidth="1" className="axe-gezicht__rand" />
        <g className="axe-gezicht__volg">
          <g className="axe-gezicht__kijk">
            <g className="axe-gezicht__knipper">
              {/* key: bij een nieuwe stemming vloeien de ogen over, geen sprong. */}
              <g key={stemming} className="axe-gezicht__ogen">
                <Ogen stemming={stemming} />
              </g>
            </g>
          </g>
        </g>
      </g>
      {stemming === 'werkt' && (
        <g className="axe-gezicht__badge">
          <circle cx="12" cy="14" r="9" fill="#3B82F6" stroke="#0B0D12" strokeWidth="2" />
          <circle cx="8.5" cy="14" r="1.6" fill="#fff" />
          <circle cx="12" cy="14" r="1.6" fill="#fff" />
          <circle cx="15.5" cy="14" r="1.6" fill="#fff" />
        </g>
      )}
      {stemming === 'wacht' && <circle className="axe-gezicht__badge" cx="12" cy="14" r="6" fill="#FBBF24" stroke="#0B0D12" strokeWidth="2" />}
      {stemming === 'fout' && <circle className="axe-gezicht__badge" cx="12" cy="14" r="6" fill="#EF4444" stroke="#0B0D12" strokeWidth="2" />}
    </svg>
  );
}
