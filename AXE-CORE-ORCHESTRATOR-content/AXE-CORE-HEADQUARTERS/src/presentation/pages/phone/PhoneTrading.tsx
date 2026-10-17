/**
 * Read-only trading app on the A17. Watchlist uses the lockscreen Markets
 * snapshot (same gold 4,181 as Home), plus chart, positions and algo.
 * Never opens a ticket and never calls order endpoints.
 */
import { useEffect, useState } from 'react';
import { CompanionChart } from '@/presentation/components/trading/companion/CompanionChart';
import { recentCycles } from '@/application/tradingIntel/cycleJournalService';
import type { CycleRecord } from '@/domain/tradingIntel/cycleJournal';
import { marktVoorSymbool, prijsTekst, quoteVanMarkt, type PhoneQuote } from '@/domain/phone/phoneQuotes';
import { lockscreenSnapshot } from '@/infrastructure/gateways/axeCoreApiService';
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
  const [quotes, setQuotes] = useState<PhoneQuote[]>(MARKTEN.map((s) => ({ symbol: s })));
  const [pos, setPos] = useState<{ ok: boolean; rijen: ReturnType<typeof positieRij>[]; fout?: string }>({ ok: true, rijen: [] });
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [cycleFout, setCycleFout] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    void lockscreenSnapshot().then((s) => {
      if (weg) return;
      setQuotes(MARKTEN.map((naam) => quoteVanMarkt(naam, marktVoorSymbool(s.markets, naam))));
    }).catch(() => {
      if (!weg) setQuotes(MARKTEN.map((naam) => ({ symbol: naam })));
    });
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

  const watchlist = (
    <PhoneKaart kicker="Watchlist">
      {quotes.map((q) => (
        <button
          key={q.symbol}
          type="button"
          data-axe-quote={q.symbol}
          onClick={() => openChart(q.symbol)}
          className="flex min-h-[48px] w-full items-center justify-between gap-3 border-t first:border-t-0"
          style={{ borderColor: 'rgba(255,255,255,.06)', color: 'var(--text-primary)' }}
        >
          <span className="text-[14px] font-semibold">{q.symbol}</span>
          <span
            className="text-[13px] tabular-nums"
            style={{ color: q.last == null ? 'var(--text-muted)' : (q.changePct ?? 0) < 0 ? '#f87171' : '#34d399' }}
          >
            {q.last != null
              ? `${prijsTekst(q.last)}${q.changePct != null ? ` ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : ''}`
              : 'No price'}
          </span>
        </button>
      ))}
    </PhoneKaart>
  );

  const chart = (
    <div className="mb-2.5 min-h-[240px] overflow-hidden rounded-2xl" data-axe-phone-chart={sym} style={{ height: 260 }}>
      <CompanionChart symbol={sym} timeframe="h1" readOnly className="h-full" />
    </div>
  );

  const positions = (
    <PhoneKaart kicker="Positions & P&L">
      {!pos.ok && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{pos.fout}</div>}
      {pos.ok && pos.rijen.length === 0 && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No open positions.</div>}
      {pos.rijen.map((r, i) => (
        <button key={`${r.symbol}-${i}`} type="button" onClick={() => openChart(r.symbol)} className="w-full text-left">
          <PhoneRij title={r.symbol} sub={`Vol ${r.volume}`} extra={<span className="text-[13px] tabular-nums">{r.pnl}</span>} />
        </button>
      ))}
    </PhoneKaart>
  );

  const algo = (
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
  );

  return (
    <div className="flex w-full max-w-full flex-col overflow-x-hidden px-1 pt-1" data-axe-phone-app="trading">
      <PhoneKop title="Trading" />
      <PhoneSeg items={SEGS} on={seg} onKies={(id) => setSeg(id as Seg)} />

      {seg === 'markets' && (
        <>
          {watchlist}
          {chart}
          {positions}
          {algo}
        </>
      )}
      {seg === 'chart' && chart}
      {seg === 'positions' && positions}
      {seg === 'algo' && algo}
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
