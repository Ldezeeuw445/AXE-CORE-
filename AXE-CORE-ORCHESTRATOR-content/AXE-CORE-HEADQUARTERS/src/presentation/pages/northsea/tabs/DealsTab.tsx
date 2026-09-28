/**
 * Active Deals: één deal van begin tot eind.
 *
 * Links de lijst, in het midden de deal: kop, de negen poorten
 * (DEAL_STATE_MACHINE.md), koper/leverancier/commodity/waarde, en daaronder
 * overzicht, tijdlijn en taken. Rechts de gereedheid en de tegenpartijen.
 *
 * ## Wat hier niet verzonnen wordt
 *
 * Het voorbeeld toont "$4,800,000 / month", "Buyer Verified" en een geplande
 * "Expected Close". In de data (september 2026) heeft geen enkele deal een
 * waarde, geen enkel bedrijf is geverifieerd en er is geen sluitdatum. Dus:
 * "No value recorded", de echte verificatiestatus (status.ts), en een poort is
 * alleen gehaald als hij expliciet `true` is.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Target } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { northseaActie, type NorthseaActie } from '@/infrastructure/gateways/axeCoreApiService';
import { isDealCode, tijdGeleden } from '@/domain/northsea/chase';
import { geld, getal } from '@/domain/northsea/desk';
import { alsLijst, geblokkeerdIn, past, pipelineKolom, PIPELINE_KOLOMMEN, type KolomId } from '@/domain/northsea/tabs/lijsten';
import {
  gebeurtenisToon, mensLabel, poortStappen, taakBadge, TOON_KLEUR, verificatieBadge,
} from '@/domain/northsea/tabs/status';
import { POORTEN, type BedrijfKort, type DealDetail } from '@/domain/northsea/tabs/typen';
import { blokkadeToon, eigenaarLabel } from '@/domain/northsea/engine';
import {
  DetailPaneel, Filters, FoutRegel, Kengetal, KengetalRij, Label, LegeStaat, StatusChip, Veld, VerversKnop, Vlak, WerkstroomHint, Zoekveld,
} from './bouwstenen';
import { useNorthseaTab } from './useNorthseaTab';
import { beoordeelKoppeling, berichtHoortBijDeal, isVolgendeActieVerlopen, koppelLabel, koppelToon } from '@/domain/northsea/koppeling';

type Filter = 'alle' | KolomId;
type Onderdeel = 'overzicht' | 'tijdlijn' | 'taken';

const code = (d: DealDetail) => (isDealCode(d.code) ? d.code!.trim() : `#${d.id.slice(0, 6)}`);
const prioriteitTekst = (c: DealDetail['code']) => {
  const t = c?.trim();
  return t && !isDealCode(t) ? t : null;
};
const kolomVan = (d: DealDetail) => pipelineKolom({ stage: d.stage, execution_state: d.execution_state, geblokkeerd: !!(d.blokkade ?? '').trim() });
const product = (d: DealDetail) => d.aanbod?.product || d.vraag?.product || mensLabel(d.aanbod?.commodity || d.vraag?.commodity);
const volume = (d: DealDetail) => getal(d.aanbod?.volume_mt) ?? getal(d.vraag?.volume_mt);
const mt = (n: number | null) => (n === null ? null : `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} MT`);

function Kaartje({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--axe-vak-lijn)' }}>
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>{titel}</div>
      {children}
    </div>
  );
}

function Partij({ b, rol }: { b: BedrijfKort | null | undefined; rol: string }) {
  if (!b?.naam) return <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No {rol.toLowerCase()} linked</div>;
  return (
    <>
      <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }} title={b.naam}>{b.naam}</div>
      <div className="truncate text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{[mensLabel(b.soort), b.stad, b.land].filter(x => x && x !== 'Unknown').join(' · ')}</div>
      <div className="mt-1.5"><StatusChip badge={verificatieBadge(b.verificatie)} klein /></div>
    </>
  );
}

function Poorten({ d }: { d: DealDetail }) {
  const stappen = poortStappen(POORTEN.map(p => d[p]));
  return (
    <div className="flex items-start gap-0 overflow-x-auto px-1 py-2">
      {stappen.map((s, i) => {
        const kleur = s.staat === 'gehaald' ? TOON_KLEUR.groen : s.staat === 'huidig' ? '#22D3EE' : 'rgba(255,255,255,0.18)';
        return (
          <div key={s.label} className="flex min-w-[76px] flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <span className="h-[2px] flex-1" style={{ background: i === 0 ? 'transparent' : stappen[i - 1].staat === 'gehaald' ? TOON_KLEUR.groen : 'rgba(255,255,255,0.10)' }} />
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
                style={{
                  border: `2px solid ${kleur}`,
                  background: s.staat === 'gehaald' ? `${TOON_KLEUR.groen}22` : s.staat === 'huidig' ? 'rgba(34,211,238,0.12)' : 'transparent',
                  color: s.staat === 'open' ? 'var(--text-muted)' : kleur,
                  boxShadow: s.staat === 'huidig' ? '0 0 10px rgba(34,211,238,0.35)' : undefined,
                }}>
                {s.staat === 'gehaald' ? '✓' : i + 1}
              </span>
              <span className="h-[2px] flex-1" style={{ background: i === stappen.length - 1 ? 'transparent' : s.staat === 'gehaald' ? TOON_KLEUR.groen : 'rgba(255,255,255,0.10)' }} />
            </div>
            <span className="text-[11px]" style={{ color: s.staat === 'open' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{s.label}</span>
            <span className="text-[9.5px]" style={{ color: 'var(--text-muted)' }}>{s.staat === 'gehaald' ? 'passed' : s.staat === 'huidig' ? 'current' : 'pending'}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Governed NorthSea-acties: AXE CORE als MCP-client van de NorthSea MCP
 * (backend/axe_api/northsea_gateway.py), dezelfde grens als ChatGPT/Claude al
 * gebruiken. Alleen lees-/onderzoeksacties op déze deal -- versturen,
 * goedkeuren en schrijven staan hier bewust niet als knop.
 */
type ActieStaat = { bezig: boolean; fout: string | null; resultaat: Record<string, unknown> | null };

function GovernedActions({ deal }: { deal: DealDetail }) {
  const [staten, setStaten] = useState<Record<string, ActieStaat>>({});
  const [open, setOpen] = useState<string | null>(null);

  const run = (key: string, actie: NorthseaActie, params: Record<string, unknown>) => {
    setStaten(s => ({ ...s, [key]: { bezig: true, fout: null, resultaat: null } }));
    setOpen(key);
    void northseaActie(actie, params).then(
      uit => setStaten(s => ({ ...s, [key]: { bezig: false, fout: null, resultaat: uit.result } })),
      e => setStaten(s => ({ ...s, [key]: { bezig: false, fout: e instanceof Error ? e.message : String(e), resultaat: null } })),
    );
  };

  const heeftBlokkade = !!(deal.huidige_blokkade || deal.blokkade || '').trim();
  const knoppen: Array<{ key: string; label: string; actie: NorthseaActie; params: Record<string, unknown> }> = [
    { key: 'next', label: 'Get next actions', actie: 'get_next_actions', params: { opportunity_id: deal.id } },
    ...(heeftBlokkade
      ? [{ key: 'blockers', label: 'Investigate blocker', actie: 'investigate_blockers' as const, params: { opportunity_id: deal.id } }]
      : []),
    { key: 'qualify', label: 'Qualify opportunity', actie: 'qualify_opportunity' as const, params: { opportunity_id: deal.id, depth: 'deep' } },
  ];
  const huidig = open ? staten[open] : undefined;

  return (
    <Kaartje titel="Governed NorthSea actions">
      <div className="flex flex-wrap gap-1.5">
        {knoppen.map(k => (
          <button key={k.key} type="button" onClick={() => run(k.key, k.actie, k.params)} disabled={staten[k.key]?.bezig}
            className="rounded-lg px-2.5 py-1 text-[11.5px]"
            style={{ border: '1px solid var(--axe-vak-lijn)', color: staten[k.key]?.bezig ? 'var(--text-muted)' : 'var(--accent-cyan)' }}>
            {staten[k.key]?.bezig ? 'Running…' : k.label}
          </button>
        ))}
      </div>
      {huidig && (
        <div className="mt-2 max-h-64 overflow-auto rounded-lg px-2.5 py-2 text-[11px]"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--axe-vak-lijn)' }}>
          {huidig.fout && <div style={{ color: '#F87171' }}>{huidig.fout}</div>}
          {huidig.resultaat && <pre className="whitespace-pre-wrap break-words font-mono-data">{JSON.stringify(huidig.resultaat, null, 2)}</pre>}
        </div>
      )}
      <div className="mt-1.5 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
        Read/research only, via the governed NorthSea boundary. Sending, approving and writing stay behind the existing approval screens.
      </div>
    </Kaartje>
  );
}

function Ring({ waarde }: { waarde: number | null | undefined }) {
  const r = 34;
  const omtrek = 2 * Math.PI * r;
  const v = waarde == null ? 0 : Math.max(0, Math.min(100, waarde));
  const kleur = waarde == null ? 'rgba(255,255,255,0.15)' : v >= 60 ? TOON_KLEUR.groen : v >= 35 ? '#2DD4BF' : TOON_KLEUR.geel;
  return (
    <svg width={88} height={88} viewBox="0 0 88 88" aria-label={waarde == null ? 'No readiness score' : `Readiness ${v}%`}>
      <circle cx={44} cy={44} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} />
      <circle cx={44} cy={44} r={r} fill="none" stroke={kleur} strokeWidth={8} strokeLinecap="round"
        strokeDasharray={`${(v / 100) * omtrek} ${omtrek}`} transform="rotate(-90 44 44)" />
      <text x={44} y={49} textAnchor="middle" fontSize={17} fontWeight={600} fill="var(--text-primary)">{waarde == null ? '—' : `${v}%`}</text>
    </svg>
  );
}

export function DealsTab({ startId, openComms }: { startId?: string | null; openComms?: (dealId: string) => void }) {
  const { data, fout, bezig, ververs } = useNorthseaTab('deals');
  const commsTab = useNorthseaTab('communicatie');
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const [gekozen, setGekozen] = useState<string | null>(startId ?? null);
  const [onderdeel, setOnderdeel] = useState<Onderdeel>('overzicht');
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const alle = useMemo(() => data?.deals ?? [], [data]);
  const perKolom = useMemo(() => {
    const m = new Map<KolomId, number>();
    for (const d of alle) m.set(kolomVan(d), (m.get(kolomVan(d)) ?? 0) + 1);
    return m;
  }, [alle]);
  const rijen = useMemo(
    () => alle.filter(d => (filter === 'alle' || kolomVan(d) === filter)
      && past(zoek, d.code, product(d), d.koper?.naam, d.leverancier?.naam, d.koper?.land, d.leverancier?.land, d.volgende)),
    [alle, filter, zoek],
  );
  const deal = (gekozen ? alle.find(d => d.id === gekozen) : null) ?? rijen[0] ?? null;
  const geblokkeerd = alle.filter(d => (d.blokkade ?? '').trim()).length;
  const akkoord = alle.filter(d => d.akkoord_nodig).length;
  const openTaken = alle.reduce((s, d) => s + (d.aantallen?.taken ?? 0), 0);
  /* Uitvoerbaar is het einde van de trechter, niet een synoniem van "gematcht":
     de match-beoordeling zegt het pas als beide kanten rond zijn. Staat er als
     eigen tegel zodat 55 kansen nooit voor 55 deals kunnen doorgaan. */
  const uitvoerbaar = alle.filter(d => d.match?.uitvoerbaar === true).length;
  const kwalGeblokkeerd = geblokkeerdIn(
    alle.map(d => ({ stage: d.stage, execution_state: d.execution_state, geblokkeerd: !!(d.blokkade ?? '').trim() })),
    'kwalificatie',
  );
  const berichten = useMemo(() => commsTab.data?.berichten ?? [], [commsTab.data]);
  const oordelen = useMemo(() => new Map(berichten.map(b => [b.id, beoordeelKoppeling(b, alle, berichten)])), [berichten, alle]);
  const dealBerichten = useMemo(
    () => (deal ? berichten.filter(b => berichtHoortBijDeal(b, deal.id, oordelen.get(b.id))) : []),
    [deal, berichten, oordelen],
  );
  const kandidaatBerichten = useMemo(
    () => dealBerichten.filter(b => !b.deal_id),
    [dealBerichten],
  );
  const volgendeVerlopen = deal ? isVolgendeActieVerlopen(deal.volgende_op, nu) : false;
  const latereInbound = useMemo(() => {
    if (!deal?.updated_at) return [];
    const t = Date.parse(deal.updated_at);
    if (!Number.isFinite(t)) return [];
    return kandidaatBerichten.filter(b => b.richting === 'inbound' && Date.parse(b.occurred_at ?? '') > t);
  }, [deal, kandidaatBerichten]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2" data-axe-doel="northsea-deals-tab">
      <WerkstroomHint />
      <KengetalRij>
        <Kengetal waarde={data ? alle.length : '—'} label="Opportunities" sub="Not deals until executable" toon="blauw" />
        <Kengetal waarde={data ? (perKolom.get('kwalificatie') ?? 0) : '—'} label="Qualifying" toon="blauw"
          sub={data && kwalGeblokkeerd ? `${kwalGeblokkeerd} more under Blocked` : undefined} />
        <Kengetal waarde={data ? (perKolom.get('gematcht') ?? 0) : '—'} label="Matched" toon="geel" />
        <Kengetal waarde={data ? akkoord : '—'} label="Awaiting approval" toon="oranje" />
        <Kengetal waarde={data ? geblokkeerd : '—'} label="Blocked" toon="rood" />
        <Kengetal waarde={data ? uitvoerbaar : '—'} label="Executable" toon={uitvoerbaar ? 'groen' : 'grijs'}
          sub={data ? (uitvoerbaar ? 'Both sides confirmed' : 'None confirmed executable') : undefined} />
        <Kengetal waarde={data ? openTaken : '—'} label="Open deal tasks" />
      </KengetalRij>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(250px,320px)_1fr]">
        <Vlak vul titel={<span className="flex items-center gap-2"><Target size={15} style={{ color: '#34D399' }} />Active Deals ({alle.length})</span>}
          acties={<VerversKnop bezig={bezig} ververs={ververs} />}>
          <div className="flex flex-col gap-2 px-3 pb-2">
            <Zoekveld waarde={zoek} zet={setZoek} plaats="Search deals…" />
            <Filters<Filter> opties={[
              { id: 'alle', label: 'All', aantal: alle.length },
              ...PIPELINE_KOLOMMEN.filter(k => perKolom.get(k.id)).map(k => ({ id: k.id, label: k.label, aantal: perKolom.get(k.id) })),
            ]} actief={filter} kies={setFilter} />
          </div>
          {fout && <FoutRegel fout={fout} />}
          {!fout && !data && <LegeStaat titel="Loading deals…" />}
          {data && rijen.length === 0 && <LegeStaat titel="No deals match" />}
          <ul className="flex flex-col gap-1 px-2 pb-2">
            {rijen.map(d => {
              const aan = deal?.id === d.id;
              const kolom = PIPELINE_KOLOMMEN.find(k => k.id === kolomVan(d))!;
              return (
                <li key={d.id}>
                  <button type="button" onClick={() => { setGekozen(d.id); setOnderdeel('overzicht'); }}
                    className="flex w-full flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.03]"
                    style={{ background: aan ? 'rgba(255,255,255,0.05)' : undefined, border: `1px solid ${aan ? 'rgba(34,211,238,0.25)' : 'transparent'}` }}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono-data text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{code(d)}</span>
                      <span className="ml-auto"><Label toon={kolom.toon}>{kolom.label}</Label></span>
                    </span>
                    <span className="truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>{product(d)}</span>
                    <span className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      <span className="truncate">{[mt(volume(d)), d.vraag?.bestemming || d.koper?.land].filter(Boolean).join(' · ') || '—'}</span>
                      <span className="ml-auto shrink-0 tabular-nums">{d.gereedheid != null ? `${d.gereedheid}%` : ''}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Vlak>

        <Vlak vul>
          {!deal && data && <LegeStaat titel="Select a deal" />}
          {deal && (
            <div className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[20px] font-semibold" style={{ color: 'var(--text-primary)' }}>{code(deal)}</h2>
                  <div className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
                    {[product(deal), mt(volume(deal)), deal.vraag?.bestemming || deal.koper?.land].filter(Boolean).join(' – ')}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Label toon="blauw">{mensLabel(deal.execution_state || deal.stage)}</Label>
                    {deal.kwalificatie && <Label toon="grijs">Qualification: {mensLabel(deal.kwalificatie)}</Label>}
                    {prioriteitTekst(deal.code) && <Label toon="grijs">Priority: {mensLabel(prioriteitTekst(deal.code))}</Label>}
                    {deal.akkoord_nodig && <Label toon="oranje">Approval required{deal.akkoord_soort ? ` · ${mensLabel(deal.akkoord_soort)}` : ''}</Label>}
                    {(deal.huidige_blokkade || deal.blokkade || '').trim() && <Label toon="rood">Blocked</Label>}
                    {deal.actie_eigenaar && <Label toon="grijs">Owner: {eigenaarLabel(deal.actie_eigenaar)}</Label>}
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{deal.updated_at ? `Updated ${tijdGeleden(deal.updated_at, nu)}` : ''}</span>
                  </div>
                </div>
              </div>

              <Poorten d={deal} />

              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                <Kaartje titel="CURRENT BLOCKER">
                  <div className="text-[12.5px]" style={{ color: deal.huidige_blokkade || deal.blokkade ? TOON_KLEUR[blokkadeToon(deal.blokkade_code)] : 'var(--text-muted)' }}>
                    {(deal.huidige_blokkade || deal.blokkade || 'UNKNOWN / UNCONFIRMED').trim()}
                  </div>
                  {deal.blokkade_code && <div className="mt-1"><Label toon={blokkadeToon(deal.blokkade_code)}>{mensLabel(deal.blokkade_code)}</Label></div>}
                </Kaartje>
                <Kaartje titel="AXE NEXT BEST ACTION">
                  <div className="text-[12.5px]" style={{ color: deal.beste_actie || deal.volgende ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                    {(deal.beste_actie || deal.volgende || 'UNKNOWN / UNCONFIRMED').trim()}
                  </div>
                </Kaartje>
                <Kaartje titel="Owner / lifecycle">
                  <div className="text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{eigenaarLabel(deal.actie_eigenaar)}</div>
                  <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                    {[mensLabel(deal.stage), mensLabel(deal.execution_state)].filter(Boolean).join(' · ') || 'UNKNOWN / UNCONFIRMED'}
                  </div>
                </Kaartje>
              </div>

              <GovernedActions deal={deal} />

              {volgendeVerlopen && (
                <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.28)', color: '#FBBF24' }}>
                  Stored next action is overdue ({new Date(deal.volgende_op!).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}). Qualification is not changed from this screen.
                </div>
              )}
              {latereInbound.length > 0 && (
                <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.28)', color: '#93C5FD' }}>
                  {latereInbound.length} inbound message{latereInbound.length === 1 ? '' : 's'} arrived after the last deal update. Blocker and next action were not rewritten from that mail.
                </div>
              )}
              {kandidaatBerichten.length > 0 && (
                <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--axe-vak-lijn)' }}>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Unwritten communication matches</div>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {kandidaatBerichten.slice(0, 5).map(b => {
                      const k = oordelen.get(b.id);
                      return (
                        <li key={b.id} className="flex items-baseline gap-2 text-[12px]">
                          {k && <Label toon={koppelToon(k.klasse)}>{koppelLabel(k.klasse)}</Label>}
                          <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{b.onderwerp || '(no subject)'}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Shown as candidates. Opportunity_id is not written from the Desk.</div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 2xl:grid-cols-4">
                <Kaartje titel="Buyer">
                  <Partij b={deal.koper} rol="Buyer" />
                  <div className="mt-2 flex flex-col gap-0.5 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                    {mt(getal(deal.vraag?.volume_mt)) && <span>{mt(getal(deal.vraag?.volume_mt))}{deal.vraag?.frequentie ? ` / ${deal.vraag.frequentie}` : ''}</span>}
                    {deal.vraag?.incoterm && <span>{deal.vraag.incoterm}</span>}
                    {deal.vraag?.betaling && <span>{deal.vraag.betaling}</span>}
                  </div>
                </Kaartje>
                <Kaartje titel="Matched supplier">
                  <Partij b={deal.leverancier} rol="Supplier" />
                  <div className="mt-2 flex flex-col gap-0.5 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                    {deal.aanbod?.incoterm && <span>{deal.aanbod.incoterm}</span>}
                    {deal.aanbod?.betaling && <span>{deal.aanbod.betaling}</span>}
                    {deal.aanbod?.mandaat && <span>Mandate: {mensLabel(deal.aanbod.mandaat)}</span>}
                  </div>
                </Kaartje>
                <Kaartje titel="Commodity">
                  <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{product(deal)}</div>
                  <div className="mt-1 flex flex-col gap-0.5 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                    {(deal.aanbod?.grade || deal.vraag?.grade) && <span>{deal.aanbod?.grade || deal.vraag?.grade}</span>}
                    {getal(deal.aanbod?.zuiverheid ?? deal.vraag?.zuiverheid) !== null && <span>≥ {getal(deal.aanbod?.zuiverheid ?? deal.vraag?.zuiverheid)}%</span>}
                    {deal.aanbod?.herkomst && <span>Origin: {deal.aanbod.herkomst}</span>}
                    {deal.aanbod?.laadhaven && <span>Loading: {deal.aanbod.laadhaven}</span>}
                  </div>
                </Kaartje>
                <Kaartje titel="Deal value">
                  {getal(deal.waarde) !== null ? (
                    <div className="text-[18px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{geld(getal(deal.waarde)!, deal.valuta ?? 'USD')}</div>
                  ) : (
                    <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>No value recorded</div>
                  )}
                  <div className="mt-1 flex flex-col gap-0.5 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                    {deal.aanbod?.prijsbasis && <span>Price basis: {deal.aanbod.prijsbasis}</span>}
                    {getal(deal.commissie_bedrag) !== null
                      ? <span>Commission: {geld(getal(deal.commissie_bedrag)!, deal.valuta ?? 'USD')}</span>
                      : getal(deal.commissie_pct) !== null ? <span>Commission: {getal(deal.commissie_pct)}%</span> : <span style={{ color: 'var(--text-muted)' }}>No commission recorded</span>}
                    {deal.commissie_akkoord && <span>Agreement: {mensLabel(deal.commissie_akkoord)}</span>}
                  </div>
                </Kaartje>
              </div>

              <Filters<Onderdeel> opties={[
                { id: 'overzicht', label: 'Overview' },
                { id: 'tijdlijn', label: 'Timeline', aantal: (deal.gebeurtenissen ?? []).length },
                { id: 'taken', label: 'Tasks', aantal: (deal.taken ?? []).length },
              ]} actief={onderdeel} kies={setOnderdeel} />

              {onderdeel === 'overzicht' && (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <Kaartje titel="Deal summary">
                    <Veld label="Stage">{mensLabel(deal.stage)}</Veld>
                    <Veld label="Execution">{mensLabel(deal.execution_state)}</Veld>
                    <Veld label="Next action">{deal.beste_actie || deal.volgende}</Veld>
                    <Veld label="Owner">{deal.actie_eigenaar ? eigenaarLabel(deal.actie_eigenaar) : null}</Veld>
                    <Veld label="Next action due">{deal.volgende_op ? new Date(deal.volgende_op).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : null}</Veld>
                    <Veld label="Waiting since">{deal.wacht_sinds ? tijdGeleden(deal.wacht_sinds, nu) : null}</Veld>
                    <Veld label="Follow-ups sent">{deal.opvolgingen}</Veld>
                    <Veld label="Automation">{deal.automatisering ? mensLabel(deal.automatisering) : null}</Veld>
                    <Veld label="Created">{deal.created_at ? new Date(deal.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : null}</Veld>
                    {deal.notities && <div className="mt-2 whitespace-pre-wrap text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{deal.notities}</div>}
                  </Kaartje>
                  <Kaartje titel="Match assessment">
                    {deal.match ? (
                      <>
                        <Veld label="Match score">{deal.match.score != null ? `${deal.match.score} / 100` : null}</Veld>
                        <Veld label="Executable">{deal.match.uitvoerbaar == null ? null : deal.match.uitvoerbaar ? 'Yes' : 'No'}</Veld>
                        {alsLijst(deal.match.blokkades).length > 0 && (
                          <div className="mt-2">
                            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Blockers</div>
                            <ul className="mt-1 flex flex-col gap-0.5">{alsLijst(deal.match.blokkades).map((b, i) => <li key={i} className="text-[11.5px]" style={{ color: '#F87171' }}>• {b}</li>)}</ul>
                          </div>
                        )}
                        {alsLijst(deal.match.ontbreekt).length > 0 && (
                          <div className="mt-2">
                            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Missing information</div>
                            <ul className="mt-1 flex flex-col gap-0.5">{alsLijst(deal.match.ontbreekt).map((b, i) => <li key={i} className="text-[11.5px]" style={{ color: TOON_KLEUR.geel }}>• {b}</li>)}</ul>
                          </div>
                        )}
                      </>
                    ) : <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No match assessment recorded.</div>}
                  </Kaartje>
                </div>
              )}

              {onderdeel === 'tijdlijn' && (
                (deal.gebeurtenissen ?? []).length === 0 ? <LegeStaat titel="No events recorded for this deal" /> : (
                  <ul className="flex flex-col">
                    {(deal.gebeurtenissen ?? []).map(g => (
                      <li key={g.id} className="flex gap-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: TOON_KLEUR[gebeurtenisToon(g.soort)] }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[12.5px] font-medium" style={{ color: 'var(--text-primary)' }}>{mensLabel(g.soort)}</span>
                            <span className="ml-auto text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{g.created_at ? tijdGeleden(g.created_at, nu) : ''}</span>
                          </div>
                          {g.samenvatting && <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>{g.samenvatting}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {onderdeel === 'taken' && (
                (deal.taken ?? []).length === 0 ? <LegeStaat titel="No open tasks for this deal" /> : (
                  <ul className="flex flex-col gap-1.5">
                    {(deal.taken ?? []).map(t => (
                      <li key={`${t.bron}-${t.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.025)' }}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px]" style={{ color: 'var(--text-primary)' }}>{t.titel || mensLabel(t.soort)}</div>
                          <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {t.bron === 'taak' ? 'Deal task' : 'Action queue'}{t.soort ? ` · ${mensLabel(t.soort)}` : ''}{t.due_at ? ` · due ${tijdGeleden(t.due_at, nu)}` : ''}
                          </div>
                        </div>
                        <StatusChip badge={taakBadge(t, nu)} klein />
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          )}
        </Vlak>
      </div>

      <TabRail kant="rechts">
        {deal ? (
          <DetailPaneel titel="Deal readiness" sub={code(deal)}>
            <div className="flex items-center gap-3">
              <Ring waarde={deal.gereedheid} />
              <div className="flex flex-col gap-1 text-[11.5px]">
                {poortStappen(POORTEN.map(p => deal[p])).map(s => (
                  <span key={s.label} className="flex items-center gap-1.5" style={{ color: s.staat === 'open' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.staat === 'gehaald' ? TOON_KLEUR.groen : s.staat === 'huidig' ? '#22D3EE' : 'rgba(255,255,255,0.2)' }} />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Counterparties</div>
            <div className="flex flex-col gap-2">
              {([['Buyer', deal.koper], ['Supplier', deal.leverancier]] as const).map(([rol, b]) => (
                <div key={rol} className="rounded-xl px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.025)' }}>
                  <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{rol}</div>
                  <Partij b={b} rol={rol} />
                </div>
              ))}
            </div>
            <div className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Related</div>
            <Veld label="Communications">{deal.aantallen?.communicatie ?? 0}</Veld>
            {kandidaatBerichten.length > 0 && (
              <Veld label="Unwritten matches">{kandidaatBerichten.length}</Veld>
            )}
            <Veld label="Evidence">{deal.aantallen?.bewijs ?? 0}</Veld>
            <Veld label="Documents">{deal.aantallen?.documenten ?? 0}</Veld>
            <Veld label="Open tasks">{deal.aantallen?.taken ?? 0}</Veld>
            {openComms && (
              <button type="button" onClick={() => openComms(deal.id)} className="mt-2 inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--accent-cyan)' }}>
                Open communications <ArrowRight size={12} />
              </button>
            )}
            <div className="mt-3 rounded-xl px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.025)' }}>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Protected introduction</div>
              <div className="mt-1 text-[12px]" style={{ color: deal.poort_introductie === true ? '#34D399' : 'var(--text-secondary)' }}>
                {deal.poort_introductie === true ? 'Gate recorded as passed' : deal.poort_introductie === false ? 'CLOSED' : 'UNKNOWN / UNCONFIRMED'}
              </div>
              {deal.poort_introductie !== true && (
                <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  Identity disclosure, controlled introduction, SPA/signing, fee agreement and NCNDA/IMFPA stay human-approved. Not inferred from agent text.
                </div>
              )}
            </div>
            {(deal.beste_actie || deal.volgende) && (
              <div className="mt-3 flex items-start gap-1.5 text-[12px]" style={{ color: 'var(--accent-cyan)' }}>
                <ArrowRight size={13} className="mt-0.5 shrink-0" /><span>{deal.beste_actie || deal.volgende}</span>
              </div>
            )}
          </DetailPaneel>
        ) : (
          <DetailPaneel titel="Deal readiness" sub="Select a deal">
            <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{data ? 'No deal selected.' : 'Loading…'}</div>
          </DetailPaneel>
        )}
      </TabRail>
    </div>
  );
}
