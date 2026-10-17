/**
 * Read-only trading on the A17. Watchlist + sparkline from the lockscreen
 * snapshot (same gold 4,181 as Home). Positions from one shared cache.
 * No live desk chart (that polls candles/orders). Never a ticket.
 */
import { useEffect, useMemo, useState } from 'react';
import { recentCycles } from '@/application/tradingIntel/cycleJournalService';
import type { CycleRecord } from '@/domain/tradingIntel/cycleJournal';
import { marktVoorSymbool, prijsTekst, quoteVanMarkt, type PhoneQuote } from '@/domain/phone/phoneQuotes';
import { sparkLijn, sparkPunten } from '@/domain/phone/phoneGrafiek';
import {
  leesPhonePosities, leesPubliekeSpark, type PhonePositieStand,
} from '@/application/phone/phoneTradingBron';
import { lockscreenSnapshot, type LockscreenMarket } from '@/infrastructure/gateways/axeCoreApiService';
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

function PhoneSpark({ punten, symbol }: { punten: number[]; symbol: string }) {
  const w = 320;
  const h = 140;
  const pad = sparkLijn(punten, w, h);
  const last = punten[punten.length - 1];
  const first = punten[0];
  const omhoog = last >= first;
  return (
    <div
      className="mb-2.5 overflow-hidden rounded-2xl px-3 py-2.5"
      data-axe-phone-chart={symbol}
      style={{
        minHeight: 180,
        background: 'var(--axe-kaart-vlak, rgba(14,17,23,.82))',
        border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,.10))',
      }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{symbol}</span>
        {last != null && (
          <span className="text-[13px] tabular-nums" style={{ color: omhoog ? '#34d399' : '#f87171' }}>
            {prijsTekst(last)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[140px] w-full" aria-hidden="true">
        <path d={pad} fill="none" stroke={omhoog ? '#34d399' : '#f87171'} strokeWidth="2" />
      </svg>
    </div>
  );
}

export default function PhoneTrading() {
  const [seg, setSeg] = useState<Seg>('markets');
  const [sym, setSym] = useState('XAUUSD');
  const [quotes, setQuotes] = useState<PhoneQuote[]>(MARKTEN.map((s) => ({ symbol: s })));
  const [markets, setMarkets] = useState<LockscreenMarket[]>([]);
  const [publiek, setPubliek] = useState<Record<string, number[]>>({});
  const [pos, setPos] = useState<PhonePositieStand>({ soort: 'leeg' });
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [cycleFout, setCycleFout] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    void lockscreenSnapshot().then((s) => {
      if (weg) return;
      setMarkets(s.markets);
      setQuotes(MARKTEN.map((naam) => quoteVanMarkt(naam, marktVoorSymbool(s.markets, naam))));
    }).catch(() => {
      if (!weg) setQuotes(MARKTEN.map((naam) => ({ symbol: naam })));
    });
    return () => { weg = true; };
  }, []);

  useEffect(() => {
    let weg = false;
    void leesPhonePosities().then((stand) => { if (!weg) setPos(stand); });
    void recentCycles(8).then((c) => { if (!weg) setCycles(c); }).catch(() => {
      if (!weg) setCycleFout('Cycle journal paused.');
    });
    return () => { weg = true; };
  }, []);

  useEffect(() => {
    const markt = marktVoorSymbool(markets, sym);
    const last = quotes.find((q) => q.symbol === sym)?.last;
    if (sparkPunten(markt?.spark, last).length >= 2 && (markt?.spark?.length ?? 0) >= 2) return;
    let weg = false;
    void leesPubliekeSpark(sym).then((punten) => {
      if (!weg) setPubliek((p) => ({ ...p, [sym]: punten }));
    });
    return () => { weg = true; };
  }, [sym, markets, quotes]);

  const chartPunten = useMemo(() => {
    const markt = marktVoorSymbool(markets, sym);
    const last = quotes.find((q) => q.symbol === sym)?.last;
    const uitSpark = sparkPunten(markt?.spark, undefined);
    if (uitSpark.length >= 2) return uitSpark;
    const uitPubliek = sparkPunten(publiek[sym], last);
    if (uitPubliek.length >= 2) return uitPubliek;
    return sparkPunten(undefined, last);
  }, [markets, publiek, quotes, sym]);

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

  const chart = chartPunten.length >= 2 ? (
    <PhoneSpark punten={chartPunten} symbol={sym} />
  ) : (
    <PhoneKaart kicker="Chart">
      <div className="flex min-h-[140px] items-center text-[12px]" style={{ color: 'var(--text-muted)' }} data-axe-phone-chart={sym}>
        Chart paused.
      </div>
    </PhoneKaart>
  );

  const positions = (
    <PhoneKaart kicker="Positions & P&L">
      {pos.soort === 'gepauzeerd' && (
        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{pos.tekst}</div>
      )}
      {pos.soort === 'leeg' && (
        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No open positions.</div>
      )}
      {pos.soort === 'rijen' && pos.rijen.map((r, i) => (
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
      {cycleFout && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{cycleFout}</div>}
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
