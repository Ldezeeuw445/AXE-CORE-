/**
 * De bouwstenen van de NorthSea-tabbladen.
 *
 * Alles in het materiaal dat Live Map al gebruikt, zodat een tabblad er uitziet
 * als AXE CORE en niet als een los dashboard:
 *   - vlakken in `--axe-vak-*` (zoals de dealtabel boven de composer);
 *   - tegels in `--axe-barbtn` / `--axe-tegel-op` (zoals de kaartjes bovenin);
 *   - tekst in `--text-primary/secondary/muted`, accent `--accent-cyan`.
 *
 * Alleen componenten in dit bestand (react-refresh); kleuren en regels staan in
 * src/domain/northsea/tabs/status.ts.
 */
import type { CSSProperties, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { TOON_KLEUR, type Badge, type Toon } from '@/domain/northsea/tabs/status';

const VAK_STIJL: CSSProperties = {
  borderRadius: 'var(--axe-vak-hoek, 24px)',
  border: '1px solid var(--axe-vak-lijn)',
  background: 'var(--axe-vak-vlak)',
  boxShadow: 'var(--axe-vak-zweef)',
};

/** Een vlak met optionele kop. `vul` laat hem de beschikbare hoogte nemen. */
export function Vlak({ titel, sub, acties, children, className = '', vul, doel }: {
  titel?: ReactNode; sub?: ReactNode; acties?: ReactNode; children: ReactNode; className?: string; vul?: boolean; doel?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden ${vul ? 'min-h-0 flex-1' : ''} ${className}`} style={VAK_STIJL} data-axe-doel={doel}>
      {(titel || acties) && (
        <header className="flex items-center gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0 flex-1">
            {titel && <h2 className="truncate text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{titel}</h2>}
            {sub && <div className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
          </div>
          {acties && <div className="flex shrink-0 items-center gap-1.5">{acties}</div>}
        </header>
      )}
      <div className={`min-w-0 ${vul ? 'min-h-0 flex-1 overflow-auto' : ''}`}>{children}</div>
    </section>
  );
}

/** Een kengetal in tegelmateriaal, zoals de kaartjes bovenin Live Map. */
export function Kengetal({ waarde, label, sub, toon }: { waarde: ReactNode; label: string; sub?: ReactNode; toon?: Toon }) {
  return (
    <div className="flex h-[70px] min-w-[118px] shrink-0 flex-col justify-center rounded-[15px] px-3"
      style={{ background: 'var(--axe-barbtn)', boxShadow: 'var(--axe-tegel-op)' }}>
      <div className="text-[20px] font-semibold leading-none tabular-nums" style={{ color: toon ? TOON_KLEUR[toon] : 'var(--text-primary)' }}>{waarde}</div>
      <div className="mt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      {sub !== undefined && <div className="mt-0.5 max-w-[180px] truncate text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

/** De dagelijkse NorthSea-werkstroom, als herinnering — geen nieuwe navigatie. */
export function WerkstroomHint() {
  return (
    <p className="px-1 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }} data-axe-doel="northsea-werkstroom">
      Daily path: Chase → Deal → Blocker → Communication → Action/Draft → Approval → Updated state
    </p>
  );
}

/** Een rij kengetallen die in het midden staat en doorschuift als hij niet past. */
export function KengetalRij({ children }: { children: ReactNode }) {
  return (
    <div className="ns-tabrij flex min-w-0 overflow-x-auto px-1 py-1">
      <div className="mx-auto flex w-max gap-2.5">{children}</div>
      <style>{`.ns-tabrij{scrollbar-width:none}.ns-tabrij::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

/** Een statusbadge: kleur uit het contract, betekenis en volgende stap in de tooltip. */
export function StatusChip({ badge, klein }: { badge: Badge; klein?: boolean }) {
  const kleur = TOON_KLEUR[badge.toon];
  const uitleg = badge.volgende ? `${badge.betekenis} Next: ${badge.volgende}` : badge.betekenis;
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full ${klein ? 'px-2 py-[1px] text-[10.5px]' : 'px-2.5 py-0.5 text-[11.5px]'}`}
      title={uitleg} style={{ background: `${kleur}1a`, color: kleur, border: `1px solid ${kleur}33` }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: kleur }} />
      <span className="truncate">{badge.label}</span>
    </span>
  );
}

/** Een eenvoudig label in een toon, zonder betekenis-tooltip (bv. een kanaal of type). */
export function Label({ children, toon = 'grijs' }: { children: ReactNode; toon?: Toon }) {
  const kleur = TOON_KLEUR[toon];
  return (
    <span className="inline-flex items-center truncate rounded-md px-1.5 py-[1px] text-[10.5px]"
      style={{ background: `${kleur}14`, color: kleur }}>
      {children}
    </span>
  );
}

/** Wat er staat als er niets is, met de reden. Nooit een lege plek die kapot oogt. */
export function LegeStaat({ titel, uitleg, icoon }: { titel: string; uitleg?: ReactNode; icoon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icoon && <div style={{ color: 'var(--text-muted)' }}>{icoon}</div>}
      <div className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>{titel}</div>
      {uitleg && <div className="max-w-md text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{uitleg}</div>}
    </div>
  );
}

export function FoutRegel({ fout }: { fout: string }) {
  return (
    <div className="mx-4 my-2 flex gap-2 rounded-lg bg-white/[0.03] p-2 text-[11.5px]" style={{ border: '1px solid rgba(248,113,113,0.35)', color: '#F87171' }}>
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span>NorthSea data unavailable: {fout}</span>
    </div>
  );
}

export function VerversKnop({ bezig, ververs }: { bezig: boolean; ververs: () => void }) {
  return (
    <button type="button" onClick={ververs} disabled={bezig} title="Refresh" aria-label="Refresh"
      className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)' }}>
      <RefreshCw size={13} className={bezig ? 'animate-spin' : ''} />
    </button>
  );
}

export function Zoekveld({ waarde, zet, plaats }: { waarde: string; zet: (v: string) => void; plaats: string }) {
  return (
    <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5"
      style={{ border: '1px solid var(--axe-vak-lijn)', background: 'rgba(255,255,255,0.02)' }}>
      <Search size={13} style={{ color: 'var(--text-muted)' }} />
      <input value={waarde} onChange={e => zet(e.target.value)} placeholder={plaats}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" style={{ color: 'var(--text-primary)' }} />
    </label>
  );
}

/** Filterknoppen met tellers, zoals de tabs van de dealtabel. */
export function Filters<T extends string>({ opties, actief, kies }: {
  opties: ReadonlyArray<{ id: T; label: string; aantal?: number }>; actief: T; kies: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opties.map(o => {
        const aan = o.id === actief;
        return (
          <button key={o.id} type="button" onClick={() => kies(o.id)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px]"
            style={{
              background: aan ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: `1px solid ${aan ? 'rgba(34,211,238,0.30)' : 'var(--axe-vak-lijn)'}`,
              color: aan ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}>
            {o.label}
            {o.aantal !== undefined && (
              <span className="rounded px-1 text-[10px] tabular-nums" style={{ background: 'rgba(255,255,255,0.06)' }}>{o.aantal}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Een label-waarde-regel in een detailpaneel; leeg is een streepje. */
export function Veld({ label, children }: { label: string; children: ReactNode }) {
  const leeg = children === null || children === undefined || children === '';
  return (
    <div className="flex items-baseline gap-3 py-1 text-[12px]">
      <span className="w-[118px] shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="min-w-0 flex-1 break-words" style={{ color: leeg ? 'var(--text-muted)' : 'var(--text-primary)' }}>{leeg ? '—' : children}</span>
    </div>
  );
}

/** Het detailpaneel rechts (in de TabRail), in hetzelfde paneelmateriaal als AXE Chase. */
export function DetailPaneel({ titel, sub, children, sluit }: { titel: ReactNode; sub?: ReactNode; children: ReactNode; sluit?: () => void }) {
  return (
    <div className="axe-paneel" data-axe-doel="northsea-detail">
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{titel}</h2>
          {sub && <div className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
        </div>
        {sluit && (
          <button type="button" onClick={sluit} aria-label="Close details" className="text-[16px] leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
        )}
      </div>
      {children}
    </div>
  );
}
