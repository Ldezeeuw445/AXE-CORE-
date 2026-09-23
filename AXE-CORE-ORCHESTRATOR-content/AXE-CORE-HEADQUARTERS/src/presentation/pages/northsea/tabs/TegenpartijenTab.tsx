/**
 * Counterparties: het netwerk van bedrijven en contacten.
 *
 * Verificatie volgt status.ts: 90 van de 100 bedrijven staan op `reviewing`
 * (blauw, "In review"), geen enkele op `verified`. Het voorbeeldscherm toont
 * "Verified 92%" met een groen balkje; dat zou hier een leugen zijn. De score
 * staat er alleen als hij ingevuld is, en krijgt nooit groen zonder `verified`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Building2, ExternalLink, Mail, Phone } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { tijdGeleden } from '@/domain/northsea/chase';
import { filterBedrijven, tel } from '@/domain/northsea/tabs/lijsten';
import { mensLabel, verificatieBadge } from '@/domain/northsea/tabs/status';
import type { Bedrijf } from '@/domain/northsea/tabs/typen';
import {
  DetailPaneel, Filters, FoutRegel, Kengetal, KengetalRij, Label, LegeStaat, StatusChip, Veld, VerversKnop, Vlak, Zoekveld,
} from './bouwstenen';
import { useNorthseaTab } from './useNorthseaTab';

const SOORTEN = ['alle', 'buyer', 'supplier', 'both', 'broker', 'logistics', 'inspection', 'other'] as const;
const VERIFICATIES = ['alle', 'verified', 'reviewing', 'unverified', 'rejected'] as const;

function Detail({ b, nu, sluit }: { b: Bedrijf; nu: number; sluit: () => void }) {
  const badge = verificatieBadge(b.verificatie);
  return (
    <DetailPaneel titel={b.naam || 'Unnamed company'} sub={[mensLabel(b.soort), b.land].filter(Boolean).join(' · ')} sluit={sluit}>
      <div className="mb-3"><StatusChip badge={badge} /></div>
      <Veld label="Location">{[b.stad, b.land].filter(Boolean).join(', ')}</Veld>
      <Veld label="Website">{b.website ? (
        <a href={b.website.startsWith('http') ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1" style={{ color: 'var(--accent-cyan)' }}>{b.website}<ExternalLink size={11} /></a>
      ) : null}</Veld>
      <Veld label="Commodities">{(b.commodities ?? []).join(', ')}</Veld>
      <Veld label="Trade activity">{b.handel}</Veld>
      <Veld label="Verification score">{b.verificatie_score != null ? `${b.verificatie_score} / 100` : null}</Veld>
      <Veld label="Last verified">{b.geverifieerd_op ? tijdGeleden(b.geverifieerd_op, nu) : null}</Veld>
      <Veld label="Source">{b.bron_url ? (
        <a href={b.bron_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--accent-cyan)' }}>
          {mensLabel(b.bron_soort) !== 'Unknown' ? mensLabel(b.bron_soort) : 'Source'}<ExternalLink size={11} />
        </a>
      ) : mensLabel(b.bron_soort) !== 'Unknown' ? mensLabel(b.bron_soort) : null}</Veld>
      <Veld label="Active deals">{b.deals ?? 0}</Veld>
      <Veld label="Last contact">{b.laatste_contact ? tijdGeleden(b.laatste_contact, nu) : null}</Veld>

      <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
        Contacts ({(b.contacten ?? []).length})
      </div>
      {(b.contacten ?? []).length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No contacts recorded.</div>}
      <ul className="flex flex-col gap-2">
        {(b.contacten ?? []).map(c => (
          <li key={c.id} className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.025)' }}>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{c.naam || 'Unnamed'}</span>
              {c.primair && <Label toon="blauw">Primary</Label>}
            </div>
            {c.rol && <div className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>{c.rol}</div>}
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {c.email && <span className="inline-flex items-center gap-1"><Mail size={10} />{c.email}</span>}
              {c.telefoon && <span className="inline-flex items-center gap-1"><Phone size={10} />{c.telefoon}</span>}
            </div>
          </li>
        ))}
      </ul>

      {(b.checks ?? []).length > 0 && (
        <>
          <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Verification checks</div>
          <ul className="flex flex-col gap-1.5">
            {(b.checks ?? []).map(c => (
              <li key={c.id} className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                {mensLabel(c.soort)} · {mensLabel(c.status)}{c.checked_at ? ` · ${tijdGeleden(c.checked_at, nu)}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {b.notities && <div className="mt-4 whitespace-pre-wrap text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{b.notities}</div>}
    </DetailPaneel>
  );
}

export function TegenpartijenTab() {
  const { data, fout, bezig, ververs } = useNorthseaTab('tegenpartijen');
  const [zoek, setZoek] = useState('');
  const [soort, setSoort] = useState<typeof SOORTEN[number]>('alle');
  const [verificatie, setVerificatie] = useState<typeof VERIFICATIES[number]>('alle');
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const alle = useMemo(() => data?.bedrijven ?? [], [data]);
  const rijen = useMemo(() => filterBedrijven(alle, { zoek, soort, verificatie }), [alle, zoek, soort, verificatie]);
  const perSoort = useMemo(() => Object.fromEntries(tel(alle, b => b.soort).map(t => [t.sleutel, t.aantal])), [alle]);
  const perVerificatie = useMemo(() => Object.fromEntries(tel(alle, b => b.verificatie).map(t => [t.sleutel, t.aantal])), [alle]);
  const landen = useMemo(() => tel(alle, b => b.land), [alle]);
  const detail = gekozen ? alle.find(b => b.id === gekozen) ?? null : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2" data-axe-doel="northsea-tegenpartijen">
      <KengetalRij>
        <Kengetal waarde={data ? alle.length : '—'} label="Total counterparties" sub={data ? `${landen.length} countries` : undefined} toon="blauw" />
        <Kengetal waarde={data ? (perSoort.buyer ?? 0) : '—'} label="Buyers" />
        <Kengetal waarde={data ? (perSoort.supplier ?? 0) : '—'} label="Suppliers" />
        <Kengetal waarde={data ? (perSoort.both ?? 0) : '—'} label="Buyer & supplier" />
        <Kengetal waarde={data ? (perSoort.broker ?? 0) : '—'} label="Brokers" />
        <Kengetal waarde={data ? (perVerificatie.verified ?? 0) : '—'} label="Verified"
          /* Groen belooft 'geverifieerd'. Bij nul is er niets te beloven. */
          toon={(perVerificatie.verified ?? 0) > 0 ? 'groen' : 'grijs'}
          sub={data ? `${perVerificatie.reviewing ?? 0} in review` : undefined} />
      </KengetalRij>

      <Vlak vul titel={<span className="flex items-center gap-2"><Building2 size={15} style={{ color: '#A78BFA' }} />Counterparties</span>}
        sub="Companies and contacts in AXE Commodities. Public-source records stay unverified until checked."
        acties={(
          <>
            <div className="w-[240px]"><Zoekveld waarde={zoek} zet={setZoek} plaats="Search counterparties…" /></div>
            <VerversKnop bezig={bezig} ververs={ververs} />
          </>
        )}>
        <div className="flex flex-col gap-2 px-4 pb-2">
          <Filters<typeof SOORTEN[number]> opties={SOORTEN.filter(s => s === 'alle' || perSoort[s]).map(s => ({ id: s, label: s === 'alle' ? 'All types' : mensLabel(s), aantal: s === 'alle' ? alle.length : perSoort[s] }))}
            actief={soort} kies={setSoort} />
          <Filters<typeof VERIFICATIES[number]> opties={VERIFICATIES.filter(s => s === 'alle' || perVerificatie[s]).map(s => ({ id: s, label: s === 'alle' ? 'Any verification' : verificatieBadge(s).label, aantal: s === 'alle' ? undefined : perVerificatie[s] }))}
            actief={verificatie} kies={setVerificatie} />
        </div>
        {fout && <FoutRegel fout={fout} />}
        {!fout && !data && <LegeStaat titel="Loading counterparties…" />}
        {data && rijen.length === 0 && <LegeStaat titel="No counterparties match" uitleg="Change the filters or the search." />}
        {rijen.length > 0 && (
          <table className="w-full table-fixed border-collapse text-[12px]" style={{ minWidth: 860 }}>
            <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 120 }} /><col style={{ width: 150 }} /><col style={{ width: 128 }} /><col style={{ width: 64 }} /><col style={{ width: 96 }} /></colgroup>
            <thead className="sticky top-0 z-[1]" style={{ background: 'var(--axe-vak-vlak)' }}>
              <tr>{['Company', 'Type', 'Country', 'Commodities', 'Verification', 'Deals', 'Last contact'].map(k => (
                <th key={k} className="truncate px-3 py-1.5 text-left text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{k}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rijen.map(b => (
                <tr key={b.id} onClick={() => setGekozen(b.id)} className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.035)',
                    background: gekozen === b.id ? 'rgba(255,255,255,0.05)' : undefined,
                    boxShadow: gekozen === b.id ? 'inset 2px 0 0 var(--accent-cyan)' : undefined }}>
                  <td className="truncate px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }} title={b.naam ?? undefined}>{b.naam || '—'}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{mensLabel(b.soort)}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{b.land || '—'}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{(b.commodities ?? []).join(', ') || '—'}</td>
                  <td className="truncate px-3 py-2"><StatusChip badge={verificatieBadge(b.verificatie)} klein /></td>
                  <td className="truncate px-3 py-2 tabular-nums" style={{ color: 'var(--text-primary)' }}>{b.deals ?? 0}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-muted)' }}>{b.laatste_contact ? tijdGeleden(b.laatste_contact, nu) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Vlak>

      <TabRail kant="rechts" vast={!!detail}>
        {detail ? <Detail b={detail} nu={nu} sluit={() => setGekozen(null)} /> : (
          <DetailPaneel titel="Counterparty distribution" sub="Select a company for details">
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>By country</div>
            <div className="flex flex-col gap-1.5">
              {landen.slice(0, 10).map(l => (
                <div key={l.sleutel} className="flex items-center gap-2 text-[12px]">
                  <span className="w-[110px] truncate" style={{ color: 'var(--text-secondary)' }}>{l.sleutel}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${alle.length ? (l.aantal / alle.length) * 100 : 0}%`, background: '#A78BFA' }} />
                  </span>
                  <span className="w-6 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{l.aantal}</span>
                </div>
              ))}
              {data && landen.length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No countries recorded.</div>}
            </div>
          </DetailPaneel>
        )}
      </TabRail>
    </div>
  );
}
