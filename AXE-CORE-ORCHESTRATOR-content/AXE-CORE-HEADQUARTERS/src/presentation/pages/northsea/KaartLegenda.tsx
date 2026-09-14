/**
 * De legenda van de NorthSea-kaart, in de topbalk.
 *
 * Stond eerst linksboven op de kaart zelf. Luka wil hem op de hele desk
 * altijd bovenin zien, dus hangt NorthseaDesk hem in TopbalkSlot -- naast
 * CORE ACTIVE, in dezelfde regel als de rest van de statusregel. Daarom plat
 * en klein: een stip, een naam, een getal.
 *
 * Wat er NIET op de kaart staat (en waarom) past niet in één regel. Het korte
 * "45/55 on map" staat er wel; de hele uitleg in de tooltip. Zo zegt de balk
 * nog steeds dat de kaart niet alles toont.
 *
 * ## Waarom hij zichzelf plaatst
 *
 * De view-knoppen (Awareness, Core, ...) staan `fixed` in het midden van het
 * scherm. De topbalk houdt er ruimte voor vrij met een leeg blokje, maar dat
 * blokje staat in de flow NA dit slot: hoe breder de legenda, hoe verder hij
 * dat blokje naar rechts duwt -- en de knoppen blijven waar ze zijn. Op Luka's
 * scherm liep de legenda daardoor onder "Awareness" door.
 *
 * Dus meet hij de vrije strook zelf: van de rechterkant van de statusgroep
 * (COMMAND CENTER · OPTIMAL · CORE ACTIVE) tot de linkerkant van de knoppen,
 * en zet zich daar in het midden, `fixed`, zodat hij het slot geen breedte
 * geeft en de rest van de balk niet verschuift. Past hij niet, dan valt eerst
 * het overbodige weg (de "on map"-teller en "· N active"), en daarna knipt
 * hij netjes af -- de tooltip houdt alles.
 */
import { useEffect, useRef, useState } from 'react';
import { redenenNietGeplaatst, type Kaart } from '@/domain/northsea/kaart';
import { REDEN_LABEL, STAND_STIJL, STAND_VOLGORDE } from './kaartStijl';

/** Dezelfde ster als de hubs op de kaart (WereldKaart). */
const STER = 'M0,-6 L1.76,-2.43 L5.71,-1.85 L2.85,0.93 L3.53,4.85 L0,3 L-3.53,4.85 L-2.85,0.93 L-5.71,-1.85 L-1.76,-2.43 Z';
/** Lucht aan beide kanten van de legenda, zodat hij nergens tegenaan plakt. */
const LUCHT = 20;
const HERMETEN_MS = 1000;

interface Plek { links: number; midden: number; max: number }

export function KaartLegenda({ kaart, totaal }: { kaart: Kaart | null; totaal: number | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [plek, setPlek] = useState<Plek | null>(null);
  const [compact, setCompact] = useState(false);
  /** De breedte zonder in te korten, gemeten zolang hij niet compact is. */
  const volleBreedte = useRef(0);

  useEffect(() => {
    const meet = () => {
      const el = ref.current;
      const slot = document.getElementById('axe-slot-topbalk');
      const statusgroep = slot?.previousElementSibling;
      if (!el || !slot || !statusgroep) return;
      const start = statusgroep.getBoundingClientRect().right + LUCHT;
      const knoppen = document.querySelector('.axe-viewctl')?.getBoundingClientRect();
      const rechts = document.getElementById('axe-slot-topbalk-rechts')?.getBoundingClientRect();
      const eind = (knoppen && knoppen.width > 0 ? knoppen.left : rechts?.left ?? window.innerWidth / 2) - LUCHT;
      const ruimte = Math.max(0, eind - start);

      if (el.dataset.compact !== 'ja') volleBreedte.current = el.scrollWidth;
      const moetCompact = volleBreedte.current > ruimte;
      setCompact(c => (c === moetCompact ? c : moetCompact));

      const breedte = Math.min(el.scrollWidth, ruimte);
      const s = slot.getBoundingClientRect();
      const nieuw: Plek = {
        links: Math.round(start + (ruimte - breedte) / 2),
        midden: Math.round(s.top + s.height / 2),
        max: Math.round(ruimte),
      };
      setPlek(p => (p && p.links === nieuw.links && p.midden === nieuw.midden && p.max === nieuw.max ? p : nieuw));
    };

    meet();
    const ro = new ResizeObserver(meet);
    if (ref.current) ro.observe(ref.current);
    const statusgroep = document.getElementById('axe-slot-topbalk')?.previousElementSibling;
    if (statusgroep) ro.observe(statusgroep);
    // De knoppen kunnen later verschijnen of van breedte wisselen (labels, Awareness).
    const iv = setInterval(meet, HERMETEN_MS);
    window.addEventListener('resize', meet);
    return () => { ro.disconnect(); clearInterval(iv); window.removeEventListener('resize', meet); };
  }, [kaart, totaal]);

  const redenen = kaart ? redenenNietGeplaatst(kaart.nietGeplaatst) : [];
  const benaderd = kaart ? kaart.routes.filter(r => r.benaderd).length : 0;
  const uitleg = kaart && totaal !== null
    ? `${kaart.routes.length} of ${totaal} deals on the map`
      + (kaart.geblokkeerdActief ? ` · blocked includes ${kaart.geblokkeerdActief} active` : '')
      + (benaderd ? ` · ${benaderd} approximate (faint)` : '')
      + (redenen.length ? ` · not shown: ${redenen.map(r => `${r.aantal} ${REDEN_LABEL[r.reden]}`).join(', ')}` : '')
    : 'Loading map…';

  return (
    <div ref={ref} data-compact={compact ? 'ja' : undefined}
      className="fixed z-10 flex items-center gap-3.5 overflow-hidden whitespace-nowrap text-[11px]"
      style={{
        left: plek?.links ?? 0,
        top: plek?.midden ?? 0,
        maxWidth: plek?.max,
        transform: 'translateY(-50%)',
        visibility: plek ? 'visible' : 'hidden',
        color: 'var(--text-secondary)',
      }}
      title={uitleg} data-axe-doel="northsea-legenda">
      {STAND_VOLGORDE.filter(s => s !== 'overig' || (kaart?.tellers.overig ?? 0) > 0).map(s => (
        <span key={s} className="flex shrink-0 items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STAND_STIJL[s].kleur, boxShadow: `0 0 7px ${STAND_STIJL[s].kleur}` }} />
          <span>{STAND_STIJL[s].label}</span>
          {kaart && (
            <span className="font-mono-data text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
              {kaart.tellers[s]}
              {/* Zonder dit zegt het kaartje "24 active" en de legenda "2": allebei
                  waar, want een blokkade gaat voor. Zie dealStand. Compact staat
                  het alleen nog in de tooltip. */}
              {!compact && s === 'geblokkeerd' && kaart.geblokkeerdActief > 0 && ` · ${kaart.geblokkeerdActief} active`}
            </span>
          )}
        </span>
      ))}
      <span className="flex shrink-0 items-center gap-1.5">
        <svg width="10" height="10" viewBox="-6 -6 12 12" aria-hidden><path d={STER} fill="#F8FAFC" /></svg>
        <span>Key Trade Hubs</span>
      </span>
      {!compact && kaart && totaal !== null && (
        <span className="shrink-0 font-mono-data text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
          {kaart.routes.length}/{totaal} on map
        </span>
      )}
    </div>
  );
}
