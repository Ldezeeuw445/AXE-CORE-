/**
 * NorthSea Commodity desk -- de Maps-tab.
 *
 * Links (de schuifbalk die met de muis naar buiten komt): het NorthSea-menu.
 * Rechts: AXE Chase, wat er achterna gezeten moet worden.
 * Het midden volgt de specificatie van Luka; tot die er is staat daar alleen
 * wat echt uit de database komt.
 *
 * Alles hier is echte data uit AXE Commodities (zie domain/northsea/chase.ts
 * voor de regels en backend/axe_api/northsea.py voor de bron). Faalt het
 * ophalen, dan staat dat er -- nooit een lijst die er echt uitziet maar het
 * niet is.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Map as MapIcon, Target, TrendingUp, Building2, MessageSquare, LineChart,
  FileText, ShieldCheck, Workflow, FileBarChart, Crosshair, ArrowRight, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { northseaOverzicht } from '@/infrastructure/gateways/axeCoreApiService';
import {
  chaseItems, chaseTellers, tijdGeleden,
  type ChaseItem, type ChaseToon, type NorthseaOverzicht,
} from '@/domain/northsea/chase';

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
  const [filter, setFilter] = useState<ChaseFilter>('alle');
  const [alles, setAlles] = useState(false);
  const [nu, setNu] = useState(() => Date.now());

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
  const gefilterd = items.filter(i => filter === 'alle' || (filter === 'kritiek' ? i.kritiek : i.nieuw));
  const zichtbaar = alles ? gefilterd : gefilterd.slice(0, CHASE_ZICHTBAAR);

  const menu: { id: Tab; label: string; icoon: ReactNode; teller?: number }[] = [
    { id: 'live', label: 'Live Map', icoon: <MapIcon size={16} /> },
    { id: 'deals', label: 'Active Deals', icoon: <Target size={16} />, teller: data?.actief },
    { id: 'pipeline', label: 'Pipeline', icoon: <TrendingUp size={16} />, teller: data?.pipeline },
    { id: 'tegenpartijen', label: 'Counterparties', icoon: <Building2 size={16} /> },
    { id: 'communicatie', label: 'Communications', icoon: <MessageSquare size={16} /> },
    { id: 'markt', label: 'Market Intel', icoon: <LineChart size={16} /> },
    { id: 'documenten', label: 'Documents', icoon: <FileText size={16} /> },
    { id: 'bewijs', label: 'Evidence', icoon: <ShieldCheck size={16} /> },
    { id: 'automatisering', label: 'Automation', icoon: <Workflow size={16} /> },
    { id: 'rapporten', label: 'Reports', icoon: <FileBarChart size={16} /> },
  ];
  const huidig = menu.find(m => m.id === tab)!;

  return (
    <div className="axe-tabruimte flex min-h-0 flex-1 flex-col">
      <TabRail kant="links">
        <div className="axe-paneel" data-axe-doel="northsea-menu">
          <h2 className="text-[17px] font-semibold mb-3" style={{ color: 'var(--text-primary)', letterSpacing: '0.01em' }}>NorthSea</h2>
          <nav className="flex flex-col gap-0.5" aria-label="NorthSea">
            {menu.map(m => {
              const actief = m.id === tab;
              return (
                <button key={m.id} onClick={() => setTab(m.id)}
                  className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors"
                  style={{
                    background: actief ? 'rgba(34,211,238,0.08)' : 'transparent',
                    color: actief ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  }}>
                  {actief && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded" style={{ background: 'var(--accent-cyan)' }} />}
                  <span style={{ color: actief ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{m.icoon}</span>
                  <span className="flex-1">{m.label}</span>
                  {m.teller != null && (
                    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-mono-data" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>{m.teller}</span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Geen foto: er is geen beeldbestand van NorthSea in de app, en een
              stockfoto van internet laden mag de app niet. Komt er een eigen
              beeld, dan hoort het hier als achtergrond. */}
          <div className="mt-4 rounded-xl p-3" style={{ background: 'linear-gradient(160deg, rgba(34,211,238,0.10), rgba(8,20,28,0.9) 60%)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="font-mono-data text-[10px]" style={{ color: 'var(--text-muted)' }}>Energy. Minerals. Opportunities.</div>
            <div className="font-mono-data text-[12px] mt-1" style={{ color: 'var(--text-primary)' }}>NorthSea Commodity Partners</div>
            <button onClick={() => setTab('pipeline')} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px]"
              style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}>
              Explore Opportunities <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </TabRail>

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
                  background: filter === id ? 'rgba(34,211,238,0.10)' : 'transparent',
                  border: `1px solid ${filter === id ? 'rgba(34,211,238,0.30)' : 'var(--border-subtle)'}`,
                  color: filter === id ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                {label}
                <span className="rounded px-1 text-[10px] font-mono-data" style={{ background: 'rgba(255,255,255,0.06)' }}>{n}</span>
              </button>
            ))}
          </div>

          {fout && (
            <div className="flex gap-2 rounded-lg p-2 text-[11px]" style={{ background: 'rgba(248,113,113,0.08)', color: '#F87171' }}>
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
              style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.20)', color: 'var(--accent-cyan)' }}>
              {alles ? 'Show fewer' : `View All Chase Actions (${gefilterd.length})`} <ArrowRight size={12} />
            </button>
          )}
        </div>
      </TabRail>

      {/* Het midden: de weergave volgt Luka's specificatie. Tot dan alleen
          wat er echt staat, zodat niemand op een verzonnen scherm werkt. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex items-center gap-2 text-[15px]" style={{ color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--accent-cyan)' }}>{huidig.icoon}</span> {huidig.label}
        </div>
        {data && (
          <div className="flex flex-wrap justify-center gap-4 text-[12px] font-mono-data" style={{ color: 'var(--text-secondary)' }}>
            <span>{data.pipeline} opportunities</span>
            <span>{data.actief} active</span>
            <span>{data.tellers.bedrijven} companies</span>
            <span>{data.tellers.contacten} contacts</span>
            <span>{data.tellers.communicatie_7d} messages · 7d</span>
            <span>{tellers.alle} chase actions</span>
          </div>
        )}
        <div className="text-[11px] max-w-md" style={{ color: 'var(--text-muted)' }}>
          Deze weergave wordt gebouwd volgens de NorthSea-specificatie.
        </div>
      </div>
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
