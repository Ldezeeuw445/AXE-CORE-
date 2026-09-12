/**
 * Een radiaal menu: een knop in het midden, en de rest hangt er in een boog
 * omheen.
 *
 * ## Waarom één component en niet twee
 *
 * "Radial menu" en "circle navigation" zijn dezelfde vorm met een andere boog.
 * Een halve ring die uit een knop in een hoek openklapt is `boog={180}`; een
 * volle cirkel navigatie is `boog={360}`. Twee componenten bouwen zou betekenen
 * dat een bugfix in de ene niet in de andere zit, en dat is precies het soort
 * dubbelbouw dat hier al vaker misging.
 *
 * ## Waarom het rekenwerk hier niet staat
 *
 * De posities komen uit `radiaal.ts`, met tests. Dit bestand mag alleen over
 * stijl en toetsenbord gaan. Zodra hier `Math.cos` staat is er iets fout.
 *
 * ## Toetsenbord
 *
 * Een menu dat alleen met de muis werkt is geen menu. Escape sluit, en de items
 * blijven gewone buttons in DOM-volgorde zodat Tab ze in de volgorde afgaat die
 * je op het scherm ziet -- de hoek verplaatst ze alleen visueel.
 */
import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { radiaalPosities } from '@/domain/radiaal';

export interface RadiaalItem {
  id: string;
  /** Wordt als tooltip en als schermlezertekst gebruikt. */
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Zet hem aan als deze het huidige item is (bij navigatie). */
  actief?: boolean;
}

interface Props {
  items: RadiaalItem[];
  /** Wat er in de middenknop staat. Laat leeg voor een altijd-open ring. */
  centrum?: ReactNode;
  straal?: number;
  startHoek?: number;
  boog?: number;
  /** Maat van de knoppen in pixels. */
  knop?: number;
  /** Altijd open, zonder middenknop om te klappen. */
  altijdOpen?: boolean;
  className?: string;
}

export function RadialMenu({
  items,
  centrum,
  straal = 86,
  startHoek = 0,
  boog = 360,
  knop = 40,
  altijdOpen = false,
  className,
}: Props) {
  const [open, setOpen] = useState(altijdOpen);
  const wortel = useRef<HTMLDivElement | null>(null);

  const sluit = useCallback(() => {
    if (!altijdOpen) setOpen(false);
  }, [altijdOpen]);

  // Escape en een klik erbuiten sluiten hem. Zonder dit blijft een openklappend
  // menu over de rest van het scherm hangen zodra je ergens anders klikt.
  useEffect(() => {
    if (!open || altijdOpen) return;
    const opToets = (e: KeyboardEvent) => { if (e.key === 'Escape') sluit(); };
    const opKlik = (e: MouseEvent) => {
      if (wortel.current && !wortel.current.contains(e.target as Node)) sluit();
    };
    window.addEventListener('keydown', opToets);
    window.addEventListener('mousedown', opKlik);
    return () => {
      window.removeEventListener('keydown', opToets);
      window.removeEventListener('mousedown', opKlik);
    };
  }, [open, altijdOpen, sluit]);

  const punten = radiaalPosities(items.length, { straal, startHoek, boog });
  const vak = (straal + knop) * 2;

  return (
    <div
      ref={wortel}
      className={`relative select-none ${className ?? ''}`}
      style={{ width: vak, height: vak }}
    >
      {items.map((item, i) => {
        const punt = punten[i];
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            // aria-hidden zou hier fout zijn: de knop is er, hij staat alleen
            // op zijn plek te wachten. tabIndex houdt hem uit de tab-orde
            // zolang het menu dicht is.
            tabIndex={open ? 0 : -1}
            onClick={() => { item.onSelect(); sluit(); }}
            className="absolute inline-flex items-center justify-center rounded-full transition-all duration-300"
            style={{
              left: '50%',
              top: '50%',
              width: knop,
              height: knop,
              marginLeft: -knop / 2,
              marginTop: -knop / 2,
              // Dicht liggen ze allemaal op het midden, met een kleine
              // vertraging per item zodat ze uitvouwen in plaats van springen.
              transform: open
                ? `translate(${punt.x}px, ${punt.y}px) scale(1)`
                : 'translate(0px, 0px) scale(0.4)',
              transitionDelay: `${open ? i * 28 : 0}ms`,
              opacity: open ? 1 : 0,
              pointerEvents: open ? 'auto' : 'none',
              border: `1px solid ${item.actief ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
              backdropFilter: 'blur(10px)',
              color: item.actief ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            {item.icon}
          </button>
        );
      })}

      {!altijdOpen && (
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Menu sluiten' : 'Menu openen'}
          onClick={() => setOpen((v) => !v)}
          className="absolute inline-flex items-center justify-center rounded-full transition-transform duration-300"
          style={{
            left: '50%',
            top: '50%',
            width: knop + 8,
            height: knop + 8,
            marginLeft: -(knop + 8) / 2,
            marginTop: -(knop + 8) / 2,
            transform: `rotate(${open ? 45 : 0}deg)`,
            border: '1px solid var(--border-default)',
            backdropFilter: 'blur(10px)',
            color: 'var(--text-primary)',
            background: 'rgba(255,255,255,0.06)',
          }}
        >
          {centrum}
        </button>
      )}
    </div>
  );
}
