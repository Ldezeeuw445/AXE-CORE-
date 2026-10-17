/**
 * Read-only trading app on the A17. Watchlist, chart, positions, algo, intel.
 * Never opens a ticket and never calls order endpoints.
 */
import { useEffect, useState } from 'react';
import { CompanionChart } from '@/presentation/components/trading/companion/CompanionChart';
import { recentCycles } from '@/application/tradingIntel/cycleJournalService';
import type { CycleRecord } from '@/domain/tradingIntel/cycleJournal';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import { metaApiGetPositions } from '@/infrastructure/gateways/metaApiService';
import { PhoneKaart, PhoneKop, PhoneRij, PhoneSeg } from '@/presentation/pages/phone/phoneUi';

const MARKTEN = ['XAUUSD', 'BTCUSD', 'SPY', 'QQQ'] as const;
const SEGS = [
  { id: 'markets', label: 'Markets' },
  { id: 'chart', label: 'Chart' },
  { id: 'positions', label: 'Positions' },
  { id: 'algo', label: 'Algo' },
  { id: 'intel', label: 'Intel' },
] as const;

type Seg = (typeof SEGS)[number]['id'];

interface Quote {
  symbol: string;
  last?: number;
  changePct?: number;
  fout?: string;
}

function positieRij(raw: unknown): { symbol: string; volume: string; pnl: string } {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const symbol = String(o.symbol ?? o.symbolName ?? '—');
  const volume = String(o.volume ?? o.quantity ?? o.qty ?? '—');
  const pnl = String(o.profit ?? o.unrealizedProfit ?? o.floating ?? '—');
  return { symbol, volume, pnl };
}

export default function PhoneTrading() {
  const [seg, setSeg] = useState<Seg>('markets');
  const [sym, setSym] = useState('XAUUSD');
  const [quotes, setQuotes] = useState<Quote[]>(MARKTEN.map((s) => ({ symbol: s })));
  const [pos, setPos] = useState<{ ok: boolean; rijen: ReturnType<typeof positieRij>[]; fout?: string }>({ ok: true, rijen: [] });
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [cycleFout, setCycleFout] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    void (async () => {
      const uit = await Promise.all(MARKTEN.map(async (s) => {
        try {
          const snap = await fetchMarketSnapshot(s, 'd1', { priority: 'background' });
          return { symbol: s, last: snap.last, changePct: snap.changePct } satisfies Quote;
        } catch (e) {
          return { symbol: s, fout: e instanceof Error ? e.message : String(e) } satisfies Quote;
        }
      }));
      if (!weg) setQuotes(uit);
    })();
    return () => { weg = true; };
  }, []);

  useEffect(() => {
    let weg = false;
    void metaApiGetPositions().then((r) => {
      if (weg) return;
      if (!r.ok) setPos({ ok: false, rijen: [], fout: r.error });
      else setPos({ ok: true, rijen: r.positions.map(positieRij) });
    });
    void recentCycles(8).then((c) => { if (!weg) setCycles(c); }).catch((e) => {
      if (!weg) setCycleFout(e instanceof Error ? e.message : String(e));
    });
    return () => { weg = true; };
  }, []);

  const openChart = (s: string) => { setSym(s); setSeg('chart'); };

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-auto px-1" data-axe-phone-app="trading">
      <PhoneKop title="Trading" extra={<span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Read-only</span>} />
      <PhoneSeg items={SEGS} on={seg} onKies={(id) => setSeg(id as Seg)} />

      {seg === 'markets' && (
        <PhoneKaart kicker="Watchlist">
          {quotes.map((q) => (
            <button
              key={q.symbol}
              type="button"
              data-axe-quote={q.symbol}
              onClick={() => openChart(q.symbol)}
              className="flex min-h-[44px] w-full items-center justify-between border-t first:border-t-0"
              style={{ borderColor: 'rgba(255,255,255,.06)', color: 'var(--text-primary)' }}
            >
              <span className="text-[13px] font-semibold">{q.symbol}</span>
              <span className="text-[12px]" style={{ color: (q.changePct ?? 0) < 0 ? '#f87171' : '#34d399' }}>
                {q.fout ? q.fout : q.last != null ? `${q.last.toFixed(2)} ${q.changePct != null ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : ''}` : '…'}
              </span>
            </button>
          ))}
        </PhoneKaart>
      )}

      {seg === 'chart' && (
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl" data-axe-phone-chart={sym} style={{ minHeight: 360 }}>
          <CompanionChart symbol={sym} timeframe="d1" readOnly className="h-full" />
        </div>
      )}

      {seg === 'positions' && (
        <PhoneKaart kicker="Open positions">
          {!pos.ok && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{pos.fout}</div>}
          {pos.ok && pos.rijen.length === 0 && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No open positions.</div>}
          {pos.rijen.map((r, i) => (
            <button key={`${r.symbol}-${i}`} type="button" onClick={() => openChart(r.symbol)} className="w-full text-left">
              <PhoneRij title={r.symbol} sub={`Vol ${r.volume}`} extra={<span className="text-[12px]">{r.pnl}</span>} />
            </button>
          ))}
        </PhoneKaart>
      )}

      {seg === 'algo' && (
        <PhoneKaart kicker="AXE Algo">
          <p className="mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            This phone cannot place, modify or close orders.
          </p>
          {cycleFout && <div className="text-[12px]">{cycleFout}</div>}
          {cycles[0] ? (
            <PhoneRij
              title={cycles[0].symbol}
              sub={`${cycles[0].strategy ?? 'no strategy'} · ${cycles[0].endedAt ? 'done' : 'running'}`}
            />
          ) : !cycleFout && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No cycle yet.</div>}
        </PhoneKaart>
      )}

      {seg === 'intel' && (
        <PhoneKaart kicker="Intel">
          <p className="mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Ask AXE about {sym} in the composer. No order tools on this phone.
          </p>
          {cycles.slice(0, 4).map((c) => (
            <PhoneRij key={c.startedAt} title={c.symbol} sub={c.strategy ?? c.startedAt} />
          ))}
        </PhoneKaart>
      )}
    </div>
  );
}
