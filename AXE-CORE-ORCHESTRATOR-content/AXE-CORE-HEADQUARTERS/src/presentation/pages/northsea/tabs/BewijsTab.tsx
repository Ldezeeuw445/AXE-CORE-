/**
 * Evidence: bewijs per deal en verificatiechecks, met een audit trail.
 *
 * De kleur komt uit bewijsBadge (status.ts): alleen een bevestiging uit de bron
 * zelf is groen. Van de 6 bewijsstukken (september 2026) is er één
 * `source_verified`; de rest is gedeeltelijk, alleen gezegd door de tegenpartij
 * of alleen openbaar — geel of grijs, nooit groen.
 */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { tijdGeleden } from '@/domain/northsea/chase';
import { past, tel } from '@/domain/northsea/tabs/lijsten';
import { bewijsBadge, mensLabel, TOON_KLEUR } from '@/domain/northsea/tabs/status';
import {
  DetailPaneel, Filters, FoutRegel, Kengetal, KengetalRij, LegeStaat, StatusChip, Veld, VerversKnop, Vlak, Zoekveld,
} from './bouwstenen';
import { useNorthseaTab } from './useNorthseaTab';

const isUrl = (s: string | null | undefined) => !!s && /^https?:\/\//i.test(s.trim());

export function BewijsTab() {
  const { data, fout, bezig, ververs } = useNorthseaTab('bewijs');
  const [zoek, setZoek] = useState('');
  const [kant, setKant] = useState('alle');
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const alle = useMemo(() => data?.bewijs ?? [], [data]);
  const checks = useMemo(() => data?.checks ?? [], [data]);
  const kanten = tel(alle, b => b.kant);
  const rijen = alle.filter(b => (kant === 'alle' || (b.kant ?? '(unknown)') === kant) && past(zoek, b.claim, b.soort, b.bron, b.deal_code, b.product));
  const tonen = tel(alle, b => bewijsBadge(b.verificatie).toon);
  const aantalToon = (t: string) => tonen.find(x => x.sleutel === t)?.aantal ?? 0;
  const detail = gekozen ? alle.find(b => b.id === gekozen) ?? null : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-[104px]" data-axe-doel="northsea-bewijs">
      <KengetalRij>
        <Kengetal waarde={data ? alle.length : '—'} label="Evidence items" toon="blauw" />
        <Kengetal waarde={data ? aantalToon('groen') : '—'} label="Source verified" toon="groen" />
        <Kengetal waarde={data ? aantalToon('geel') : '—'} label="Partial / stated" toon="geel" sub="Needs corroboration" />
        <Kengetal waarde={data ? aantalToon('grijs') : '—'} label="Unverified" sub="Public or unconfirmed" />
        <Kengetal waarde={data ? aantalToon('rood') : '—'} label="Contradicted" toon="rood" />
        <Kengetal waarde={data ? checks.length : '—'} label="Verification checks" />
      </KengetalRij>

      <Vlak vul titel={<span className="flex items-center gap-2"><ShieldCheck size={15} style={{ color: '#2DD4BF' }} />Evidence</span>}
        sub="Claims per deal with their source and verification. A gate passes only on explicit, source-supported evidence."
        acties={(
          <>
            <div className="w-[240px]"><Zoekveld waarde={zoek} zet={setZoek} plaats="Search evidence…" /></div>
            <VerversKnop bezig={bezig} ververs={ververs} />
          </>
        )}>
        <div className="px-4 pb-2">
          <Filters opties={[{ id: 'alle', label: 'All', aantal: alle.length }, ...kanten.map(k => ({ id: k.sleutel, label: mensLabel(k.sleutel), aantal: k.aantal }))]}
            actief={kant} kies={setKant} />
        </div>
        {fout && <FoutRegel fout={fout} />}
        {!fout && !data && <LegeStaat titel="Loading evidence…" />}
        {data && rijen.length === 0 && <LegeStaat icoon={<ShieldCheck size={22} />} titel={alle.length ? 'No evidence matches' : 'No evidence recorded yet'} />}
        {rijen.length > 0 && (
          <table className="w-full table-fixed border-collapse text-[12px]" style={{ minWidth: 760 }}>
            <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 90 }} /><col style={{ width: 96 }} /><col style={{ width: 200 }} /><col style={{ width: 90 }} /></colgroup>
            <thead className="sticky top-0 z-[1]" style={{ background: 'var(--axe-vak-vlak)' }}>
              <tr>{['Claim', 'Type', 'Side', 'Deal', 'Verification', 'Recorded'].map(k => (
                <th key={k} className="truncate px-3 py-1.5 text-left text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{k}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rijen.map(b => (
                <tr key={b.id} onClick={() => setGekozen(b.id)} className="cursor-pointer hover:bg-white/[0.03]"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.035)', background: gekozen === b.id ? 'rgba(34,211,238,0.06)' : undefined }}>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-primary)' }} title={b.claim ?? undefined}>{b.claim || '—'}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{mensLabel(b.soort)}</td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{mensLabel(b.kant)}</td>
                  <td className="truncate px-3 py-2 font-mono-data" style={{ color: 'var(--text-secondary)' }}>{b.deal_code || (b.deal_id ? `#${b.deal_id.slice(0, 6)}` : '—')}</td>
                  <td className="truncate px-3 py-2"><StatusChip badge={bewijsBadge(b.verificatie)} klein /></td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-muted)' }}>{b.created_at ? tijdGeleden(b.created_at, nu) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Vlak>

      <TabRail kant="rechts">
        {detail ? (
          <DetailPaneel titel={mensLabel(detail.soort)} sub={detail.deal_code || detail.product || undefined} sluit={() => setGekozen(null)}>
            <div className="mb-3"><StatusChip badge={bewijsBadge(detail.verificatie)} /></div>
            <div className="mb-3 whitespace-pre-wrap rounded-lg p-2.5 text-[12px]" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)' }}>
              {detail.claim || 'No claim text recorded.'}
            </div>
            <Veld label="Side">{mensLabel(detail.kant)}</Veld>
            <Veld label="Source type">{mensLabel(detail.bron_soort)}</Veld>
            <Veld label="Source">{isUrl(detail.bron) ? (
              <a href={detail.bron!.trim()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all" style={{ color: 'var(--accent-cyan)' }}>
                {detail.bron}<ExternalLink size={11} />
              </a>
            ) : detail.bron}</Veld>
            <Veld label="Deal">{detail.deal_code}</Veld>
            <Veld label="Product">{detail.product}</Veld>
            <Veld label="Verified">{detail.verified_at ? tijdGeleden(detail.verified_at, nu) : null}</Veld>
            <Veld label="Recorded">{detail.created_at ? tijdGeleden(detail.created_at, nu) : null}</Veld>
            {bewijsBadge(detail.verificatie).volgende && (
              <div className="mt-3 text-[11.5px]" style={{ color: TOON_KLEUR[bewijsBadge(detail.verificatie).toon] }}>
                Next: {bewijsBadge(detail.verificatie).volgende}
              </div>
            )}
          </DetailPaneel>
        ) : (
          <DetailPaneel titel="Verification checks" sub={`${checks.length} recorded`}>
            {checks.length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{data ? 'No verification checks recorded yet.' : 'Loading…'}</div>}
            <ul className="flex flex-col gap-2">
              {checks.map(c => (
                <li key={c.id} className="rounded-lg px-2 py-1.5 text-[12px]" style={{ background: 'rgba(255,255,255,0.025)' }}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{mensLabel(c.soort)}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{mensLabel(c.status)}</span>
                  </div>
                  <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {[c.bedrijf, c.contact].filter(Boolean).join(' · ') || '—'}{c.checked_at ? ` · ${tijdGeleden(c.checked_at, nu)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </DetailPaneel>
        )}
      </TabRail>
    </div>
  );
}
