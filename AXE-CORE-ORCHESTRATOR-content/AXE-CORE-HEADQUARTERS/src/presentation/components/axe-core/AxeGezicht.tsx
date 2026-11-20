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
 * Bewust zonder animatie: de notch staat 24/7 boven alles, met blur erachter,
 * en elk animatieframe kostte beide Macs CPU (18 nov).
 */
import './AxeGezicht.css';

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
}: {
  kleur?: string;
  stemming?: Stemming;
  size?: number;
  label?: string;
  /** Knipperen, en rondkijken als hij werkt. Alleen waar hij groot staat
   *  (de notch); in lijsten met tien gezichten wordt het onrustig. */
  levend?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label ? `${label} · ${stemming}` : stemming}
      data-stemming={stemming}
      data-levend={levend ? '' : undefined}
      className="axe-gezicht"
      style={{
        flexShrink: 0,
        display: 'block',
        overflow: 'visible',
        // In de glasstand staat dit driehoekje op een lichte bureaubladfoto.
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.55))',
      }}
    >
      <path d={DRIEHOEK} fill={kleur} />
      <g className="axe-gezicht__kijk">
        <g className="axe-gezicht__knipper">
          <Ogen stemming={stemming} />
        </g>
      </g>
      {stemming === 'werkt' && (
        <g>
          <circle cx="12" cy="14" r="9" fill="#3B82F6" stroke="#0B0D12" strokeWidth="2" />
          <circle cx="8.5" cy="14" r="1.6" fill="#fff" />
          <circle cx="12" cy="14" r="1.6" fill="#fff" />
          <circle cx="15.5" cy="14" r="1.6" fill="#fff" />
        </g>
      )}
      {stemming === 'wacht' && <circle cx="12" cy="14" r="6" fill="#FBBF24" stroke="#0B0D12" strokeWidth="2" />}
      {stemming === 'fout' && <circle cx="12" cy="14" r="6" fill="#EF4444" stroke="#0B0D12" strokeWidth="2" />}
    </svg>
  );
}
