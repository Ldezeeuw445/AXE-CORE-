/**
 * Een doorlopende strook — koersen, meldingen, wat er net gebeurde.
 *
 * ## Waarom de inhoud twee keer in de dom staat
 *
 * Een strook die naar links schuift en dan terugspringt, hapert zichtbaar op
 * het sprongpunt. De inhoud staat er daarom twee keer, en de animatie schuift
 * precies de helft op: op het moment dat de eerste kopie eruit loopt, staat de
 * tweede exact waar de eerste begon. De sprong valt dan op een identiek beeld
 * en is onzichtbaar.
 *
 * `aria-hidden` op de tweede kopie: een schermlezer hoort alles één keer.
 *
 * ## Waarom hij stopt bij hover en bij prefers-reduced-motion
 *
 * Bij hover omdat je iets wilt lezen dat wegschuift, en dat is de enige reden
 * dat je er met je muis naartoe gaat. Bij reduced-motion omdat eindeloos
 * schuivende tekst voor sommige mensen letterlijk misselijkmakend is; dan staat
 * hij stil en kun je scrollen.
 */
import { useRef, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Seconden voor één volledige ronde. Langer = langzamer. */
  duur?: number;
  /** Naar links (standaard) of naar rechts. */
  richting?: 'links' | 'rechts';
  /** Ruimte tussen de twee kopieën. */
  gat?: number;
  className?: string;
}

export function Ticker({ children, duur = 40, richting = 'links', gat = 48, className }: Props) {
  const id = useRef(`tick-${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <div className={`overflow-hidden ${className ?? ''}`} style={{ maskImage: 'linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)', WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)' }}>
      <style>{`
        @keyframes ${id} {
          from { transform: translateX(0); }
          to   { transform: translateX(${richting === 'links' ? '-50%' : '50%'}); }
        }
        .${id} {
          display: inline-flex;
          gap: ${gat}px;
          padding-right: ${gat}px;
          white-space: nowrap;
          will-change: transform;
          animation: ${id} ${duur}s linear infinite;
        }
        .${id}:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .${id} { animation: none; }
        }
      `}</style>
      <div className={id}>
        <span className="inline-flex items-center" style={{ gap: gat }}>{children}</span>
        <span className="inline-flex items-center" style={{ gap: gat }} aria-hidden="true">{children}</span>
      </div>
    </div>
  );
}
