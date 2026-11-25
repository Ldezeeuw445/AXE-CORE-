/**
 * KPI-tegels voor de tabs (25 nov, Luka: "elke tab de KPI's en acties waar ik
 * iets mee kan"). Een tegel = label, getal, één regel, en alleen een
 * sparkline als er een echte reeks is. Klikbaar naar de plek erachter.
 * Zelfde vorm als de tegels op Home (#341).
 */
import type { ReactNode } from 'react';
import './kpiTegels.css';

export type KpiToon = 'ok' | 'let-op' | 'fout' | 'uit';

/** Sparkline; niets bij minder dan twee punten (geen nep-lijn). */
export function Spark({ waarden, toon = 'ok', breed = 84, hoog = 22 }: { waarden: readonly number[]; toon?: KpiToon; breed?: number; hoog?: number }) {
  if (waarden.length < 2) return null;
  const min = Math.min(...waarden);
  const max = Math.max(...waarden);
  const span = max - min || 1;
  const pad = waarden
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (waarden.length - 1)) * breed).toFixed(1)},${(hoog - 2 - ((v - min) / span) * (hoog - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg className="axe-kpi-spark" data-toon={toon} viewBox={`0 0 ${breed} ${hoog}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${pad} L${breed},${hoog} L0,${hoog} Z`} className="axe-kpi-spark-vlak" />
      <path d={pad} className="axe-kpi-spark-lijn" />
    </svg>
  );
}

export function Kpi({ label, waarde, regel, toon, spark, onKlik }: {
  label: string; waarde: ReactNode; regel: string; toon: KpiToon; spark?: readonly number[]; onKlik?: () => void;
}) {
  const binnen = (
    <>
      <span className="axe-kpi-kop"><i className="axe-kpi-stip" data-toon={toon} aria-hidden="true" /><span className="axe-kpi-label">{label}</span></span>
      <span className="axe-kpi-rij">
        <span className="axe-kpi-waarde" data-toon={toon}>{waarde}</span>
        {spark && <Spark waarden={spark} toon={toon === 'uit' ? 'ok' : toon} />}
      </span>
      <span className="axe-kpi-regel" title={regel}>{regel}</span>
    </>
  );
  if (!onKlik) return <div className="axe-kpi" data-axe-kpi={label}>{binnen}</div>;
  return <button type="button" className="axe-kpi axe-kpi--knop" data-axe-kpi={label} onClick={onKlik}>{binnen}</button>;
}

/** Een rij tegels, even breed, zo hoog als de inhoud. */
export function KpiRij({ children, kolommen }: { children: ReactNode; kolommen: number }) {
  return <div className="axe-kpi-rij-raster" style={{ gridTemplateColumns: `repeat(${kolommen}, minmax(0, 1fr))` }} data-axe-kpi-rij="">{children}</div>;
}

/** Actieknop in een kaartkop of de kopstrook: klein, één woord of twee. */
export function ActieKnop({ children, onKlik, titel }: { children: ReactNode; onKlik: () => void; titel?: string }) {
  return <button type="button" className="axe-kpi-actie" onClick={(e) => { e.stopPropagation(); onKlik(); }} title={titel}>{children}</button>;
}
