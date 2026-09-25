/**
 * De gedeelde layout van elke tab.
 *
 * Luka, 24 september 2026: één inhoudsruimte, inhoud bepaalt de maat,
 * matzwarte kaarten, Agents-sectieblokken, Browser-vormige schuifbalk.
 * Zie AGENTS.md en UI-MAATSTAF.md. Alleen vorm — geen data.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Lock, Settings, Smartphone, User } from 'lucide-react';
import { cn } from '@/shared/utils';

/* ── Inhoudsruimte ──────────────────────────────────────────────────────── */

export function TabRuimte({
  children,
  vullen = false,
  className,
}: {
  children: ReactNode;
  /** Website, kaart, agenda, grote tabel: vult het hele vak. */
  vullen?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'axe-tabruimte flex min-h-0 flex-1 flex-col',
        vullen && 'axe-tabruimte--vullen',
        className,
      )}
    >
      <div className={cn('axe-inhoud', vullen && 'axe-inhoud--vullen')}>
        {children}
      </div>
    </div>
  );
}

/* ── Kaart ──────────────────────────────────────────────────────────────── */

export function Kaart({
  children,
  className,
  titel,
  actie,
  compact = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  titel?: ReactNode;
  actie?: ReactNode;
  /** Stat of korte tegel: inhoud bepaalt de breedte. */
  compact?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section
      className={cn('axe-kaart', compact && 'axe-kaart--compact', className)}
      style={style}
    >
      {(titel != null && titel !== '') || actie ? (
        <header className="axe-kaart-kop">
          {titel != null && titel !== '' && <h3 className="axe-kaart-titel">{titel}</h3>}
          {actie}
        </header>
      ) : null}
      <div className="axe-kaart-lijf">{children}</div>
    </section>
  );
}

/* ── Sectieblok — WAR ROOM / WINGMAN'S CREW ─────────────────────────────── */

export function SectieBlok({
  id,
  titel,
  extra,
  children,
  className,
}: {
  id?: string;
  titel: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id ? `axe-sectie-${id}` : undefined}
      className={cn('axe-sectie', className)}
    >
      <header className="axe-sectie-kop">
        <h2 className="axe-sectie-titel">{titel}</h2>
        {extra}
      </header>
      <div className="axe-sectie-lijf">{children}</div>
    </section>
  );
}

/* ── Raster: gelijke kaarten, geen 1fr-rek ──────────────────────────────── */

export function KaartRaster({
  children,
  className,
  ruim = false,
}: {
  children: ReactNode;
  className?: string;
  /** Iets bredere kolom — serverkaarten met beschrijving. */
  ruim?: boolean;
}) {
  return (
    <div className={cn('axe-kaart-raster', ruim && 'axe-kaart-raster--ruim', className)}>
      {children}
    </div>
  );
}

export function StatRij({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('axe-stat-rij', className)}>{children}</div>;
}

/* ── Schuifbalk — vorm van de Browser-lade ──────────────────────────────── */

export type SchuifItem = {
  id: string;
  label: string;
  icoon?: ReactNode;
  actief?: boolean;
  onKies?: () => void;
};

export type SchuifGroep = {
  titel?: string;
  items: SchuifItem[];
};

export function SchuifBalk({
  groepen,
  className,
}: {
  groepen: SchuifGroep[];
  className?: string;
}) {

  return (
    <div className={cn('axe-schuifbalk', className)}>
      <div className="axe-schuifbalk-kaart">
        <div className="axe-schuifbalk-lijf">
          {groepen.map((groep, i) => (
            <div key={groep.titel ?? `groep-${i}`} className="axe-schuifbalk-groep">
              {groep.titel && <div className="axe-tab-group__label">{groep.titel}</div>}
              <div className="axe-schuifbalk-stack">
                {groep.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="axe-row !py-1.5"
                    data-active={item.actief || undefined}
                    onClick={item.onKies}
                  >
                    {item.icoon != null && <span className="axe-glyph">{item.icoon}</span>}
                    <span className="axe-row__text"><b>{item.label}</b></span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <SchuifVoet />
      </div>
    </div>
  );
}

/**
 * De voet van elke lade: wat niet in de onderbalk hoort maar wel altijd
 * bereikbaar moet zijn. Device Manager en Lock Screen komen van de telefoon-
 * versie; op de desktop stonden ze in de onderbalk en duwden die over de rand
 * (25 sep). Hier staan ze bij Settings, in elke lade dezelfde.
 */
export function SchuifVoet() {
  const navigeer = useNavigate();
  const items = [
    { pad: '/device', label: 'Device Manager', icoon: <Smartphone className="w-3.5 h-3.5" /> },
    { pad: '/lock', label: 'Lock Screen', icoon: <Lock className="w-3.5 h-3.5" /> },
    { pad: '/settings', label: 'Settings', icoon: <Settings className="w-3.5 h-3.5" /> },
    { pad: '/settings', label: 'Profile', icoon: <User className="w-3.5 h-3.5" /> },
  ];
  return (
    <div className="axe-schuifbalk-voet">
      {items.map((i) => (
        <button key={i.label} type="button" className="axe-row !py-1.5" onClick={() => navigeer(i.pad)}>
          <span className="axe-glyph">{i.icoon}</span>
          <span className="axe-row__text"><b>{i.label}</b></span>
        </button>
      ))}
    </div>
  );
}

/** Scroll naar een sectieblok. Alleen de plek; geen data. */
export function gaNaarSectie(id: string) {
  document.getElementById(`axe-sectie-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
