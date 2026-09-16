/**
 * NorthSea Commodity desk -- de Maps-tab.
 *
 * ## De indeling, zoals Trading, Calendar en de Code Editor
 *
 * Links naast de composer: het NorthSea-menu als kale iconen (IcoonZuil), niet
 * meer als paneel dat je moet openschuiven. Rechts naast de composer: de
 * kaartlagen als schakelaars, alleen zolang de kaart openstaat. In de rechter
 * schuifbalk: AXE Chase, wat er achterna gezeten moet worden. In het midden:
 * de wereldkaart, direct op de plaat.
 *
 * Alles hier is echte data uit AXE Commodities (zie domain/northsea/chase.ts
 * en domain/northsea/kaart.ts voor de regels, backend/axe_api/northsea.py voor
 * de bron). Faalt het ophalen, dan staat dat er -- nooit een lijst die er echt
 * uitziet maar het niet is.
 */
import { useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import {
  Map as MapIcon, Target, TrendingUp, Building2, MessageSquare, LineChart,
  FileText, ShieldCheck, Workflow, FileBarChart, Crosshair, ArrowRight, AlertTriangle, RefreshCw,
  Route, Anchor, CloudLightning,
} from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { PlaatSlot } from '@/presentation/components/layout/PlaatSlots';
import { IcoonZuil, type ZuilItem } from '@/presentation/components/layout/IcoonZuil';
import { northseaOverzicht } from '@/infrastructure/gateways/axeCoreApiService';
import {
  chaseItems, chaseTellers, tijdGeleden,
  type ChaseItem, type ChaseToon, type NorthseaOverzicht,
} from '@/domain/northsea/chase';
import { bouwKaart } from '@/domain/northsea/kaart';
import { deskTellers } from '@/domain/northsea/desk';
import { WereldKaart, type KaartLaag } from './WereldKaart';
import { wereldkaart } from './kaartGeo';
import { DeskKaartjes } from './DeskKaartjes';
import { DealsTabel } from './DealsTabel';
import { KaartLegenda } from './KaartLegenda';
import { TopbalkSlot } from '@/presentation/components/layout/TopbalkSlot';
import { DealsTab } from './tabs/DealsTab';
import { PipelineTab } from './tabs/PipelineTab';
import { TegenpartijenTab } from './tabs/TegenpartijenTab';
import { CommunicatieTab } from './tabs/CommunicatieTab';
import { MarktTab } from './tabs/MarktTab';
import { DocumentenTab } from './tabs/DocumentenTab';
import { BewijsTab } from './tabs/BewijsTab';
import { AutomatiseringTab } from './tabs/AutomatiseringTab';
import { RapportenTab } from './tabs/RapportenTab';

type Tab = 'live' | 'deals' | 'pipeline' | 'tegenpartijen' | 'communicatie' | 'markt' | 'documenten' | 'bewijs' | 'automatisering' | 'rapporten';
type ChaseFilter = 'alle' | 'kritiek' | 'nieuw';

const TOON_KLEUR: Record<ChaseToon, string> = { rood: '#F87171', amber: '#FBBF24', groen: '#34D399' };
const VERVERS_MS = 60_000;
const CHASE_ZICHTBAAR = 7;

export default function NorthseaDesk() {
  const [data, setData] = useState<NorthseaOverzicht | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [tab, setTab] = useState<Tab>('live');
  const isMobile = useIsMobile();
  /** De deal die Active Deals opent, als je er vanuit Pipeline naartoe gaat. */
  const [dealStart, setDealStart] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChaseFilter>('alle');
  const [alles, setAlles] = useState(false);
  const [nu, setNu] = useState(() => Date.now());
  // Weer & verstoringen staat uit en is niet aan te zetten: er is nog geen bron.
  const [lagen, setLagen] = useState<Record<KaartLaag, boolean>>({
    routes: true, havens: true, tegenpartijen: true, weer: false,
  });

  const haal = async (vers = false) => {
    setBezig(true);
    try {
      setData(await northseaOverzicht(vers));
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
      setNu(Date.now());
    }
  };

  useEffect(() => {
    // Een tik uitgesteld, zoals AppsPage: haal() zet meteen `bezig`, en de
    // lintregel set-state-in-effect ziet niet dat dat buiten de render valt.
    const eerste = setTimeout(() => { void haal(); }, 0);
    const t = setInterval(() => { if (!document.hidden) void haal(); }, VERVERS_MS);
    return () => { clearTimeout(eerste); clearInterval(t); };
  }, []);

  const items = useMemo(() => (data ? chaseItems(data, nu) : []), [data, nu]);
  const tellers = chaseTellers(items);
  const desk = useMemo(() => (data?.kaart ? deskTellers(data.kaart, nu) : null), [data, nu]);
  // Dezelfde kaart als WereldKaart tekent, zodat de legenda bovenin, het
  // routes-kaartje en de lijnen allemaal hetzelfde tellen -- ook op de
  // tabbladen waar de kaart zelf niet openstaat.
  const kaart = useMemo(
    () => (data?.kaart ? bouwKaart(data.kaart, wereldkaart().middelpunten) : null),
    [data],
  );
  const gefilterd = items.filter(i => filter === 'alle' || (filter === 'kritiek' ? i.kritiek : i.nieuw));
  const zichtbaar = alles ? gefilterd : gefilterd.slice(0, CHASE_ZICHTBAAR);

  /* Elk menu-item zijn eigen kleur, zoals de trading-tabs: zonder kleur zijn het
     tien gelijke knopjes en onthoud je niet waar wat zit. De teller staat in de
     tooltip, want in deze strook is geen ruimte voor cijfers onder elk icoon. */
  const menu: ZuilItem[] = [
    { id: 'live', label: 'Live Map', kleur: '#22D3EE', icoon: <MapIcon size={17} /> },
    { id: 'deals', label: 'Active Deals', kleur: '#34D399', icoon: <Target size={17} />, uitleg: data ? `Active Deals · ${data.actief}` : undefined },
    { id: 'pipeline', label: 'Pipeline', kleur: '#FBBF24', icoon: <TrendingUp size={17} />, uitleg: data ? `Pipeline · ${data.pipeline}` : undefined },
    { id: 'tegenpartijen', label: 'Counterparties', kleur: '#A78BFA', icoon: <Building2 size={17} /> },
    { id: 'communicatie', label: 'Communications', kleur: '#60A5FA', icoon: <MessageSquare size={17} /> },
    { id: 'markt', label: 'Market Intel', kleur: '#F472B6', icoon: <LineChart size={17} /> },
    { id: 'documenten', label: 'Documents', kleur: '#94A3B8', icoon: <FileText size={17} /> },
    { id: 'bewijs', label: 'Evidence', kleur: '#2DD4BF', icoon: <ShieldCheck size={17} /> },
    { id: 'automatisering', label: 'Automation', kleur: '#FB923C', icoon: <Workflow size={17} /> },
    { id: 'rapporten', label: 'Reports', kleur: '#E2E8F0', icoon: <FileBarChart size={17} /> },
  ];

  const kaartLagen: ZuilItem[] = [
    { id: 'routes', label: 'Trade Routes', kleur: '#22D3EE', icoon: <Route size={17} />, aan: lagen.routes },
    { id: 'havens', label: 'Ports & Terminals', kleur: '#FBBF24', icoon: <Anchor size={17} />, aan: lagen.havens },
    { id: 'tegenpartijen', label: 'Counterparties', kleur: '#A78BFA', icoon: <Building2 size={17} />, aan: lagen.tegenpartijen },
    {
      id: 'weer', label: 'Weather & Disruptions', kleur: '#94A3B8', icoon: <CloudLightning size={17} />, aan: false, uit: true,
      uitleg: 'Weather & Disruptions — no data source connected yet',
    },
  ];

  // Op de telefoon werkt de desktop-slot-indeling niet: de tab-zuil, de dock met
  // de dealtabel en de rechter chase-strook portalen naar slots die op mobiel
  // verborgen zijn — je zag daardoor alleen de kaart. Hier een zelfstandige,
  // map-first mobiele indeling: een horizontale tab-balk bovenaan, en daaronder
  // de inhoud van het gekozen tabblad (Live Map met tegels/kaart/deals/chase, of
  // een van de negen datatabs op vol scherm).
  if (isMobile) {
    return (
      <div className="axe-tabruimte relative flex min-h-0 flex-1 flex-col">
        <div
          className="flex-none overflow-x-auto scrollbar-none px-2 pt-2 pb-2"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex w-max items-center gap-1.5">
            {menu.map(m => {
              const actief = tab === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTab(m.id as Tab)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium active:scale-95"
                  style={{
                    background: actief ? `${m.kleur}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${actief ? m.kleur : 'var(--border-subtle)'}`,
                    color: actief ? m.kleur : 'var(--text-secondary)',
                  }}
                >
                  <span className="flex-none" style={{ color: m.kleur }}>{m.icoon}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'live' ? (
          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
            <DeskKaartjes data={data} tellers={desk} routes={kaart ? kaart.routes.length : null} />
            <div className="px-2 pt-1">
              <div
                className="relative overflow-hidden rounded-xl"
                style={{ height: '44vh', border: '1px solid var(--border-subtle)' }}
              >
                <WereldKaart deals={fout ? null : data ? data.kaart : null} lagen={lagen} fout={fout} vrijVan="" />
              </div>
              <div className="mt-2">
                <KaartLegenda kaart={fout ? null : kaart} totaal={data?.kaart ? data.kaart.length : null} />
              </div>
            </div>
            <div className="px-2 pt-3">
              <DealsTabel deals={fout ? null : data?.kaart ?? null} tellers={desk} nu={nu} fout={fout} />
            </div>
            <div className="px-2 pt-3">
              <div className="axe-paneel" data-axe-doel="axe-chase">
                <div className="mb-3 flex items-center gap-2">
                  <Crosshair size={15} style={{ color: 'var(--accent-cyan)' }} />
                  <h2 className="flex-1 text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>AXE Chase</h2>
                  <button onClick={() => { void haal(true); }} disabled={bezig} title="Verversen" style={{ color: 'var(--text-muted)' }}>
                    <RefreshCw size={12} className={bezig ? 'animate-spin' : ''} />
                  </button>
                </div>
                <div className="mb-3 flex gap-1.5">
                  {([['alle', 'All', tellers.alle], ['kritiek', 'Critical', tellers.kritiek], ['nieuw', 'New', tellers.nieuw]] as const).map(([id, label, n]) => (
                    <button
                      key={id}
                      onClick={() => setFilter(id)}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px]"
                      style={{
                        background: filter === id ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: `1px solid ${filter === id ? 'rgba(34,211,238,0.30)' : 'var(--border-subtle)'}`,
                        color: filter === id ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {label}
                      <span className="rounded px-1 text-[10px] font-mono-data" style={{ background: 'rgba(255,255,255,0.06)' }}>{n}</span>
                    </button>
                  ))}
                </div>
                {fout && (
                  <div className="flex gap-2 rounded-lg bg-white/[0.03] p-2 text-[11px]" style={{ border: '1px solid rgba(248,113,113,0.35)', color: '#F87171' }}>
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>NorthSea-data niet op te halen: {fout}</span>
                  </div>
                )}
                {!fout && !data && <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Laden…</div>}
                {data && gefilterd.length === 0 && <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Niets om achterna te zitten.</div>}
                <ul className="flex flex-col gap-1">
                  {zichtbaar.map(i => <ChaseRegel key={i.id} item={i} nu={nu} />)}
                </ul>
                {gefilterd.length > CHASE_ZICHTBAAR && (
                  <button
                    onClick={() => setAlles(v => !v)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px]"
                    style={{ border: '1px solid rgba(34,211,238,0.20)', color: 'var(--accent-cyan)' }}
                  >
                    {alles ? 'Show fewer' : `View All Chase Actions (${gefilterd.length})`} <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'deals' ? (
              <DealsTab key={dealStart ?? 'deals'} startId={dealStart} />
            ) : tab === 'pipeline' ? (
              <PipelineTab openDeal={id => { setDealStart(id); setTab('deals'); }} />
            ) : tab === 'tegenpartijen' ? (
              <TegenpartijenTab />
            ) : tab === 'communicatie' ? (
              <CommunicatieTab />
            ) : tab === 'markt' ? (
              <MarktTab />
            ) : tab === 'documenten' ? (
              <DocumentenTab />
            ) : tab === 'bewijs' ? (
              <BewijsTab />
            ) : tab === 'automatisering' ? (
              <AutomatiseringTab />
            ) : (
              <RapportenTab />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="axe-tabruimte relative flex min-h-0 flex-1 flex-col">
      {/* Bovenin: losse kaartjes die doorschuiven. Boven de composer: de deals.
          De zuilen naast de composer blijven vrij voor wat er nog komt. */}
      <TopbalkSlot kant="links">
        <KaartLegenda kaart={fout ? null : kaart} totaal={data?.kaart ? data.kaart.length : null} />
      </TopbalkSlot>
      {/* Alleen op Live Map: elk tabblad heeft zijn eigen kengetallen, en twee
          rijen tegels boven elkaar laat je twee keer hetzelfde lezen. */}
      {tab === 'live' && <DeskKaartjes data={data} tellers={desk} routes={kaart ? kaart.routes.length : null} />}
      {/* De dealtabel ligt over de kaart heen; op de andere tabbladen zou hij de
          inhoud bedekken, en daar heeft elk tabblad zijn eigen lijst. */}
      {tab === 'live' && (
        <PlaatSlot slot="dock">
          <DealsTabel deals={fout ? null : data?.kaart ?? null} tellers={desk} nu={nu} fout={fout} />
        </PlaatSlot>
      )}

      <PlaatSlot slot="links">
        <IcoonZuil items={menu} actief={tab} kies={id => setTab(id as Tab)} rijen={3} />
      </PlaatSlot>

      {tab === 'live' && (
        <PlaatSlot slot="rechts">
          <IcoonZuil
            items={kaartLagen}
            actief=""
            kant="rechts"
            rijen={2}
            kies={id => setLagen(l => ({ ...l, [id]: !l[id as KaartLaag] }))}
          />
        </PlaatSlot>
      )}

      {/* AXE Chase hoort bij Live Map. De andere tabbladen zetten hun eigen
          detailpaneel in dezelfde rechter strook; twee portalen in één strook
          zouden onder elkaar staan. */}
      {tab === 'live' && (
      <TabRail kant="rechts">
        <div className="axe-paneel" data-axe-doel="axe-chase">
          <div className="flex items-center gap-2 mb-3">
            <Crosshair size={15} style={{ color: 'var(--accent-cyan)' }} />
            <h2 className="flex-1 text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>AXE Chase</h2>
            <button onClick={() => { void haal(true); }} disabled={bezig} title="Verversen" style={{ color: 'var(--text-muted)' }}>
              <RefreshCw size={12} className={bezig ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex gap-1.5 mb-3">
            {([['alle', 'All', tellers.alle], ['kritiek', 'Critical', tellers.kritiek], ['nieuw', 'New', tellers.nieuw]] as const).map(([id, label, n]) => (
              <button key={id} onClick={() => setFilter(id)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px]"
                style={{
                  background: filter === id ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: `1px solid ${filter === id ? 'rgba(34,211,238,0.30)' : 'var(--border-subtle)'}`,
                  color: filter === id ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                {label}
                <span className="rounded px-1 text-[10px] font-mono-data" style={{ background: 'rgba(255,255,255,0.06)' }}>{n}</span>
              </button>
            ))}
          </div>

          {fout && (
            <div className="flex gap-2 rounded-lg bg-white/[0.03] p-2 text-[11px]" style={{ border: '1px solid rgba(248,113,113,0.35)', color: '#F87171' }}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>NorthSea-data niet op te halen: {fout}</span>
            </div>
          )}
          {!fout && !data && <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Laden…</div>}
          {data && gefilterd.length === 0 && <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Niets om achterna te zitten.</div>}

          <ul className="flex flex-col gap-1">
            {zichtbaar.map(i => <ChaseRegel key={i.id} item={i} nu={nu} />)}
          </ul>

          {gefilterd.length > CHASE_ZICHTBAAR && (
            <button onClick={() => setAlles(v => !v)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px]"
              style={{ border: '1px solid rgba(34,211,238,0.20)', color: 'var(--accent-cyan)' }}>
              {alles ? 'Show fewer' : `View All Chase Actions (${gefilterd.length})`} <ArrowRight size={12} />
            </button>
          )}
        </div>
      </TabRail>
      )}

      {tab === 'live' ? (
        /* De kaart vult het midden, zonder vak: `data.kaart` ontbreekt als de
           lokale API van vóór de kaart is, en dan zegt de kaart dat zelf. */
        <div className="flex min-h-0 flex-1">
          <WereldKaart deals={fout ? null : data ? data.kaart : null} lagen={lagen} fout={fout}
            vrijVan="[data-axe-doel=northsea-deals]" />
        </div>
      ) : tab === 'deals' ? (
        /* `key`: vanuit Pipeline een andere deal openen maakt een verse Active
           Deals met die deal geselecteerd, in plaats van de oude keuze te houden. */
        <DealsTab key={dealStart ?? 'deals'} startId={dealStart} />
      ) : tab === 'pipeline' ? (
        <PipelineTab openDeal={id => { setDealStart(id); setTab('deals'); }} />
      ) : tab === 'tegenpartijen' ? (
        <TegenpartijenTab />
      ) : tab === 'communicatie' ? (
        <CommunicatieTab />
      ) : tab === 'markt' ? (
        <MarktTab />
      ) : tab === 'documenten' ? (
        <DocumentenTab />
      ) : tab === 'bewijs' ? (
        <BewijsTab />
      ) : tab === 'automatisering' ? (
        <AutomatiseringTab />
      ) : (
        <RapportenTab />
      )}
    </div>
  );
}

function ChaseRegel({ item, nu }: { item: ChaseItem; nu: number }) {
  const kleur = TOON_KLEUR[item.toon];
  return (
    <li className="flex gap-3 rounded-lg px-1.5 py-2" title={item.regel}>
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${kleur}1f`, color: kleur }}>
        {item.toon === 'rood' ? <AlertTriangle size={14} /> : item.toon === 'amber' ? <RefreshCw size={14} /> : <ShieldCheck size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="flex-1 truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{item.kop}</span>
          <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>{tijdGeleden(item.wanneer, nu)}</span>
        </div>
        <div className="truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>{item.regel}</div>
        <div className="truncate text-[12px]" style={{ color: kleur }}>{item.stand}</div>
      </div>
    </li>
  );
}
