/**
 * Market Intel: de koersen die AXE CORE echt heeft.
 *
 * Dezelfde bron en dezelfde les als de kaartjes bovenin (DeskKaartjes.tsx):
 * fetchMarketSnapshot eindigt, als alle bronnen falen, in een VERZONNEN reeks.
 * `synthetic` is dus "geen prijs", nooit een koers. Nieuws, economische kalender
 * en flows hebben (september 2026) geen bron in AXE; die blokken zeggen dat,
 * in plaats van koppen of cijfers te verzinnen.
 */
import { useEffect, useState } from 'react';
import { LineChart, Newspaper, CalendarDays } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import { DetailPaneel, Kengetal, KengetalRij, LegeStaat, Vlak } from './bouwstenen';

interface Markt { symbool: string; label: string; eenheid: string; groep: 'Metals' | 'Energy' | 'Macro' }

const MARKTEN: readonly Markt[] = [
  { symbool: 'XCUUSD', label: 'Copper', eenheid: '', groep: 'Metals' },
  { symbool: 'XAUUSD', label: 'Gold', eenheid: '/ oz', groep: 'Metals' },
  { symbool: 'XAGUSD', label: 'Silver', eenheid: '/ oz', groep: 'Metals' },
  { symbool: 'BCOUSD', label: 'Brent Crude', eenheid: '/ bbl', groep: 'Energy' },
  { symbool: 'WTIUSD', label: 'WTI Crude', eenheid: '/ bbl', groep: 'Energy' },
  { symbool: 'DXY', label: 'US Dollar Index', eenheid: '', groep: 'Macro' },
];

const VERVERS_MS = 5 * 60_000;

type Koers = { last: number; pct: number | null; slot: number[]; bron: string } | 'geen' | null;

function Lijntje({ punten, kleur }: { punten: number[]; kleur: string }) {
  if (punten.length < 2) return null;
  const min = Math.min(...punten);
  const max = Math.max(...punten);
  const b = 96;
  const h = 26;
  const d = punten.map((p, i) => `${i ? 'L' : 'M'}${((i / (punten.length - 1)) * b).toFixed(1)},${(h - ((p - min) / (max - min || 1)) * h).toFixed(1)}`).join('');
  return (
    <svg width={b} height={h} className="overflow-visible" aria-hidden>
      <path d={`${d}L${b},${h}L0,${h}Z`} fill={kleur} opacity={0.12} />
      <path d={d} fill="none" stroke={kleur} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

const prijs = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 20 ? 4 : 2 });

export function MarktTab() {
  const [koersen, setKoersen] = useState<Record<string, Koers>>({});

  useEffect(() => {
    let weg = false;
    const haal = () => {
      for (const m of MARKTEN) {
        fetchMarketSnapshot(m.symbool, 'd1', { priority: 'background' })
          .then(s => {
            const echt = s.source !== 'synthetic' && Number.isFinite(s.last);
            if (!weg) {
              setKoersen(k => ({
                ...k,
                [m.symbool]: echt ? { last: s.last, pct: s.changePct ?? null, slot: s.bars.slice(-30).map(b => b.c), bron: String(s.source) } : 'geen',
              }));
            }
          })
          .catch(() => { if (!weg) setKoersen(k => ({ ...k, [m.symbool]: 'geen' })); });
      }
    };
    const eerste = setTimeout(haal, 0);
    const iv = setInterval(() => { if (!document.hidden) haal(); }, VERVERS_MS);
    return () => { weg = true; clearTimeout(eerste); clearInterval(iv); };
  }, []);

  const met = MARKTEN.filter(m => { const k = koersen[m.symbool]; return k && k !== 'geen'; });
  const zonder = MARKTEN.filter(m => koersen[m.symbool] === 'geen');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-2" data-axe-doel="northsea-markt">
      <KengetalRij>
        {MARKTEN.slice(0, 5).map(m => {
          const k = koersen[m.symbool];
          return (
            <Kengetal key={m.symbool} label={m.label}
              waarde={k === null || k === undefined ? '…' : k === 'geen' ? '—' : prijs(k.last)}
              sub={k && k !== 'geen' && k.pct !== null ? `${k.pct >= 0 ? '+' : ''}${k.pct.toFixed(2)}%` : k === 'geen' ? 'No price feed' : undefined}
              toon={k && k !== 'geen' && k.pct !== null ? (k.pct >= 0 ? 'groen' : 'rood') : undefined} />
          );
        })}
      </KengetalRij>

      <Vlak titel={<span className="flex items-center gap-2"><LineChart size={15} style={{ color: '#F472B6' }} />Commodity prices</span>}
        sub={`Daily data from AXE CORE's market data sources · ${met.length} of ${MARKTEN.length} with a live feed`}>
        <table className="w-full table-fixed border-collapse text-[12px]">
          <colgroup><col /><col style={{ width: 90 }} /><col style={{ width: 150 }} /><col style={{ width: 96 }} /><col style={{ width: 130 }} /><col style={{ width: 110 }} /></colgroup>
          <thead>
            <tr>{['Asset', 'Group', 'Price', '24h', 'Last 30 days', 'Source'].map(k => (
              <th key={k} className="truncate px-4 py-1.5 text-left text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{k}</th>
            ))}</tr>
          </thead>
          <tbody>
            {MARKTEN.map(m => {
              const k = koersen[m.symbool];
              const kleur = k && k !== 'geen' && (k.pct ?? 0) < 0 ? '#F87171' : '#34D399';
              return (
                <tr key={m.symbool} style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                  <td className="truncate px-4 py-2.5" style={{ color: 'var(--text-primary)' }}>{m.label} <span className="font-mono-data text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{m.symbool}</span></td>
                  <td className="truncate px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{m.groep}</td>
                  <td className="truncate px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {k === null || k === undefined ? <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
                      : k === 'geen' ? <span style={{ color: 'var(--text-muted)' }}>No price feed</span>
                        : <>{prijs(k.last)}{m.eenheid && <span className="ml-1 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{m.eenheid}</span>}</>}
                  </td>
                  <td className="truncate px-4 py-2.5 tabular-nums" style={{ color: k && k !== 'geen' && k.pct !== null ? kleur : 'var(--text-muted)' }}>
                    {k && k !== 'geen' && k.pct !== null ? `${k.pct >= 0 ? '+' : ''}${k.pct.toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5">{k && k !== 'geen' ? <Lijntje punten={k.slot} kleur={kleur} /> : null}</td>
                  <td className="truncate px-4 py-2.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{k && k !== 'geen' ? k.bron : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Vlak>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Vlak titel={<span className="flex items-center gap-2"><Newspaper size={15} style={{ color: 'var(--text-secondary)' }} />Key news</span>}>
          <LegeStaat titel="No commodity news source connected"
            uitleg="AXE CORE has no news feed for metals, energy or freight yet. Headlines appear here once a source is connected — none are made up in the meantime." />
        </Vlak>
        <Vlak titel={<span className="flex items-center gap-2"><CalendarDays size={15} style={{ color: 'var(--text-secondary)' }} />Economic calendar</span>}>
          <LegeStaat titel="No economic calendar source connected"
            uitleg="Events that move markets (inventories, central banks, PMIs) will show here when a calendar source is added to AXE CORE." />
        </Vlak>
      </div>

      <TabRail kant="rechts">
        <DetailPaneel titel="Watchlist" sub="Commodities relevant to your deals">
          <ul className="flex flex-col gap-2">
            {MARKTEN.map(m => {
              const k = koersen[m.symbool];
              return (
                <li key={m.symbool} className="flex items-center gap-2 text-[12px]">
                  <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{k && k !== 'geen' ? prijs(k.last) : '—'}</span>
                  <span className="w-[58px] text-right tabular-nums" style={{ color: k && k !== 'geen' && k.pct !== null ? ((k.pct ?? 0) >= 0 ? '#34D399' : '#F87171') : 'var(--text-muted)' }}>
                    {k && k !== 'geen' && k.pct !== null ? `${k.pct >= 0 ? '+' : ''}${k.pct.toFixed(2)}%` : k === 'geen' ? 'no feed' : '…'}
                  </span>
                </li>
              );
            })}
          </ul>
          {zonder.length > 0 && (
            <div className="mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              No live feed in AXE for: {zonder.map(m => m.label).join(', ')}.
            </div>
          )}
        </DetailPaneel>
      </TabRail>
    </div>
  );
}
