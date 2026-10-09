/**
 * De kaarten onder de kaart op Home als AXE plaatsen heeft gezocht ("de dichtstbijzijnde elektronicawinkel"):
 * naam, afstand, adres, openingstijden, en wat je ermee doet -- route, bellen, website. Eén tik op een kaart
 * zet de kaart op die plek; de nummers komen overeen met de pins.
 *
 * Wat OpenStreetMap niet weet (uren, telefoon) wordt weggelaten, niet verzonnen.
 */
import { useEffect, useRef } from 'react';
import { ExternalLink, Navigation, Phone } from 'lucide-react';
import { formatAfstand } from '@/domain/plaatsen/plaatsen';

export interface PlaatsKaart {
  id: string; naam: string; lat: number; lng: number; soort: string;
  afstandM?: number; adres?: string; telefoon?: string; website?: string; openingstijden?: string; keuken?: string;
}

/** Alleen wat een plaats is, uit data die ergens anders is samengesteld. */
export function plaatsenUitData(data: Record<string, unknown> | undefined): PlaatsKaart[] {
  const ruw = data?.places;
  if (!Array.isArray(ruw)) return [];
  return ruw.filter((p): p is PlaatsKaart => (
    !!p && typeof p === 'object'
    && typeof (p as PlaatsKaart).naam === 'string'
    && Number.isFinite((p as PlaatsKaart).lat) && Number.isFinite((p as PlaatsKaart).lng)
  ));
}

function routeUrl(p: PlaatsKaart): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
}

/** Alleen http(s): een website uit OSM is door iemand ingevuld en mag geen javascript: zijn. */
function veiligeUrl(u?: string): string | null {
  if (!u) return null;
  const met = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try { const x = new URL(met); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null; } catch { return null; }
}

export function PlacesPanel({
  plaatsen, gekozen, opKies,
}: { plaatsen: PlaatsKaart[]; gekozen: string | null; opKies: (id: string) => void }) {
  const rij = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!gekozen) return;
    const el = rij.current?.querySelector<HTMLElement>(`[data-plaats="${CSS.escape(gekozen)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [gekozen]);

  return (
    <div
      ref={rij}
      className="axe-plaatsen"
      role="list"
      aria-label="Places found"
      onWheel={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
    >
      {plaatsen.map((p, i) => {
        const site = veiligeUrl(p.website);
        return (
          <article
            key={p.id} role="listitem" data-plaats={p.id} data-aan={p.id === gekozen ? 'ja' : undefined}
            className="axe-plaats" onClick={() => opKies(p.id)}
          >
            <header>
              <span className="axe-plaats-nr">{i + 1}</span>
              <b title={p.naam}>{p.naam}</b>
              {p.afstandM != null && <i>{formatAfstand(p.afstandM)}</i>}
            </header>
            {(p.keuken || p.adres) && <p>{[p.keuken, p.adres].filter(Boolean).join(' · ')}</p>}
            {p.openingstijden && <p className="axe-plaats-uren">Open {p.openingstijden}</p>}
            <footer>
              <a href={routeUrl(p)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><Navigation size={14} /> Route</a>
              {p.telefoon && <a href={`tel:${p.telefoon.replace(/[^\d+]/g, '')}`} onClick={e => e.stopPropagation()}><Phone size={14} /> Call</a>}
              {site && <a href={site} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><ExternalLink size={14} /> Site</a>}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
