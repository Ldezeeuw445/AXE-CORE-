/**
 * De dashboardschil: elke tab één scherm, de pagina zelf schuift nooit.
 *
 * Luka, 25 nov 2026: "elke tab en alle andere pagina's echt één dashboard,
 * niet meer scrollen, overal dezelfde strakke layout zoals de browser-tab".
 * Dit is de vorm daarvoor, afgeleid van Browser-home: één kopstrook, daaronder
 * een raster van gelijke matzwarte kaarten (`.axe-kaart`) dat precies de
 * tabruimte vult. Past iets niet, dan schuift alleen het lijf van die ene
 * kaart, of het zit achter tabs in de kaart (`DashKaart tabs`) of in een
 * venster (`DashVenster`). Alleen vorm, geen data -- elke tab brengt zijn
 * eigen echte bronnen mee. Zie UI-MAATSTAF.md, "Dashboardschil".
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useDashModus } from './useDashModus';
import { X } from 'lucide-react';
import { cn } from '@/shared/utils';
import { TabRuimte } from './tabMaatstaf';

/* ── Schil: tabruimte die vult, nooit schuift ───────────────────────────── */

export function DashSchil({
  tab,
  kop,
  children,
  className,
}: {
  /** Voor metingen en tests: data-axe-dash="<tab>". */
  tab: string;
  kop?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useDashModus(tab);
  return (
    <TabRuimte vullen>
      <div className={cn('axe-dash', className)} data-axe-dash={tab}>
        {kop}
        {children}
      </div>
    </TabRuimte>
  );
}

/* ── Kopstrook: titel links, cijfers midden, acties rechts ──────────────── */

export type DashCijfer = {
  label: string;
  waarde: ReactNode;
  sub?: ReactNode;
  /** Kleur in de letters, niet in het vlak (UI-MAATSTAF regel 5). */
  toon?: 'ok' | 'warn' | 'fout';
};

export function DashKop({
  titel,
  sub,
  cijfers,
  acties,
}: {
  titel: ReactNode;
  sub?: ReactNode;
  cijfers?: DashCijfer[];
  acties?: ReactNode;
}) {
  return (
    <header className="axe-dash-kop">
      <div className="axe-dash-kop-titel">
        <h1>{titel}</h1>
        {sub != null && <p>{sub}</p>}
      </div>
      {cijfers && cijfers.length > 0 && (
        <div className="axe-dash-cijfers" data-axe-gelijk="dash-cijfers">
          {cijfers.map((c) => (
            <div key={c.label} className="axe-dash-cijfer" data-toon={c.toon}>
              <span className="axe-dash-cijfer-label">{c.label}</span>
              <b className="axe-dash-cijfer-waarde">{c.waarde}</b>
              {c.sub != null && <span className="axe-dash-cijfer-sub">{c.sub}</span>}
            </div>
          ))}
        </div>
      )}
      {acties != null && <div className="axe-dash-acties">{acties}</div>}
    </header>
  );
}

/* ── Raster: gelijke sporen in beide richtingen, vult de rest ───────────── */

export function DashRaster({
  kolommen = 3,
  rijen = 2,
  children,
  className,
}: {
  kolommen?: number;
  rijen?: number;
  children: ReactNode;
  className?: string;
}) {
  const style = { '--dash-kolommen': kolommen, '--dash-rijen': rijen } as CSSProperties;
  return (
    <div className={cn('axe-dash-raster', className)} style={style} data-axe-dash-raster="">
      {children}
    </div>
  );
}

/* ── Kaart: span in rastereenheden, lijf schuift alleen als het moet ───── */

export type DashTab = { id: string; label: string; telling?: number; inhoud: ReactNode };

export function DashKaart({
  titel,
  telling,
  actie,
  kolom = 1,
  rij = 1,
  tabs,
  vrij = false,
  children,
  className,
  onKlik,
}: {
  titel?: ReactNode;
  telling?: number;
  actie?: ReactNode;
  /** Breedte in kolommen van het raster. */
  kolom?: 1 | 2 | 3 | 4;
  /** Hoogte in rijen van het raster. */
  rij?: 1 | 2 | 3;
  /** Meer inhoud dan één vak: tabs in de kaartkop in plaats van schuiven. */
  tabs?: DashTab[];
  /** Lijf zonder binnenmarge (tabel, kaart, eigen paneel). */
  vrij?: boolean;
  children?: ReactNode;
  className?: string;
  /** Hele kaart is een knop (navigatietegel). */
  onKlik?: () => void;
}) {
  const [actief, setActief] = useState(tabs?.[0]?.id);
  const huidige = tabs?.find((t) => t.id === actief) ?? tabs?.[0];
  const style = { gridColumn: `span ${kolom}`, gridRow: `span ${rij}` } as CSSProperties;
  const kop = (titel != null || actie != null || (tabs && tabs.length > 0)) && (
    <header className="axe-dash-kaart-kop">
      {tabs && tabs.length > 0 ? (
        <div className="axe-dash-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === huidige?.id}
              data-actief={t.id === huidige?.id || undefined}
              className="axe-dash-tab"
              onClick={(e) => { e.stopPropagation(); setActief(t.id); }}
            >
              {t.label}
              {t.telling != null && <span className="axe-dash-telling">{t.telling}</span>}
            </button>
          ))}
        </div>
      ) : (
        <h3 className="axe-dash-kaart-titel">
          {titel}
          {telling != null && <span className="axe-dash-telling">{telling}</span>}
        </h3>
      )}
      {actie}
    </header>
  );
  const lijf = (
    <div className={cn('axe-dash-kaart-lijf', vrij && 'axe-dash-kaart-lijf--vrij')}>
      {huidige ? huidige.inhoud : children}
    </div>
  );
  if (onKlik) {
    return (
      <button type="button" className={cn('axe-kaart axe-dash-kaart axe-dash-kaart--knop', className)} style={style} onClick={onKlik}>
        {kop}
        {lijf}
      </button>
    );
  }
  return (
    <section className={cn('axe-kaart axe-dash-kaart', className)} style={style}>
      {kop}
      {lijf}
    </section>
  );
}

/** Lege staat in een kaart: eerlijk zeggen dat er niets is, nooit verzinnen. */
export function DashLeeg({ children }: { children: ReactNode }) {
  return <p className="axe-dash-leeg">{children}</p>;
}

/* ── Venster: wat niet in het raster past (formulier, alles-lijst) ─────── */

export function DashVenster({
  open,
  titel,
  onSluit,
  children,
  breed = false,
}: {
  open: boolean;
  titel: ReactNode;
  onSluit: () => void;
  children: ReactNode;
  /** Brede variant voor een hele sectie (Settings): bijna de volle tabruimte. */
  breed?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="axe-dash-venster-laag" onClick={onSluit} role="presentation">
      <section
        className={cn('axe-kaart axe-dash-venster', breed && 'axe-dash-venster--breed')}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onSluit(); }}
      >
        <header className="axe-dash-kaart-kop">
          <h3 className="axe-dash-kaart-titel">{titel}</h3>
          <button type="button" className="axe-dash-sluit" onClick={onSluit} aria-label="Close"><X size={14} /></button>
        </header>
        <div className="axe-dash-kaart-lijf">{children}</div>
      </section>
    </div>
  );
}
