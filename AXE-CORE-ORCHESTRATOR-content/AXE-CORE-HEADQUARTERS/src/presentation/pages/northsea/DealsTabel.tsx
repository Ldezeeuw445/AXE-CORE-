/**
 * De dealtabel, boven de composer.
 *
 * Drie tabbladen -- Active Deals, Pipeline, Completed -- met dezelfde tellers
 * als de kaartjes en de legenda (domain/northsea/desk.ts). Inklapbaar tot
 * alleen de tabbladen, want hij ligt over de kaart heen.
 *
 * Wat leeg is in de database staat hier als streepje: geen gereedheid, geen
 * commissie, geen volume. Zie de uitleg in desk.ts.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { dealStand, type KaartDeal } from '@/domain/northsea/kaart';
import {
  commissieTekst, dealId, dealRijen, faseLabel, tegenpartijen, volumeTekst,
  type DealTab, type DeskTellers,
} from '@/domain/northsea/desk';
import { tijdGeleden } from '@/domain/northsea/chase';
import { STAND_STIJL } from './kaartStijl';

const TABS: Array<{ id: DealTab; label: string; teller: keyof Pick<DeskTellers, 'actief' | 'pipeline' | 'afgerond'> }> = [
  { id: 'actief', label: 'Active Deals', teller: 'actief' },
  { id: 'pipeline', label: 'Pipeline', teller: 'pipeline' },
  { id: 'afgerond', label: 'Completed', teller: 'afgerond' },
];

const KOP = ['ID', 'Commodity', 'Volume', 'Origin', '', 'Destination', 'Counterparty', 'Stage', 'Readiness', 'Commission', 'Next action', 'Updated'];

const herkomst = (d: KaartDeal) => d.laadhaven?.trim() || d.herkomst?.trim() || d.leverancier_land?.trim() || '—';
const bestemming = (d: KaartDeal) => d.bestemming?.trim() || d.koper_land?.trim() || '—';

function Gereedheid({ waarde }: { waarde: number | null | undefined }) {
  if (waarde === null || waarde === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const kleur = waarde >= 60 ? '#34D399' : waarde >= 35 ? '#2DD4BF' : '#FBBF24';
  return (
    <span className="flex items-center gap-2">
      <span className="w-8 text-right tabular-nums" style={{ color: kleur }}>{waarde}%</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, waarde))}%`, background: kleur }} />
      </span>
    </span>
  );
}

function Cel({ children, titel, className = '', stijl }: { children: ReactNode; titel?: string; className?: string; stijl?: CSSProperties }) {
  return (
    <td className={`truncate px-2.5 py-2 ${className}`} title={titel} style={stijl}>{children}</td>
  );
}

export function DealsTabel({ deals, tellers, nu, fout }: {
  deals: KaartDeal[] | null;
  tellers: DeskTellers | null;
  nu: number;
  fout?: string | null;
}) {
  const [tab, setTab] = useState<DealTab>('actief');
  const [open, setOpen] = useState(true);
  const rijen = deals ? dealRijen(deals, tab) : [];

  return (
    <div className="pointer-events-auto flex flex-col overflow-hidden rounded-[16px]"
      style={{ width: 'min(1180px, calc(100vw - 48px))', background: 'var(--axe-bar)', boxShadow: 'var(--axe-tegel-op)' }}
      data-axe-doel="northsea-deals">
      <div className="flex items-center gap-1 px-3 pt-2" style={{ borderBottom: open ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
        {TABS.map(t => {
          const aan = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => { setTab(t.id); setOpen(true); }}
              className="relative px-3 pb-2 pt-1 text-[12.5px] transition-colors"
              style={{ color: aan ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: aan ? 600 : 400 }}>
              {t.label} <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>({tellers ? tellers[t.teller] : '–'})</span>
              {aan && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full" style={{ background: 'var(--accent-cyan)', boxShadow: '0 0 8px var(--accent-cyan)' }} />}
            </button>
          );
        })}
        <button type="button" onClick={() => setOpen(v => !v)} className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg"
          aria-label={open ? 'Collapse deals' : 'Expand deals'} title={open ? 'Collapse' : 'Expand'} style={{ color: 'var(--text-secondary)' }}>
          {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {open && (
        <div className="max-h-[196px] overflow-auto">
          {fout && <div className="px-4 py-3 text-[12px]" style={{ color: '#F87171' }}>Deals unavailable: {fout}</div>}
          {!fout && !deals && <div className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>Loading deals…</div>}
          {deals && rijen.length === 0 && (
            <div className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {tab === 'afgerond' ? 'No completed deals yet.' : 'No deals here.'}
            </div>
          )}
          {rijen.length > 0 && (
            <table className="w-full table-fixed border-collapse text-[12px]">
              <colgroup>
                <col style={{ width: 118 }} /><col style={{ width: 150 }} /><col style={{ width: 88 }} />
                <col style={{ width: 120 }} /><col style={{ width: 22 }} /><col style={{ width: 120 }} />
                <col style={{ width: 190 }} /><col style={{ width: 150 }} /><col style={{ width: 118 }} />
                <col style={{ width: 88 }} /><col style={{ width: 210 }} /><col style={{ width: 70 }} />
              </colgroup>
              <thead className="sticky top-0 z-[1]" style={{ background: '#0F0F12' }}>
                <tr>
                  {KOP.map((k, i) => (
                    <th key={i} className="truncate px-2.5 py-1.5 text-left text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rijen.map(d => {
                  const stand = dealStand(d);
                  const kleur = STAND_STIJL[stand].kleur;
                  return (
                    <tr key={d.id} className="transition-colors hover:bg-white/[0.03]" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                      <Cel className="font-mono-data font-semibold" stijl={{ color: kleur }} titel={d.id}>{dealId(d)}</Cel>
                      <Cel titel={d.product ?? undefined} stijl={{ color: 'var(--text-primary)' }}>{d.product?.trim() || '—'}</Cel>
                      <Cel className="tabular-nums" stijl={{ color: 'var(--text-secondary)' }}>{volumeTekst(d)}</Cel>
                      <Cel titel={herkomst(d)} stijl={{ color: 'var(--text-secondary)' }}>{herkomst(d)}</Cel>
                      <Cel stijl={{ color: 'var(--text-muted)' }}><ArrowRight size={12} /></Cel>
                      <Cel titel={bestemming(d)} stijl={{ color: 'var(--text-secondary)' }}>{bestemming(d)}</Cel>
                      <Cel titel={tegenpartijen(d)} stijl={{ color: '#60A5FA' }}>{tegenpartijen(d)}</Cel>
                      <Cel titel={d.kwalificatie ? `Qualification: ${d.kwalificatie}` : undefined} stijl={{ color: kleur }}>{faseLabel(d)}</Cel>
                      <Cel><Gereedheid waarde={d.gereedheid} /></Cel>
                      <Cel className="tabular-nums" stijl={{ color: commissieTekst(d) === '—' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{commissieTekst(d)}</Cel>
                      <Cel titel={d.volgende ?? undefined} stijl={{ color: 'var(--text-secondary)' }}>{d.volgende?.trim() || '—'}</Cel>
                      <Cel stijl={{ color: 'var(--text-muted)' }}>{d.updated_at ? tijdGeleden(d.updated_at, nu) : '—'}</Cel>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
