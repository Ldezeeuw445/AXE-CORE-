import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

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
  columns?: 2 | 3 | 4;
  tiles: readonly HubV3Tile[];
  children?: ReactNode;
};

export function HubV3({ tab, title, sub, columns = 3, tiles, children }: Props) {
  const navigate = useNavigate();
  const cols = columns === 2 ? 'g2' : columns === 4 ? 'g4' : '';
  return (
    <div className="axe-hub-v3" data-axe-hub="v3" data-axe-tab={tab}>
      <header className="axe-hub-v3-kop">
        <h1>
          {title} <span className="axe-hub-v3-sub">{sub}</span>
        </h1>
      </header>
      <div className={`axe-hub-v3-grid ${cols}`.trim()}>
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            className="axe-hub-v3-tile"
            onClick={() => {
              if (t.onClick) t.onClick();
              else if (t.path) navigate(t.path);
            }}
          >
            <div className="axe-hub-v3-tile-row">
              <span className="axe-hub-v3-label">{t.label}</span>
              {t.badge ? (
                <span className="axe-hub-v3-badge" data-tone={t.badgeTone ?? 'ex'}>{t.badge}</span>
              ) : null}
            </div>
            {t.note ? <p className="axe-hub-v3-note">{t.note}</p> : null}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
