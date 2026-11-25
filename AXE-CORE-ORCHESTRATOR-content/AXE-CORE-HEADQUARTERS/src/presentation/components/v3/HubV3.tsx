import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { DashSchil, DashKop, DashRaster, DashKaart, type DashCijfer } from '@/presentation/components/layout/dashboardSchil';

export type HubV3Tile = {
  id: string;
  label: string;
  note?: string;
  badge?: string;
  badgeTone?: 'ex' | 'docs' | 'stage' | 'wait' | 'live';
  path?: string;
  onClick?: () => void;
};

type Props = {
  tab: string;
  title: string;
  sub: string;
  columns?: 2 | 3 | 4 | 5;
  tiles: readonly HubV3Tile[];
  /** Echte cijfers in de kopstrook (optioneel). */
  cijfers?: DashCijfer[];
  /** Live kaarten vóór de tegels; elk telt als één vak in het raster. */
  kaarten?: ReactNode;
  /** Aantal vakken dat `kaarten` inneemt, zodat het raster klopt. */
  kaartVakken?: number;
  children?: ReactNode;
};

/**
 * Hub-tab als dashboard (25 nov): kopstrook + een raster van gelijke tegels
 * dat de hele tabruimte vult. Geen lege halve pagina onder zes tegels meer,
 * en de pagina schuift niet. Aantal kolommen volgt uit het aantal vakken.
 */
export function HubV3({ tab, title, sub, columns, tiles, cijfers, kaarten, kaartVakken = 0, children }: Props) {
  const navigate = useNavigate();
  const vakken = tiles.length + kaartVakken;
  const kolommen = columns ?? (vakken <= 4 ? 2 : vakken <= 6 ? 3 : vakken <= 8 ? 4 : 5);
  const rijen = Math.max(1, Math.ceil(vakken / kolommen));
  return (
    <div className="axe-hub-v3 contents" data-axe-hub="v3" data-axe-tab={tab}>
      <DashSchil tab={tab} kop={<DashKop titel={title} sub={sub} cijfers={cijfers} />}>
        <DashRaster kolommen={kolommen} rijen={rijen} className="axe-hub-v3-grid">
          {kaarten}
          {tiles.map((t) => (
            <DashKaart
              key={t.id}
              className="axe-hub-v3-tile"
              titel={t.label}
              actie={t.badge ? <span className="axe-hub-v3-badge" data-tone={t.badgeTone ?? 'ex'}>{t.badge}</span> : undefined}
              onKlik={() => {
                if (t.onClick) t.onClick();
                else if (t.path) navigate(t.path);
              }}
            >
              {t.note ? <p className="axe-dash-tegel-note">{t.note}</p> : null}
            </DashKaart>
          ))}
        </DashRaster>
        {children}
      </DashSchil>
    </div>
  );
}
