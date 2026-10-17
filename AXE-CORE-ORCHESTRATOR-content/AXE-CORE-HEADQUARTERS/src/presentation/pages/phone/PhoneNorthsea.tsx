/**
 * NorthSea pocket desk. Real deal cards, grouped, never send.
 */
import { useEffect, useMemo, useState } from 'react';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { rijenVanLijst } from '@/domain/agents/pendingApproval';
import { chaseItems, type NorthseaOverzicht } from '@/domain/northsea/chase';
import { groepeerTelefoonDeals } from '@/domain/phone/phoneDeals';
import { useNorthseaTab } from '@/presentation/pages/northsea/tabs/useNorthseaTab';
import { PhoneKaart, PhoneKop, PhoneRij, PhoneSeg } from '@/presentation/pages/phone/phoneUi';
import { northseaOverzicht } from '@/infrastructure/gateways/axeCoreApiService';

const SEGS = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'deals', label: 'Deals' },
  { id: 'network', label: 'Network' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'ok', label: 'OK' },
] as const;

type Seg = (typeof SEGS)[number]['id'];

export default function PhoneNorthsea() {
  const [seg, setSeg] = useState<Seg>('pipeline');
  const [dealId, setDealId] = useState<string | null>(null);
  const [overzicht, setOverzicht] = useState<NorthseaOverzicht | null>(null);
  const [overzichtFout, setOverzichtFout] = useState<string | null>(null);
  const [nu] = useState(() => Date.now());
  const pipeline = useNorthseaTab('pipeline');
  const tegen = useNorthseaTab('tegenpartijen');
  const server = useServerAgents();

  useEffect(() => {
    const t = setTimeout(() => {
      void northseaOverzicht().then((d) => { setOverzicht(d as unknown as NorthseaOverzicht); setOverzichtFout(null); }).catch((e) => {
        setOverzichtFout(e instanceof Error ? e.message : String(e));
      });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const deals = useMemo(() => pipeline.data?.deals ?? [], [pipeline.data]);
  const kaarten = useMemo(() => groepeerTelefoonDeals(deals, nu), [deals, nu]);
  const deal = deals.find((d) => d.id === dealId) ?? null;
  const chase = overzicht ? chaseItems(overzicht, nu) : [];
  const rijen = rijenVanLijst(server.approvals);

  return (
    <div className="flex w-full max-w-full flex-col overflow-x-hidden px-1 pt-1" data-axe-phone-app="northsea">
      <PhoneKop title="NorthSea" />
      <PhoneSeg items={SEGS} on={seg} onKies={(id) => setSeg(id as Seg)} />

      {seg === 'pipeline' && (
        <>
          {pipeline.fout && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{pipeline.fout}</p>}
          <div className="flex flex-col gap-2.5 pb-3">
            {kaarten.map((d) => (
              <button
                key={d.id}
                type="button"
                data-axe-deal={d.id}
                onClick={() => { setDealId(d.id); setSeg('deals'); }}
                className="w-full text-left"
              >
                <PhoneKaart>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        color: d.okNodig ? '#fbbf24' : '#67e8f9',
                        border: `1px solid ${d.okNodig ? 'rgba(251,191,36,.4)' : 'rgba(103,232,249,.25)'}`,
                      }}
                    >
                      {d.status}
                    </span>
                    {d.okNodig && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)' }}>
                        needs your OK
                      </span>
                    )}
                    {d.aantal > 1 && (
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{d.aantal} records</span>
                    )}
                  </div>
                  <div className="line-clamp-2 text-[15px] font-semibold leading-snug">{d.titel}</div>
                  <div className="mt-1 text-[12px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{d.tegenpartij}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {d.hoeveel && <span>{d.hoeveel}</span>}
                    {d.wanneer && <span>{d.wanneer}</span>}
                  </div>
                </PhoneKaart>
              </button>
            ))}
          </div>
          {!pipeline.bezig && kaarten.length === 0 && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No deals.</p>}
        </>
      )}

      {seg === 'deals' && (
        deal ? (
          <PhoneKaart kicker={deal.code || deal.id.slice(0, 8)}>
            <PhoneRij title="Product" sub={deal.product || deal.commodity || '—'} />
            <PhoneRij title="Stage" sub={String(deal.execution_state || deal.stage || '—')} />
            <PhoneRij title="Blocker" sub={deal.geblokkeerd ? 'Blocked' : 'None recorded'} />
            <PhoneRij title="Parties" sub={`${deal.leverancier || '—'} → ${deal.koper || '—'}`} />
            <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>Ask AXE in the composer. Send is not available on this phone.</p>
            <button type="button" className="mt-2 min-h-[44px] text-[13px]" onClick={() => setDealId(null)}>Back to list</button>
          </PhoneKaart>
        ) : (
          <div className="flex flex-col gap-2.5">
            {groepeerTelefoonDeals(deals, nu).map((d) => (
              <button key={d.id} type="button" onClick={() => setDealId(d.id)} className="w-full text-left">
                <PhoneKaart>
                  <div className="line-clamp-2 text-[14px] font-semibold">{d.titel}</div>
                  <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{d.status} · {d.tegenpartij}</div>
                </PhoneKaart>
              </button>
            ))}
          </div>
        )
      )}

      {seg === 'network' && (
        <PhoneKaart kicker="Counterparties">
          {tegen.fout && <div className="text-[12px]">{tegen.fout}</div>}
          {(tegen.data?.bedrijven ?? []).slice(0, 40).map((b, i) => (
            <PhoneRij key={b.id || `${b.naam ?? 'bedrijf'}-${i}`} title={b.naam || '—'} sub={[b.land, b.soort].filter(Boolean).join(' · ')} />
          ))}
        </PhoneKaart>
      )}

      {seg === 'drafts' && (
        <PhoneKaart kicker="Drafts — review only">
          {overzichtFout && <div className="text-[12px]">{overzichtFout}</div>}
          {(overzicht?.concepten ?? []).map((c) => (
            <PhoneRij key={c.id} title={c.titel || c.code || c.id} sub={c.status || 'draft'} />
          ))}
          {(overzicht?.concepten ?? []).length === 0 && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No drafts waiting.</div>}
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>Approved drafts stay here. This phone never sends.</p>
        </PhoneKaart>
      )}

      {seg === 'ok' && (
        <PhoneKaart kicker="Approvals">
          {rijen.length > 0 ? (
            <GoedkeuringActie
              touch
              rijen={rijen}
              onBeslis={(rij, akkoord) => {
                void beslisAgentOk({
                  akkoord,
                  rij,
                  reden: akkoord ? 'Approved on phone.' : 'Declined on phone.',
                }).then(verversServerAgents);
              }}
            />
          ) : (
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Nothing waiting on you.</div>
          )}
          {chase.filter((c) => c.akkoord).slice(0, 8).map((c) => (
            <PhoneRij key={c.id} title={c.kop} sub={c.regel} />
          ))}
        </PhoneKaart>
      )}
    </div>
  );
}
