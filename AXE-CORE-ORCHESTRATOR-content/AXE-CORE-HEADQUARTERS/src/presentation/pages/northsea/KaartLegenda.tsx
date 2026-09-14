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
 */
import { redenenNietGeplaatst, type Kaart } from '@/domain/northsea/kaart';
import { REDEN_LABEL, STAND_STIJL, STAND_VOLGORDE } from './kaartStijl';

/** Dezelfde ster als de hubs op de kaart (WereldKaart). */
const STER = 'M0,-6 L1.76,-2.43 L5.71,-1.85 L2.85,0.93 L3.53,4.85 L0,3 L-3.53,4.85 L-2.85,0.93 L-5.71,-1.85 L-1.76,-2.43 Z';

export function KaartLegenda({ kaart, totaal }: { kaart: Kaart | null; totaal: number | null }) {
  const redenen = kaart ? redenenNietGeplaatst(kaart.nietGeplaatst) : [];
  const benaderd = kaart ? kaart.routes.filter(r => r.benaderd).length : 0;
  const uitleg = kaart && totaal !== null
    ? `${kaart.routes.length} of ${totaal} deals on the map`
      + (benaderd ? ` · ${benaderd} approximate (faint)` : '')
      + (redenen.length ? ` · not shown: ${redenen.map(r => `${r.aantal} ${REDEN_LABEL[r.reden]}`).join(', ')}` : '')
    : 'Loading map…';

  return (
    <div className="ml-3 flex min-w-0 items-center gap-3.5 overflow-hidden whitespace-nowrap text-[11px]"
      style={{ color: 'var(--text-secondary)' }} title={uitleg} data-axe-doel="northsea-legenda">
      {STAND_VOLGORDE.filter(s => s !== 'overig' || (kaart?.tellers.overig ?? 0) > 0).map(s => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STAND_STIJL[s].kleur, boxShadow: `0 0 7px ${STAND_STIJL[s].kleur}` }} />
          <span>{STAND_STIJL[s].label}</span>
          {kaart && (
            <span className="font-mono-data text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
              {kaart.tellers[s]}
              {/* Zonder dit zegt het kaartje "24 active" en de legenda "2": allebei
                  waar, want een blokkade gaat voor. Zie dealStand. */}
              {s === 'geblokkeerd' && kaart.geblokkeerdActief > 0 && ` · ${kaart.geblokkeerdActief} active`}
            </span>
          )}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="-6 -6 12 12" aria-hidden><path d={STER} fill="#F8FAFC" /></svg>
        <span>Key Trade Hubs</span>
      </span>
      {kaart && totaal !== null && (
        <span className="font-mono-data text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
          {kaart.routes.length}/{totaal} on map
        </span>
      )}
    </div>
  );
}
