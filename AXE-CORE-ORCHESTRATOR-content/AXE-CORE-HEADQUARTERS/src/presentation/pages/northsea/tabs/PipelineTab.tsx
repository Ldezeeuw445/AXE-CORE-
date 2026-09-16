/**
 * Pipeline: van opportunity naar transactie, als kanban op de echte fases.
 *
 * Kolommen en regels: src/domain/northsea/tabs/lijsten.ts (pipelineKolom). Geen
 * pipelinewaarde in euro's: geen enkele deal heeft een waarde (september 2026),
 * dus de kolomkop toont aantal en volume, en "value" staat er alleen als hij er is.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { tijdGeleden } from '@/domain/northsea/chase';
import { getal } from '@/domain/northsea/desk';
import { geblokkeerdIn, groepeerPipeline, PIPELINE_KOLOMMEN, past, tel, volumeSom, type KolomId } from '@/domain/northsea/tabs/lijsten';
import { TOON_KLEUR, mensLabel } from '@/domain/northsea/tabs/status';
import type { PipelineDeal } from '@/domain/northsea/tabs/typen';
import {
  DetailPaneel, Filters, FoutRegel, Kengetal, KengetalRij, Label, LegeStaat, VerversKnop, Vlak, Zoekveld,
} from './bouwstenen';
import { useNorthseaTab } from './useNorthseaTab';

const mt = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} MT`);
const code = (d: PipelineDeal) => (d.code && /^[A-Z]+-\d+/i.test(d.code.trim()) ? d.code.trim() : `#${d.id.slice(0, 6)}`);

function Kaart({ d, nu, kies }: { d: PipelineDeal; nu: number; kies: (id: string) => void }) {
  const volume = getal(d.volume_mt);
  return (
    <button type="button" onClick={() => kies(d.id)}
      className="flex w-full flex-col gap-1 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
      style={{ border: '1px solid var(--axe-vak-lijn)', background: 'rgba(255,255,255,0.015)' }}>
      <div className="flex items-baseline gap-2">
        <span className="flex-1 truncate text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>{d.product?.trim() || mensLabel(d.commodity)}</span>
        <span className="shrink-0 font-mono-data text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{code(d)}</span>
      </div>
      <div className="truncate text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
        {volume !== null ? mt(volume) : 'Volume —'}{d.incoterm ? ` · ${d.incoterm}` : ''}
      </div>
      <div className="flex items-center gap-1 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <span className="truncate">{d.leverancier_land || d.leverancier || '—'}</span>
        <ArrowRight size={10} className="shrink-0" />
        <span className="truncate">{d.koper_land || d.koper || '—'}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {d.geblokkeerd && <Label toon="rood">Blocked</Label>}
        {d.akkoord_nodig && <Label toon="oranje">Approval</Label>}
        {d.gereedheid != null && <Label toon="blauw">{d.gereedheid}% ready</Label>}
        <span className="ml-auto text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{d.updated_at ? tijdGeleden(d.updated_at, nu) : ''}</span>
      </div>
    </button>
  );
}

export function PipelineTab({ openDeal }: { openDeal?: (id: string) => void }) {
  const { data, fout, bezig, ververs } = useNorthseaTab('pipeline');
  const [zoek, setZoek] = useState('');
  const [weergave, setWeergave] = useState<'kanban' | 'lijst'>('kanban');
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const deals = useMemo(
    () => (data?.deals ?? []).filter(d => past(zoek, d.product, d.commodity, d.koper, d.leverancier, d.koper_land, d.leverancier_land, d.code)),
    [data, zoek],
  );
  const kolommen = useMemo(() => groepeerPipeline(deals), [deals]);
  const alle = data?.deals ?? [];
  const week = 7 * 24 * 3600 * 1000;
  const nieuw = alle.filter(d => d.created_at && nu - Date.parse(d.created_at) < week).length;
  const geblokkeerd = alle.filter(d => d.geblokkeerd).length;
  /* Een blokkade wint van elke andere kolom, dus een deal in kwalificatie die
     ook geblokkeerd is staat onder Blocked. Zonder dit getal lijkt Qualifying 0
     terwijl Reports er 18 telt — hetzelfde verhaal, twee cijfers. */
  const kwalGeblokkeerd = geblokkeerdIn(alle, 'kwalificatie');
  const akkoord = alle.filter(d => d.akkoord_nodig).length;
  const producten = tel(alle, d => mensLabel(d.commodity || d.product)).slice(0, 6);
  const kies = (id: string) => (openDeal ? openDeal(id) : setGekozen(id));
  const detail = gekozen ? alle.find(d => d.id === gekozen) ?? null : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2" data-axe-doel="northsea-pipeline">
      <KengetalRij>
        <Kengetal waarde={data ? alle.length : '—'} label="Opportunities" sub={data ? `+${nieuw} this week` : undefined} toon="blauw" />
        <Kengetal waarde={data ? mt(volumeSom(alle)) : '—'} label="Pipeline volume" sub="Sum of known volumes" />
        <Kengetal waarde={data ? kolommen.kwalificatie.length : '—'} label="Qualifying" toon="blauw"
          sub={data && kwalGeblokkeerd ? `${kwalGeblokkeerd} more under Blocked` : undefined} />
        <Kengetal waarde={data ? akkoord : '—'} label="Awaiting approval" toon="oranje" />
        <Kengetal waarde={data ? geblokkeerd : '—'} label="Blocked" toon="rood" sub={data ? (geblokkeerd ? 'Blocker stops progress' : 'Nothing blocked') : undefined} />
      </KengetalRij>

      <Vlak vul titel={<span className="flex items-center gap-2"><TrendingUp size={15} style={{ color: '#FBBF24' }} />Pipeline</span>}
        sub="From opportunity to real transactions — stages as recorded in AXE Commodities."
        acties={(
          <>
            <div className="w-[240px]"><Zoekveld waarde={zoek} zet={setZoek} plaats="Search pipeline…" /></div>
            <Filters opties={[{ id: 'kanban', label: 'Kanban' }, { id: 'lijst', label: 'List' }] as const} actief={weergave} kies={setWeergave} />
            <VerversKnop bezig={bezig} ververs={ververs} />
          </>
        )}>
        {fout && <FoutRegel fout={fout} />}
        {!fout && !data && <LegeStaat titel="Loading pipeline…" />}
        {data && deals.length === 0 && <LegeStaat titel="No opportunities match" uitleg={zoek ? 'Clear the search to see the full pipeline.' : undefined} />}
        {data && deals.length > 0 && weergave === 'kanban' && (
          <div className="flex h-full min-h-[320px] gap-2.5 overflow-x-auto px-3 pb-3">
            {PIPELINE_KOLOMMEN.map(k => {
              const rij = kolommen[k.id as KolomId];
              return (
                <div key={k.id} className="flex w-[232px] shrink-0 flex-col rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--axe-vak-lijn)' }} title={k.uitleg}>
                  <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: TOON_KLEUR[k.toon] }} />
                    <span className="flex-1 text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>{k.label}</span>
                    <span className="rounded px-1.5 text-[10.5px] tabular-nums" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>{rij.length}</span>
                  </div>
                  <div className="px-3 pb-2 text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{mt(volumeSom(rij))}</div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
                    {rij.length === 0 && <div className="px-1 py-3 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>Empty</div>}
                    {rij.map(d => <Kaart key={d.id} d={d} nu={nu} kies={kies} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {data && deals.length > 0 && weergave === 'lijst' && (
          <table className="w-full table-fixed border-collapse text-[12px]">
            <thead className="sticky top-0 z-[1]" style={{ background: 'var(--axe-vak-vlak)' }}>
              <tr>{['ID', 'Commodity', 'Volume', 'Route', 'Counterparties', 'Stage', 'Updated'].map(k => (
                <th key={k} className="truncate px-3 py-1.5 text-left text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{k}</th>
              ))}</tr>
            </thead>
            <tbody>
              {Object.values(kolommen).flat().map(d => (
                <tr key={d.id} onClick={() => kies(d.id)} className="cursor-pointer hover:bg-white/[0.03]" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                  <td className="truncate px-3 py-2 font-mono-data" style={{ color: 'var(--text-secondary)' }}>{code(d)}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-primary)' }}>{d.product || mensLabel(d.commodity)}</td>
                  <td className="truncate px-3 py-2 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{mt(getal(d.volume_mt))}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{d.leverancier_land || '—'} → {d.koper_land || '—'}</td>
                  <td className="truncate px-3 py-2" style={{ color: '#60A5FA' }}>{[d.leverancier, d.koper].filter(Boolean).join(' → ') || '—'}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{mensLabel(d.execution_state || d.stage)}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-muted)' }}>{d.updated_at ? tijdGeleden(d.updated_at, nu) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Vlak>

      <TabRail kant="rechts" vast={!!detail}>
        {detail ? (
          <DetailPaneel titel={detail.product || mensLabel(detail.commodity)} sub={code(detail)} sluit={() => setGekozen(null)}>
            <div className="flex flex-col gap-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              <div>{detail.leverancier || '—'} → {detail.koper || '—'}</div>
              <div>{mensLabel(detail.execution_state || detail.stage)}</div>
            </div>
          </DetailPaneel>
        ) : (
          <DetailPaneel titel="Pipeline insights" sub="From the current records">
            <div className="flex flex-col gap-2 text-[12px]">
              {PIPELINE_KOLOMMEN.map(k => (
                <div key={k.id} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: TOON_KLEUR[k.toon] }} />
                  <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>{k.label}</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{data ? groepeerPipeline(alle)[k.id].length : '—'}</span>
                </div>
              ))}
              <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Top commodities</div>
              {producten.map(p => {
                const breed = alle.length ? (p.aantal / alle.length) * 100 : 0;
                return (
                  <div key={p.sleutel} className="flex items-center gap-2">
                    <span className="w-[92px] truncate" style={{ color: 'var(--text-secondary)' }}>{p.sleutel}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <span className="block h-full rounded-full" style={{ width: `${breed}%`, background: 'var(--accent-cyan)' }} />
                    </span>
                    <span className="w-6 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{p.aantal}</span>
                  </div>
                );
              })}
              {data && alle.every(d => getal(d.waarde) === null) && (
                <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>No deal values recorded yet, so pipeline value is not shown.</div>
              )}
            </div>
          </DetailPaneel>
        )}
      </TabRail>
    </div>
  );
}
