/**
 * De ene statuskaart van Settings (25 sep): naam + stand, één regel wat het
 * is, de keuze, vier cijfers, balken. Providers, Voice, Trust en Services
 * gebruiken allemaal deze, zodat Settings één geheel is.
 */
import type { ReactNode } from 'react';


export type Toon = 'ok' | 'bad' | 'warn' | 'info' | 'muted';
export type Stand = { toon: Toon; tekst: string };
const TOON_KLEUR: Record<Toon, string> = {
  ok: 'var(--success)', bad: 'var(--error)', warn: 'var(--warning)', info: 'var(--accent-cyan)', muted: 'var(--text-muted)',
};

export function geleden(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export function duur(ms: number): string {
  return ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`;
}
export function kort(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

export function SectieKop({ titel, uitleg }: { titel: string; uitleg: string }) {
  return (
    <div className="axe-agent-sectiekop">
      <h3>{titel}</h3>
      <p>{uitleg}</p>
    </div>
  );
}

export function StatusKaart({ naam, accent, rol, stand, keuze, stats, balken, melding, klein }: {
  naam: string;
  accent: string;
  rol: string;
  stand: Stand;
  keuze?: ReactNode;
  stats?: { label: string; waarde: string }[];
  balken?: { label: string; waarde: string; pct: number; goed?: boolean }[];
  melding?: string;
  klein?: boolean;
}) {
  return (
    <div className={`axe-kaart axe-agentkaart${klein ? ' axe-agentkaart--klein' : ''}`}>
      <div className="axe-agentkaart-kop">
        <span className="axe-agentkaart-stip" style={{ background: accent }} />
        <b>{naam}</b>
        <span className="axe-agentkaart-stand" style={{ color: TOON_KLEUR[stand.toon] }}>
          <span style={{ background: TOON_KLEUR[stand.toon] }} />{stand.tekst}
        </span>
      </div>
      <p className="axe-agentkaart-rol" title={rol}>{rol}</p>
      {keuze && <div className="axe-agentkaart-keuze">{keuze}</div>}
      {stats && stats.length > 0 && (
        <div className="axe-agentkaart-stats">
          {stats.map(st => (
            <div key={st.label}>
              <span>{st.label}</span>
              <b title={st.waarde}>{st.waarde}</b>
            </div>
          ))}
        </div>
      )}
      {balken && balken.length > 0 && (
        <div className="axe-agentkaart-balken">
          {balken.map(b => {
            const pct = Math.max(0, Math.min(100, Math.round(b.pct)));
            const kleur = b.goed
              ? (pct >= 90 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--error)')
              : (pct >= 100 ? 'var(--error)' : pct >= 70 ? 'var(--warning)' : 'var(--success)');
            return (
              <div key={b.label} className="axe-agentkaart-balk">
                <div><span>{b.label}</span><b>{b.waarde}</b></div>
                <i><em style={{ width: `${pct}%`, background: kleur }} /></i>
              </div>
            );
          })}
        </div>
      )}
      {melding && <p className="axe-agentkaart-melding" title={melding}>Limit seen · {melding}</p>}
    </div>
  );
}
