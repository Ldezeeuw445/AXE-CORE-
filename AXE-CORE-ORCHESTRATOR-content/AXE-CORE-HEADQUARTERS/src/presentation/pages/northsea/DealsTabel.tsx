/**
 * De dealtabel, boven de composer.
 *
 * Drie tabbladen -- Active Deals, Pipeline, Completed -- met dezelfde tellers
 * als de kaartjes en de legenda (domain/northsea/desk.ts). Inklapbaar tot
 * alleen de tabbladen, want hij ligt over de kaart heen.
 *
 * Wat leeg is in de database staat hier als streepje: geen gereedheid, geen
 * commissie, geen volume. Zie de uitleg in desk.ts.
 *
 * ## De breedte
 *
 * Even breed als de composer eronder, op dezelfde lijnen en in hetzelfde
 * materiaal, zodat het één band is. De kolommen passen daarin: herkomst en bestemming
 * delen één kolom, en "Next action" neemt wat overblijft. De eerste versie had
 * twaalf vaste kolommen van samen 1444px in een doos van 1180, en dan vielen
 * commissie, volgende stap en tijd rechts van de rand.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { dealStand, type KaartDeal } from '@/domain/northsea/kaart';
import {
  commissieTekst, dealId, dealRijen, faseLabel, tegenpartijen, volumeTekst,
  type DealTab, type DeskTellers,
} from '@/domain/northsea/desk';
import { tijdGeleden } from '@/domain/northsea/chase';
import { blokkadeToon, eigenaarLabel } from '@/domain/northsea/engine';
import { TOON_KLEUR } from '@/domain/northsea/tabs/status';
import { STAND_STIJL } from './kaartStijl';

const TABS: Array<{ id: DealTab; label: string; teller: keyof Pick<DeskTellers, 'actief' | 'pipeline' | 'afgerond'> }> = [
  { id: 'actief', label: 'Active Deals', teller: 'actief' },
  { id: 'pipeline', label: 'Pipeline', teller: 'pipeline' },
  { id: 'afgerond', label: 'Completed', teller: 'afgerond' },
];

/** Kolommen met hun breedte; `null` is de kolom die de rest van de ruimte krijgt. */
const KOLOMMEN: Array<{ kop: string; breed: number | null }> = [
  { kop: 'ID', breed: 112 },
  { kop: 'Commodity', breed: 150 },
  { kop: 'Volume', breed: 84 },
  { kop: 'Route', breed: 230 },
  { kop: 'Counterparty', breed: 200 },
  { kop: 'Stage', breed: 140 },
  { kop: 'Readiness', breed: 118 },
  { kop: 'Commission', breed: 88 },
  { kop: 'Next action', breed: null },
  { kop: 'Updated', breed: 70 },
];
/** Smaller dan dit wordt het onleesbaar; dan liever horizontaal schuiven. */
const MIN_TABEL = KOLOMMEN.reduce((s, k) => s + (k.breed ?? 160), 0);

const herkomst = (d: KaartDeal) => d.laadhaven?.trim() || d.herkomst?.trim() || d.leverancier_land?.trim() || '—';
const bestemming = (d: KaartDeal) => d.bestemming?.trim() || d.koper_land?.trim() || '—';

function Gereedheid({ waarde }: { waarde: number | null | undefined }) {
  if (waarde === null || waarde === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const kleur = waarde >= 60 ? '#34D399' : waarde >= 35 ? '#2DD4BF' : '#FBBF24';
  return (
    <span className="flex items-center gap-2">
      <span className="w-8 text-right tabular-nums" style={{ color: kleur }}>{waarde}%</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
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
    /* Precies zo breed als de composer: dezelfde linker- en rechterlijn als de
       chatplaat (AxeShellChrome meet die), en hetzelfde materiaal als het
       invoervak (.axe-vak) -- vlak, randje, hoek en zweefschaduw. Het dock
       centreert zijn inhoud; met flex-grow en die marges vult hij precies de
       strook boven de composer, ook als links en rechts niet even breed zijn. */
    <div className="pointer-events-auto flex min-w-0 flex-auto flex-col overflow-hidden"
      style={{
        marginLeft: 'var(--axe-chat-links, 24px)',
        marginRight: 'var(--axe-chat-rechts, 24px)',
        borderRadius: 'var(--axe-vak-hoek, 24px)',
        border: '1px solid var(--axe-vak-lijn)',
        background: 'var(--axe-vak-vlak)',
        boxShadow: 'var(--axe-vak-zweef)',
      }}
      data-axe-doel="northsea-deals">
      <div className="flex items-center gap-1 px-4 pt-2" style={{ borderBottom: open ? '1px solid var(--axe-vak-lijn)' : undefined }}>
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
            <table className="w-full table-fixed border-collapse text-[12px]" style={{ minWidth: MIN_TABEL }}>
              <colgroup>
                {KOLOMMEN.map(k => <col key={k.kop} style={k.breed ? { width: k.breed } : undefined} />)}
              </colgroup>
              <thead className="sticky top-0 z-[1]" style={{ background: 'var(--axe-vak-vlak)' }}>
                <tr>
                  {KOLOMMEN.map(k => (
                    <th key={k.kop} className="truncate px-2.5 py-1.5 text-left text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{k.kop}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rijen.map(d => {
                  const kleur = STAND_STIJL[dealStand(d)].kleur;
                  const route = `${herkomst(d)} → ${bestemming(d)}`;
                  const commissie = commissieTekst(d);
                  return (
                    <tr key={d.id} className="transition-colors hover:bg-white/[0.03]" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                      <Cel className="font-mono-data font-semibold" stijl={{ color: kleur }} titel={d.id}>{dealId(d)}</Cel>
                      <Cel titel={d.product ?? undefined} stijl={{ color: 'var(--text-primary)' }}>{d.product?.trim() || '—'}</Cel>
                      <Cel className="tabular-nums" stijl={{ color: 'var(--text-secondary)' }}>{volumeTekst(d)}</Cel>
                      <Cel titel={route} stijl={{ color: 'var(--text-secondary)' }}>
                        {herkomst(d)}
                        <ArrowRight size={11} className="mx-1.5 inline-block align-[-1px]" style={{ color: 'var(--text-muted)' }} />
                        {bestemming(d)}
                      </Cel>
                      <Cel titel={tegenpartijen(d)} stijl={{ color: '#60A5FA' }}>{tegenpartijen(d)}</Cel>
                      <Cel titel={d.kwalificatie ? `Qualification: ${d.kwalificatie}` : undefined} stijl={{ color: kleur }}>{faseLabel(d)}</Cel>
                      <Cel><Gereedheid waarde={d.gereedheid} /></Cel>
                      <Cel className="tabular-nums" stijl={{ color: commissie === '—' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{commissie}</Cel>
                      {/* P1: de engine-beoordeling gaat voor; zonder beoordeling blijft de oude volgende stap staan. */}
                      <Cel titel={d.beste_actie ? [d.huidige_blokkade, d.beste_actie, d.actie_eigenaar ? `Owner: ${eigenaarLabel(d.actie_eigenaar)}` : null].filter(Boolean).join('\n') : (d.volgende ?? undefined)}
                        stijl={{ color: d.blokkade_code ? TOON_KLEUR[blokkadeToon(d.blokkade_code)] : 'var(--text-secondary)' }}>
                        {d.beste_actie?.trim() || d.volgende?.trim() || '—'}
                      </Cel>
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
