/**
 * De tegels in een Settings-kaart: 2-4 echte cijfers, compact, geen schuiven.
 * Kleur alleen in stip en getal (UI-MAATSTAF regel 5), vlak blijft matzwart.
 */
import type { KaartKpi } from '@/domain/settings/settingsKaartKpis';
import './settingsDashboard.css';

function MiniBalken({ waarden }: { waarden: readonly number[] }) {
  if (waarden.length < 2) return null;
  return (
    <span className="axe-skpi-balken" aria-hidden="true">
      {waarden.map((v, i) => (
        <i key={i} style={{ height: `${Math.max(8, Math.round(Math.min(1, Math.max(0, v)) * 100))}%` }} />
      ))}
    </span>
  );
}

export function SettingsKaartKpis({ kpis }: { kpis: readonly KaartKpi[] }) {
  return (
    <div className="axe-skpi" data-axe-skpi="" data-aantal={kpis.length}>
      {kpis.map((k) => (
        <div key={k.label} className="axe-skpi-tegel" data-toon={k.toon} data-axe-skpi-tegel={k.label}>
          <span className="axe-skpi-kop"><i className="axe-skpi-stip" aria-hidden="true" />{k.label}</span>
          <span className="axe-skpi-rij">
            <b className="axe-skpi-waarde" title={k.waarde}>{k.waarde}</b>
            {k.balken && <MiniBalken waarden={k.balken} />}
          </span>
          {k.regel && <span className="axe-skpi-regel" title={k.regel}>{k.regel}</span>}
        </div>
      ))}
    </div>
  );
}
