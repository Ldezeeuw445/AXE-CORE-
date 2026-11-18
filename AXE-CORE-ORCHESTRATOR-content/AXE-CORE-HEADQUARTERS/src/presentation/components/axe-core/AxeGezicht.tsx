/**
 * Het AXE-gezicht (Luka, 18 nov 2026): één familie avatars voor AXE, Claude
 * en elke manager, in de vorm van de bol in de notch -- rond, twee ogen,
 * licht van binnen. De kleur zegt wie het is, de ogen zeggen wat hij doet.
 *
 *  rust   twee rechte ogen
 *  werkt  ogen kijken opzij, blauw badge met drie puntjes
 *  wacht  halfdichte ogen, amber stip ("jouw beurt")
 *  fout   platte streepjes, rode stip
 *  klaar  blije boogjes
 *
 * Bewust zonder animatie: de notch staat 24/7 boven alles, met blur erachter,
 * en elk animatieframe kostte beide Macs CPU (18 nov). Een gezicht dat
 * verandert als de toestand verandert, leeft genoeg.
 */
export type Stemming = 'rust' | 'werkt' | 'wacht' | 'fout' | 'klaar';

/** AXE zelf is wit, zoals de bol in de notch. */
export const AXE_WIT = '#F4F6FA';
/** Claude: warm koraal, zodat je hem naast AXE meteen herkent. */
export const CLAUDE_KORAAL = '#E07A5F';

function mix(hex: string, wit: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  if (!Number.isFinite(n)) return hex;
  const k = (v: number) => Math.round(v + (255 - v) * wit);
  return `rgb(${k((n >> 16) & 255)}, ${k((n >> 8) & 255)}, ${k(n & 255)})`;
}

let teller = 0;

export function AxeGezicht({
  kleur = AXE_WIT,
  stemming = 'rust',
  size = 28,
  label,
}: {
  kleur?: string;
  stemming?: Stemming;
  size?: number;
  label?: string;
}) {
  // Eén gradient-id per instantie: twee gezichten op één pagina mogen elkaars kleur niet lenen.
  const id = `axg-${(teller = (teller + 1) % 1_000_000)}`;
  const oog = '#12151B';
  const ogen = (() => {
    switch (stemming) {
      case 'werkt':
        return (<>
          <rect x="27" y="23" width="6" height="16" rx="3" fill={oog} />
          <rect x="39" y="23" width="6" height="16" rx="3" fill={oog} />
        </>);
      case 'wacht':
        return (<>
          <rect x="21" y="30" width="7" height="7" rx="3.5" fill={oog} />
          <rect x="36" y="30" width="7" height="7" rx="3.5" fill={oog} />
        </>);
      case 'fout':
        return (<>
          <rect x="18" y="31" width="11" height="4" rx="2" fill={oog} />
          <rect x="35" y="31" width="11" height="4" rx="2" fill={oog} />
        </>);
      case 'klaar':
        return (<>
          <path d="M19 35 q5 -7 10 0" stroke={oog} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M35 35 q5 -7 10 0" stroke={oog} strokeWidth="4" fill="none" strokeLinecap="round" />
        </>);
      default:
        return (<>
          <rect x="22" y="23" width="6" height="16" rx="3" fill={oog} />
          <rect x="36" y="23" width="6" height="16" rx="3" fill={oog} />
        </>);
    }
  })();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label ? `${label} · ${stemming}` : stemming}
      data-stemming={stemming}
      style={{ flexShrink: 0, display: 'block', overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={id} cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor={mix(kleur, 0.72)} />
          <stop offset="55%" stopColor={mix(kleur, 0.25)} />
          <stop offset="100%" stopColor={kleur} />
        </radialGradient>
      </defs>
      {/* Zachte gloed in de eigen kleur: zo leest hij als licht, niet als sticker. */}
      <circle cx="32" cy="33" r="29" fill={kleur} opacity=".18" />
      <circle cx="32" cy="32" r="25" fill={`url(#${id})`} />
      {ogen}
      {stemming === 'werkt' && (
        <g>
          <circle cx="13" cy="13" r="9" fill="#3B82F6" stroke="#0B0D12" strokeWidth="2" />
          <circle cx="9.5" cy="13" r="1.6" fill="#fff" />
          <circle cx="13" cy="13" r="1.6" fill="#fff" />
          <circle cx="16.5" cy="13" r="1.6" fill="#fff" />
        </g>
      )}
      {stemming === 'wacht' && <circle cx="13" cy="13" r="6" fill="#FBBF24" stroke="#0B0D12" strokeWidth="2" />}
      {stemming === 'fout' && <circle cx="13" cy="13" r="6" fill="#EF4444" stroke="#0B0D12" strokeWidth="2" />}
    </svg>
  );
}
