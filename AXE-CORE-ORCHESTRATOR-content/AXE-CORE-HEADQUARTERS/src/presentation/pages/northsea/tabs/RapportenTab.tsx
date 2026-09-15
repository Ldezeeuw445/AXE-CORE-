/**
 * Reports: de desk in cijfers, uit de echte records.
 *
 * Alles hier komt uit één query (TAB_SQL["rapporten"]). Het voorbeeld toont omzet,
 * commissie en conversie in dollars; die staan niet in de data (geen enkele deal
 * heeft een waarde of commissiebedrag, september 2026), dus die panelen staan er
 * niet, en het scherm zegt waarom.
 */
import type { ReactNode } from 'react';
import { FileBarChart } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { bewijsBadge, mensLabel, TOON_KLEUR, verificatieBadge, type Toon } from '@/domain/northsea/tabs/status';
import type { Telling } from '@/domain/northsea/tabs/typen';
import { DetailPaneel, FoutRegel, Kengetal, KengetalRij, LegeStaat, VerversKnop, Vlak } from './bouwstenen';
import { useNorthseaTab } from './useNorthseaTab';

function Balken({ rijen, kleur, toon, max }: {
  rijen: ReadonlyArray<Telling>; kleur?: string; toon?: (sleutel: string) => Toon; max?: number;
}) {
  const groot = Math.max(1, ...rijen.map(r => r.aantal));
  const zichtbaar = max ? rijen.slice(0, max) : rijen;
  if (zichtbaar.length === 0) return <div className="px-4 pb-3 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No data.</div>;
  return (
    <div className="flex flex-col gap-1.5 px-4 pb-3">
      {zichtbaar.map(r => {
        const k = toon ? TOON_KLEUR[toon(r.sleutel)] : kleur ?? 'var(--accent-cyan)';
        return (
          <div key={r.sleutel} className="flex items-center gap-2 text-[12px]">
            <span className="w-[140px] truncate" style={{ color: 'var(--text-secondary)' }} title={r.sleutel}>{mensLabel(r.sleutel)}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <span className="block h-full rounded-full" style={{ width: `${(r.aantal / groot) * 100}%`, background: k }} />
            </span>
            <span className="w-8 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{r.aantal}</span>
          </div>
        );
      })}
    </div>
  );
}

function Blok({ titel, sub, children }: { titel: string; sub?: string; children: ReactNode }) {
  return <Vlak titel={titel} sub={sub}>{children}</Vlak>;
}

const gesorteerd = (r: ReadonlyArray<Telling>) => [...r].sort((a, b) => b.aantal - a.aantal);

export function RapportenTab() {
  const { data, fout, bezig, ververs } = useNorthseaTab('rapporten');
  const t = data?.totaal;
  const weken = data?.communicatie_weken ?? [];
  const grootsteWeek = Math.max(1, ...weken.map(w => w.inkomend + w.uitgaand + w.intern));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-2" data-axe-doel="northsea-rapporten">
      <KengetalRij>
        <Kengetal waarde={t ? t.deals : '—'} label="Open deals" toon="blauw" />
        <Kengetal waarde={t ? t.gewonnen : '—'} label="Closed (won)" toon="groen" />
        <Kengetal waarde={t ? t.bedrijven : '—'} label="Counterparties" sub={t ? `${t.contacten} contacts` : undefined} />
        <Kengetal waarde={t ? t.communicatie_30d : '—'} label="Messages · 30d" />
        <Kengetal waarde={t ? t.campagnes : '—'} label="Sourcing campaigns" toon="paars" />
        <Kengetal waarde={t ? t.waarde_ingevuld : '—'} label="Deals with a value" sub={t && t.waarde_ingevuld === 0 ? 'No values recorded' : undefined} />
      </KengetalRij>

      <div className="flex items-center gap-2 px-1">
        <FileBarChart size={15} style={{ color: '#E2E8F0' }} />
        <h2 className="flex-1 text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Reports</h2>
        <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Live from AXE Commodities</span>
        <VerversKnop bezig={bezig} ververs={ververs} />
      </div>
      {fout && <FoutRegel fout={fout} />}
      {!fout && !data && <LegeStaat titel="Loading reports…" />}

      {data && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Blok titel="Deals by execution state" sub="Open deals"><Balken rijen={gesorteerd(data.uitvoering)} kleur="#22D3EE" /></Blok>
          <Blok titel="Supply vs demand by commodity" sub="Supplier offers and buyer requirements">
            <div className="flex flex-col gap-2 px-4 pb-3">
              {data.commodities.length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No data.</div>}
              {[...data.commodities].sort((a, b) => (b.aanbod + b.vraag) - (a.aanbod + a.vraag)).map(c => {
                const groot = Math.max(1, ...data.commodities.map(x => Math.max(x.aanbod, x.vraag)));
                return (
                  <div key={c.sleutel} className="text-[12px]">
                    <div className="mb-0.5" style={{ color: 'var(--text-secondary)' }}>{mensLabel(c.sleutel)}</div>
                    {([['Supply', c.aanbod, '#34D399'], ['Demand', c.vraag, '#60A5FA']] as const).map(([label, n, k]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-[52px] text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <span className="block h-full rounded-full" style={{ width: `${(n / groot) * 100}%`, background: k }} />
                        </span>
                        <span className="w-8 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{n}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Blok>
          <Blok titel="Readiness" sub="Readiness score of open deals"><Balken rijen={data.gereedheid} kleur="#2DD4BF" /></Blok>
          <Blok titel="Counterparties by type"><Balken rijen={gesorteerd(data.bedrijf_soorten)} kleur="#A78BFA" /></Blok>
          <Blok titel="Counterparty verification" sub="Green only for verified">
            <Balken rijen={gesorteerd(data.bedrijf_verificatie)} toon={s => verificatieBadge(s).toon} />
          </Blok>
          <Blok titel="Top countries" sub="Counterparties per country"><Balken rijen={data.landen} kleur="#22D3EE" max={10} /></Blok>
          <Blok titel="Communication per week" sub="Last 12 weeks">
            <div className="flex h-[132px] items-end gap-1.5 px-4 pb-3">
              {weken.length === 0 && <div className="self-center text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No messages in the last 12 weeks.</div>}
              {weken.map(w => {
                const totaal = w.inkomend + w.uitgaand + w.intern;
                return (
                  <div key={w.week} className="flex flex-1 flex-col items-center gap-1" title={`Week of ${w.week}: ${w.inkomend} in · ${w.uitgaand} out · ${w.intern} internal`}>
                    <div className="flex w-full max-w-[28px] flex-col-reverse overflow-hidden rounded-md" style={{ height: `${(totaal / grootsteWeek) * 96}px` }}>
                      <span style={{ flex: w.inkomend, background: '#60A5FA' }} />
                      <span style={{ flex: w.uitgaand, background: '#94A3B8' }} />
                      <span style={{ flex: w.intern, background: '#A78BFA' }} />
                    </div>
                    <span className="text-[9.5px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{w.week.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </Blok>
          <Blok titel="Evidence by verification" sub="Green only when confirmed by the source">
            <Balken rijen={gesorteerd(data.bewijs)} toon={s => bewijsBadge(s).toon} />
          </Blok>
          <Blok titel="Tasks and actions" sub="deal_tasks and action_queue"><Balken rijen={gesorteerd(data.taken)} kleur="#FB923C" /></Blok>
        </div>
      )}

      <TabRail kant="rechts">
        <DetailPaneel titel="About these reports" sub="What is and is not in the data">
          <ul className="flex flex-col gap-2 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
            <li>Every figure is counted from AXE Commodities when you open this tab (refreshes every minute).</li>
            <li>
              Revenue, commission and deal value are not shown: {t ? `${t.waarde_ingevuld} deals have a value and ${t.commissie_bedragen} have a commission amount.` : 'loading…'}
            </li>
            <li>Verification and evidence use the NorthSea status colours: green only for verified or source-confirmed records.</li>
          </ul>
        </DetailPaneel>
      </TabRail>
    </div>
  );
}
